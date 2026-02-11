"""
Document Repository - stores PageIndex trees and document metadata in Supabase.
"""
from typing import Optional, List, Dict, Any
import json
import logging

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

from database.connection import supabase

logger = logging.getLogger(__name__)


def _normalize_document_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize document row into a JSON-serializable dict."""
    if not result:
        return result

    # Parse tree JSON if stored as text
    if "tree" in result and result["tree"] is not None:
        if isinstance(result["tree"], str):
            try:
                result["tree"] = json.loads(result["tree"])
            except (json.JSONDecodeError, TypeError):
                # Leave as-is if parsing fails
                pass
    return result


class DocumentRepository:
    """Repository for PageIndex-document related database operations using Supabase."""

    @staticmethod
    async def create(
        title: str,
        file_path: str,
        status: str = "pending",
    ) -> Dict[str, Any]:
        """Create a new document record before indexing starts."""
        payload = {
            "title": title,
            "file_path": file_path,
            "status": status,
        }

        def _insert():
            # supabase-py returns a response with .data as a list of rows
            return supabase.table("documents").insert(payload).execute()

        response = await run_in_threadpool(_insert)

        if getattr(response, "error", None):
            logger.error(f"Error inserting document: {response.error}")
            raise HTTPException(status_code=500, detail="Failed to create document")

        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create document (no data returned)")

        return _normalize_document_result(rows[0])

    @staticmethod
    async def update_after_indexing(
        document_id: int,
        status: str,
        tree: Optional[Dict[str, Any]] = None,
        num_pages: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update document after indexing completes (success or failure)."""
        updates: Dict[str, Any] = {"status": status}

        if tree is not None:
            updates["tree"] = json.dumps(tree)

        if num_pages is not None:
            updates["num_pages"] = num_pages

        if error_message is not None and "tree" not in updates:
            updates["tree"] = json.dumps({"error": error_message})

        def _update():
            return supabase.table("documents").update(updates).eq("id", document_id).execute()

        response = await run_in_threadpool(_update)

        if getattr(response, "error", None):
            logger.error(f"Error updating document {document_id}: {response.error}")
            return None

        rows = response.data or []
        if not rows:
            return None

        return _normalize_document_result(rows[0])

    @staticmethod
    async def list_all(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Return a list of documents ordered by creation date (newest first)."""

        def _list():
            # Supabase range is inclusive, so end = offset + limit - 1
            return (
                supabase.table("documents")
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

        response = await run_in_threadpool(_list)

        if getattr(response, "error", None):
            logger.error(f"Error listing documents: {response.error}")
            return []

        rows = response.data or []
        return [_normalize_document_result(row) for row in rows]

    @staticmethod
    async def get_by_id(document_id: int) -> Optional[Dict[str, Any]]:
        """Get a single document by ID."""

        def _get():
            return (
                supabase.table("documents")
                .select("*")
                .eq("id", document_id)
                .single()
                .execute()
            )

        response = await run_in_threadpool(_get)

        if getattr(response, "error", None):
            logger.error(f"Error fetching document {document_id}: {response.error}")
            return None

        if not response.data:
            return None

        return _normalize_document_result(response.data)

