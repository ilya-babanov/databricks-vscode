import {Uri} from "vscode";
import * as glob from "glob";
import {merge} from "lodash";
import * as yaml from "yaml";
import path from "path";
import {BundleSchema} from "./BundleSchema";
import {readFile} from "fs/promises";
import {CachedValue} from "../utils/CachedValue";
import minimatch from "minimatch";

export async function parseBundleYaml(file: Uri) {
    const data = yaml.parse(await readFile(file.fsPath, "utf-8"));
    return data as BundleSchema;
}

export class BundleFileSet {
    private rootFilePattern: string = "{bundle,databricks}.{yaml,yml}";
    private _mergedBundle: CachedValue<BundleSchema> =
        new CachedValue<BundleSchema>(async () => {
            let bundle = {};
            await this.forEach(async (data) => {
                bundle = merge(bundle, data);
            });
            return bundle as BundleSchema;
        });

    constructor(private readonly workspaceRoot: Uri) {}

    async getRootFile() {
        const rootFile = await glob.glob(
            this.getAbsolutePath(this.rootFilePattern).fsPath
        );
        if (rootFile.length !== 1) {
            return undefined;
        }
        return Uri.file(rootFile[0]);
    }

    async getIncludedFilesGlob() {
        const rootFile = await this.getRootFile();
        if (rootFile === undefined) {
            return undefined;
        }
        const bundle = await parseBundleYaml(Uri.file(rootFile.fsPath));
        const includedFilesGlob =
            bundle?.include === undefined || bundle?.include.length === 0
                ? undefined
                : `{${bundle.include?.join(",")}}`;

        return includedFilesGlob;
    }

    async getIncludedFiles() {
        const includedFilesGlob = await this.getIncludedFilesGlob();
        if (includedFilesGlob !== undefined) {
            return (
                await glob.glob(
                    path.join(this.workspaceRoot.fsPath, includedFilesGlob)
                )
            ).map((i) => Uri.file(i));
        }
    }

    async allFiles() {
        const rootFile = await this.getRootFile();
        if (rootFile === undefined) {
            return [];
        }

        return [rootFile, ...((await this.getIncludedFiles()) ?? [])];
    }

    async findFileWithPredicate(predicate: (file: Uri) => Promise<boolean>) {
        const matchedFiles: Uri[] = [];
        for (const file of await this.allFiles()) {
            if (await predicate(file)) {
                matchedFiles.push(file);
            }
        }
        return matchedFiles;
    }

    async forEach(f: (data: BundleSchema, file: Uri) => Promise<void>) {
        for (const file of await this.allFiles()) {
            await f(await parseBundleYaml(file), file);
        }
    }

    getAbsolutePath(path: string | Uri) {
        if (typeof path === "string") {
            return Uri.joinPath(this.workspaceRoot, path);
        }
        return Uri.joinPath(this.workspaceRoot, path.fsPath);
    }

    public isRootBundleFile(e: Uri) {
        return minimatch(
            e.fsPath,
            this.getAbsolutePath(this.rootFilePattern).fsPath
        );
    }

    public async isIncludedBundleFile(e: Uri) {
        let includedFilesGlob = await this.getIncludedFilesGlob();
        if (includedFilesGlob === undefined) {
            return false;
        }
        includedFilesGlob = this.getAbsolutePath(includedFilesGlob).fsPath;
        return minimatch(e.fsPath, includedFilesGlob);
    }

    public async isBundleFile(e: Uri) {
        return this.isRootBundleFile(e) || (await this.isIncludedBundleFile(e));
    }

    async invalidateMergedBundleCache() {
        await this._mergedBundle.invalidate();
    }

    get mergedBundle() {
        return this._mergedBundle.value;
    }
}