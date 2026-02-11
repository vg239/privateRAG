"""
Thin OpenAI chat client used for answering questions over PageIndex trees.

We:
- Use the official `openai` Python SDK.
- Always call the model specified in `settings.OPENAI_MODEL`
  (by default: gpt-4o-mini-search-preview-2025-03-11).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import asyncio
import logging

from openai import OpenAI

from config import settings
from pageindex_service import TreeType

logger = logging.getLogger(__name__)


_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
        logger.info("Initialized OpenAI client with model %s", settings.OPENAI_MODEL)
    return _client


def _flatten_tree_for_context(tree: TreeType, max_nodes: int = 32) -> str:
    """
    Flatten a PageIndex tree into a textual context that the model can reason over.

    We include:
    - title
    - node_id (if present)
    - page index / ranges
    - summary (if present)
    - a short prefix of text (if present)
    """

    def _iter_nodes(node: Dict[str, Any]) -> List[Dict[str, Any]]:
        nodes: List[Dict[str, Any]] = [node]
        children = node.get("nodes") or node.get("children") or []
        for child in children:
            if isinstance(child, dict):
                nodes.extend(_iter_nodes(child))
        return nodes

    flat_nodes: List[Dict[str, Any]] = []
    if isinstance(tree, list):
        for n in tree:
            if isinstance(n, dict):
                flat_nodes.extend(_iter_nodes(n))
    elif isinstance(tree, dict):
        flat_nodes.extend(_iter_nodes(tree))

    # Trim to at most `max_nodes` nodes to keep prompts bounded
    flat_nodes = flat_nodes[:max_nodes]

    lines: List[str] = []
    for idx, node in enumerate(flat_nodes, start=1):
        title = node.get("title") or "Untitled section"
        node_id = node.get("node_id") or node.get("id") or ""
        page_index = node.get("page_index")
        start_index = node.get("start_index")
        end_index = node.get("end_index")
        summary = node.get("summary") or node.get("text") or ""

        location_bits: List[str] = []
        if isinstance(page_index, int):
            location_bits.append(f"page_index={page_index}")
        if isinstance(start_index, int) and isinstance(end_index, int):
            location_bits.append(f"pages={start_index}-{end_index}")

        location = f" ({', '.join(location_bits)})" if location_bits else ""
        label = f"[{idx}] {title}{location}"
        if node_id:
            label += f" (node_id={node_id})"

        # Shorten very long summaries for safety
        if isinstance(summary, str) and len(summary) > 600:
            summary = summary[:600] + "..."

        lines.append(f"{label}\n{summary}\n")

    return "\n".join(lines)


async def answer_question_over_tree(
    question: str,
    tree: TreeType,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> str:
    """
    Ask OpenAI to answer a question using the provided PageIndex tree as context.

    `chat_history` is an optional list of prior messages:
    [{"role": "user"|"assistant", "content": "..."}]
    """
    client = _get_client()
    context_str = _flatten_tree_for_context(tree)

    system_prompt = (
        "You are an expert assistant answering questions about a long document. "
        "You are given a hierarchical PageIndex tree of the document. "
        "Use ONLY the information implied by the tree titles, page indices, "
        "and summaries. When unsure, explicitly say you are unsure instead "
        "of hallucinating. Answer concisely but completely."
    )

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if chat_history:
        for msg in chat_history:
            if "role" in msg and "content" in msg:
                messages.append({"role": msg["role"], "content": msg["content"]})

    user_content = (
        f"Question: {question}\n\n"
        "Here is the PageIndex tree (a hierarchical table-of-contents with summaries):\n\n"
        f"{context_str}\n\n"
        "Please answer the question using this structure. If multiple sections "
        "are relevant, synthesize them. If the answer is not clearly supported "
        "by the tree, say that it is not specified."
    )
    messages.append({"role": "user", "content": user_content})

    loop = asyncio.get_event_loop()

    def _call() -> str:
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,  # type: ignore[arg-type]
        )
        choice = response.choices[0]
        return choice.message.content or ""

    return await loop.run_in_executor(None, _call)

