
import networkx as nx
import matplotlib.pyplot as plt


def plot(dependencies, tables):
    G = nx.DiGraph()
    pos = nx.spring_layout(G, seed=3113794652)  # positions for all nodes

   
    for key in dependencies:
        G.add_node(key)
        deps = dependencies[key]
        for dep in deps:
            G.add_node(dep)
            G.add_edge(dep, key)

    color_map = []
    for node in G:
        if node in tables:
            color_map.append('gray')
        else: 
            color_map.append('green')      



    pos = nx.spring_layout(G)

    nx.draw(G, pos, with_labels=True, node_shape="s", node_size=1500, node_color=color_map)

    plt.tight_layout()
    plt.savefig("Graph.png", format="PNG")
    plt.show()
