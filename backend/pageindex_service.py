"""
Integration with the open-source PageIndex library.

We use the local `pageindex` Python package (same as the
`VectifyAI/PageIndex` repo) to:
- Generate a PageIndex tree from a PDF using your OpenAI key/model.

No PageIndex cloud API or PageIndex API key is required – the library
talks directly to OpenAI via the `CHATGPT_API_KEY` environment variable,
which is automatically set from `settings.OPENAI_API_KEY` in `config.py`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Union, Optional
import logging
import os

from PageIndex.pageindex.page_index import page_index

from config import settings

logger = logging.getLogger(__name__)

TreeType = Union[List[Dict[str, Any]], Dict[str, Any]]


def _ensure_chatgpt_env() -> None:
    """
    Ensure the PageIndex library sees the OpenAI key via CHATGPT_API_KEY.

    `config.Settings` already mirrors OPENAI_API_KEY into this env var on import,
    but this helper is cheap and makes the intent explicit.
    """
    if settings.OPENAI_API_KEY and not os.getenv("CHATGPT_API_KEY"):
        os.environ["CHATGPT_API_KEY"] = settings.OPENAI_API_KEY


def generate_tree_from_pdf(pdf_path: str) -> TreeType:
    """
    Generate a PageIndex tree for the given PDF.

    This roughly mirrors `run_pageindex.py --pdf_path ...` from the
    official PageIndex repo, but runs in-process instead of as a CLI.
    """
    _ensure_chatgpt_env()

    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    if not pdf_path.lower().endswith(".pdf"):
        raise ValueError("PDF file must have .pdf extension")

    logger.info("Starting PageIndex tree generation for %s", pdf_path)

    # Use the high-level page_index() helper from the local PageIndex repo.
    # It internally uses ConfigLoader + config.yaml to build `opt` and then
    # calls page_index_main(doc, opt).
    result = page_index(
        doc=pdf_path,
        model=settings.OPENAI_MODEL,
        toc_check_page_num=settings.PAGEINDEX_TOC_CHECK_PAGES,
        max_page_num_each_node=settings.PAGEINDEX_MAX_PAGES_PER_NODE,
        max_token_num_each_node=settings.PAGEINDEX_MAX_TOKENS_PER_NODE,
        if_add_node_id=settings.PAGEINDEX_ADD_NODE_ID,
        if_add_node_summary=settings.PAGEINDEX_ADD_NODE_SUMMARY,
        if_add_doc_description=settings.PAGEINDEX_ADD_DOC_DESCRIPTION,
        if_add_node_text=settings.PAGEINDEX_ADD_NODE_TEXT,
    )

    # page_index() returns a dict with keys like "doc_name", "structure",
    # and optionally "doc_description". We store just the structure tree.
    tree: TreeType = result.get("structure", result)  # type: ignore[assignment]

    logger.info("Finished PageIndex tree generation for %s", pdf_path)
    return tree


def infer_num_pages_from_tree(tree: TreeType) -> Optional[int]:
    """
    Best-effort inference of total page count from the PageIndex tree.

    The open-source PageIndex examples show both `page_index` and
    `start_index`/`end_index` fields. We scan for the maximum of these.
    """

    def _walk(node: Dict[str, Any], acc: List[int]) -> None:
        if "page_index" in node and isinstance(node["page_index"], int):
            acc.append(node["page_index"])
        if "start_index" in node and isinstance(node["start_index"], int):
            acc.append(node["start_index"])
        if "end_index" in node and isinstance(node["end_index"], int):
            acc.append(node["end_index"])

        children = node.get("nodes") or node.get("children") or []
        for child in children:
            if isinstance(child, dict):
                _walk(child, acc)

    page_indices: List[int] = []

    if isinstance(tree, list):
        for n in tree:
            if isinstance(n, dict):
                _walk(n, page_indices)
    elif isinstance(tree, dict):
        _walk(tree, page_indices)

    if not page_indices:
        return None

    return max(page_indices) + 1 if min(page_indices) == 0 else max(page_indices)

