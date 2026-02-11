import type { PageIndexNode } from "../api/client";

type Props = {
  tree: PageIndexNode[] | PageIndexNode | null | undefined;
};

function NodeItem({ node }: { node: PageIndexNode }) {
  const children = node.nodes ?? [];
  const hasChildren = children.length > 0;

  const locationBits: string[] = [];
  if (typeof node.page_index === "number") {
    locationBits.push(`p.${node.page_index}`);
  }
  if (
    typeof node.start_index === "number" &&
    typeof node.end_index === "number" &&
    node.start_index !== node.end_index
  ) {
    locationBits.push(`${node.start_index}–${node.end_index}`);
  }
  const location = locationBits.length ? ` (${locationBits.join(", ")})` : "";

  return (
    <li className="tree-node">
      <div className="tree-node-header">
        <span className="tree-node-title">
          {node.title ?? "Untitled"} {location}
        </span>
        {node.summary ? <span className="tree-node-summary">{node.summary}</span> : null}
      </div>
      {hasChildren ? (
        <ul className="tree-children">
          {children.map((child, idx) =>
            child ? <NodeItem key={child.node_id ?? `${idx}`} node={child} /> : null,
          )}
        </ul>
      ) : null}
    </li>
  );
}

export function TreeView({ tree }: Props) {
  if (!tree) {
    return (
      <div className="panel muted">
        <p>No tree available yet for this document.</p>
      </div>
    );
  }

  const nodes = Array.isArray(tree) ? tree : [tree];

  return (
    <div className="panel">
      <h3 className="panel-title">PageIndex tree</h3>
      <ul className="tree-root">
        {nodes.map((n, idx) => (n ? <NodeItem key={n.node_id ?? `${idx}`} node={n} /> : null))}
      </ul>
    </div>
  );
}

