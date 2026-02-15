/**
 * Client-side chat service for querying documents over their TOC tree.
 *
 * Port of backend/openai_client.py `answer_question_over_tree`.
 * Uses the existing NearAIClient for LLM inference.
 */

import type { TOCResult } from "../pyodide/types";
import type { ChatMessage as NearAIChatMessage } from "../nearai";
import { getNearAIClient } from "../nearai";
import { flattenTreeForContext } from "./flattenTree";

/**
 * Chat message for the conversation history.
 */
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

/**
 * History entry sent to the LLM (role + content only).
 */
export interface HistoryEntry {
    role: "user" | "assistant";
    content: string;
}

const SYSTEM_PROMPT =
    "You are an expert assistant answering questions about a long document. " +
    "You are given a hierarchical PageIndex tree of the document. " +
    "Use ONLY the information implied by the tree titles, page indices, " +
    "and summaries. When unsure, explicitly say you are unsure instead " +
    "of hallucinating. Answer concisely but completely.";

/**
 * Ask a question about a document using its TOC tree as context.
 *
 * @param question   - The user's question
 * @param toc        - The decrypted TOCResult containing the document structure
 * @param history    - Optional prior conversation messages
 * @returns The assistant's answer string
 */
export async function answerQuestionOverTree(
    question: string,
    toc: TOCResult,
    history?: HistoryEntry[]
): Promise<string> {
    const client = getNearAIClient();
    if (!client) {
        throw new Error(
            "NEAR AI client not initialized. Please set your API key first."
        );
    }

    const contextStr = flattenTreeForContext(toc.structure);

    const messages: NearAIChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
    ];

    // Append chat history
    if (history && history.length > 0) {
        for (const msg of history) {
            if (msg.role && msg.content) {
                messages.push({ role: msg.role, content: msg.content });
            }
        }
    }

    // Build the user message with tree context
    const userContent =
        `Question: ${question}\n\n` +
        `Here is the PageIndex tree (a hierarchical table-of-contents with summaries):\n\n` +
        `${contextStr}\n\n` +
        `Please answer the question using this structure. If multiple sections ` +
        `are relevant, synthesize them. If the answer is not clearly supported ` +
        `by the tree, say that it is not specified.`;

    messages.push({ role: "user", content: userContent });

    return client.chatCompletion(messages);
}
