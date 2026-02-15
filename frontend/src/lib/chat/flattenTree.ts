/**
 * Flatten a TOCNode tree into a textual context string for LLM consumption.
 *
 * Direct port of `_flatten_tree_for_context` from backend/openai_client.py.
 */

import type { TOCNode } from "../pyodide/types";

interface FlatNode {
    title: string;
    node_id?: string;
    start_index?: number;
    end_index?: number;
    summary?: string;
    text_preview?: string;
}

/**
 * Recursively collect all nodes from a TOCNode tree.
 */
function iterNodes(node: TOCNode): FlatNode[] {
    const nodes: FlatNode[] = [node];
    const children = node.nodes ?? [];
    for (const child of children) {
        nodes.push(...iterNodes(child));
    }
    return nodes;
}

/**
 * Flatten a TOCNode[] tree into a numbered text block suitable as LLM context.
 *
 * Includes title, node_id, page ranges, and summary/text_preview for each node.
 * Caps at `maxNodes` to keep prompts bounded.
 */
export function flattenTreeForContext(
    tree: TOCNode | TOCNode[],
    maxNodes = 32
): string {
    let flatNodes: FlatNode[] = [];

    if (Array.isArray(tree)) {
        for (const n of tree) {
            flatNodes.push(...iterNodes(n));
        }
    } else {
        flatNodes.push(...iterNodes(tree));
    }

    // Trim to at most maxNodes
    flatNodes = flatNodes.slice(0, maxNodes);

    const lines: string[] = [];

    for (let idx = 0; idx < flatNodes.length; idx++) {
        const node = flatNodes[idx];
        const title = node.title || "Untitled section";
        const nodeId = node.node_id ?? "";
        const startIndex = node.start_index;
        const endIndex = node.end_index;
        const summary = node.summary || node.text_preview || "";

        const locationBits: string[] = [];
        if (typeof startIndex === "number" && typeof endIndex === "number") {
            locationBits.push(`pages=${startIndex}-${endIndex}`);
        } else if (typeof startIndex === "number") {
            locationBits.push(`page_index=${startIndex}`);
        }

        const location = locationBits.length
            ? ` (${locationBits.join(", ")})`
            : "";
        let label = `[${idx + 1}] ${title}${location}`;
        if (nodeId) {
            label += ` (node_id=${nodeId})`;
        }

        // Shorten very long summaries
        const trimmed =
            typeof summary === "string" && summary.length > 600
                ? summary.slice(0, 600) + "..."
                : summary;

        lines.push(`${label}\n${trimmed}\n`);
    }

    return lines.join("\n");
}
