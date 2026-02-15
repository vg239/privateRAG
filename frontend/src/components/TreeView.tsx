import type { PageIndexNode } from "../api/client";
import type { TOCNode } from "../lib/pyodide/types";
import "./TreeView.css";

type TreeNode = PageIndexNode | TOCNode;

type Props = {
  tree: TreeNode[] | TreeNode | null | undefined;
  showPanel?: boolean;
};

function NodeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const children = (node as PageIndexNode).nodes ?? [];
  const hasChildren = children.length > 0;

  const pageInfo = [];
  if (typeof (node as PageIndexNode).page_index === "number") {
    pageInfo.push(`p.${(node as PageIndexNode).page_index}`);
  }
  if (typeof node.start_index === "number") {
    if (typeof node.end_index === "number" && node.start_index !== node.end_index) {
      pageInfo.push(`${node.start_index}–${node.end_index}`);
    } else {
      pageInfo.push(`p.${node.start_index}`);
    }
  }

  const summary = (node as PageIndexNode).summary || (node as TOCNode).text_preview;

  return (
    <li className="tree-item">
      <div className="tree-item-content">
        <div className="tree-item-header">
          <span className={`tree-bullet depth-${Math.min(depth, 3)}`} />
          <span className="tree-title">{node.title ?? "Untitled"}</span>
          {pageInfo.length > 0 && (
            <span className="tree-pages">{pageInfo.join(", ")}</span>
          )}
        </div>
        {summary && (
          <p className="tree-preview">{summary.slice(0, 150)}...</p>
        )}
      </div>
      {hasChildren && (
        <ul className="tree-children">
          {children.map((child, idx) =>
            child ? (
              <NodeItem 
                key={(child as PageIndexNode).node_id ?? `${depth}-${idx}`} 
                node={child} 
                depth={depth + 1}
              />
            ) : null
          )}
        </ul>
      )}
    </li>
  );
}

export function TreeView({ tree, showPanel = true }: Props) {
  if (!tree) {
    if (showPanel) {
    return (
        <div className="tree-empty panel">
          <p>No tree available yet.</p>
      </div>
    );
    }
    return <p className="tree-empty-inline">No tree available.</p>;
  }

  const nodes = Array.isArray(tree) ? tree : [tree];

  const treeContent = (
    <ul className="tree-root">
      {nodes.map((n, idx) => (
        n ? <NodeItem key={(n as PageIndexNode).node_id ?? `root-${idx}`} node={n} depth={0} /> : null
      ))}
    </ul>
  );

  if (!showPanel) {
    return <div className="tree-view">{treeContent}</div>;
  }

  return (
    <div className="tree-view panel">
      <h3 className="panel-title">Document Structure</h3>
      {treeContent}
    </div>
  );
}
