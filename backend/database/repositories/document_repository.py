"""
Document Repository - stores PageIndex trees and document metadata in Supabase.
"""
from typing import Optional, List, Dict, Any
import json
import logging

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

from database.connection import supabase
from encryption_utils import encrypt_tree, decrypt_tree

logger = logging.getLogger(__name__)


def _normalize_document_result(result: Dict[str, Any], owner_wallet: Optional[str] = None) -> Dict[str, Any]:
    """Normalize document row into a JSON-serializable dict."""
    if not result:
        return result

    # Handle tree: decrypt if encrypted, or parse if JSON string (backward compatibility)
    if "tree" in result and result["tree"] is not None:
        tree_value = result["tree"]
        
        # If tree is already a dict, leave it as is (already decrypted/parsed)
        if isinstance(tree_value, dict):
            pass  # Already in correct format
        elif isinstance(tree_value, str):
            # Try to decrypt if we have owner_wallet (E2EE)
            if owner_wallet:
                decrypted = decrypt_tree(tree_value, owner_wallet)
                if decrypted is not None:
                    result["tree"] = decrypted
                else:
                    # Decryption failed, try parsing as JSON (backward compatibility)
                    try:
                        result["tree"] = json.loads(tree_value)
                    except (json.JSONDecodeError, TypeError):
                        # Leave as-is if parsing fails
                        pass
            else:
                # No owner_wallet, try parsing as JSON (backward compatibility)
                try:
                    result["tree"] = json.loads(tree_value)
                except (json.JSONDecodeError, TypeError):
                    # Leave as-is if parsing fails
                    pass
    
    return result


class DocumentRepository:
    """Repository for PageIndex-document related database operations using Supabase."""

    @staticmethod
    async def create(
        title: str,
        nova_cid: str,
        status: str = "pending",
        owner_wallet: str | None = None,
    ) -> Dict[str, Any]:
        """Create a new document record before indexing starts."""
        payload = {
            "title": title,
            "nova_cid": nova_cid,
            "status": status,
        }
        if owner_wallet:
            payload["owner_wallet"] = owner_wallet.lower()

        def _insert():
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
        owner_wallet: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update document after indexing completes (success or failure)."""
        updates: Dict[str, Any] = {"status": status}

        if tree is not None and owner_wallet:
            # Encrypt tree with wallet-specific key for E2EE
            encrypted_tree = encrypt_tree(tree, owner_wallet)
            updates["tree"] = encrypted_tree
        elif tree is not None:
            # Fallback: store unencrypted (for backward compatibility)
            updates["tree"] = tree

        if num_pages is not None:
            updates["num_pages"] = num_pages

        if error_message is not None and "tree" not in updates:
            updates["tree"] = {"error": error_message}

        def _update():
            return supabase.table("documents").update(updates).eq("id", document_id).execute()

        response = await run_in_threadpool(_update)

        if getattr(response, "error", None):
            logger.error(f"Error updating document {document_id}: {response.error}")
            return None

        rows = response.data or []
        if not rows:
            return None

        return _normalize_document_result(rows[0], owner_wallet=owner_wallet)

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
        
    @staticmethod
    async def list_for_owner(
        owner_wallet: str,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Return a list of documents for a specific wallet."""
        wallet = owner_wallet.lower()

        def _list():
            return (
                supabase.table("documents")
                .select("*")
                .eq("owner_wallet", wallet)
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

        response = await run_in_threadpool(_list)
        if getattr(response, "error", None):
            logger.error(f"Error listing documents for {wallet}: {response.error}")
            return []

        rows = response.data or []
        return [_normalize_document_result(row, owner_wallet=wallet) for row in rows]

    @staticmethod
    async def get_by_id_for_owner(
        document_id: int,
        owner_wallet: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a single document by ID for a specific wallet."""
        wallet = owner_wallet.lower()

        def _get():
            return (
                supabase.table("documents")
                .select("*")
                .eq("id", document_id)
                .eq("owner_wallet", wallet)
                .single()
                .execute()
            )

        response = await run_in_threadpool(_get)
        if getattr(response, "error", None) or not response.data:
            logger.error(f"Error fetching document {document_id} for {wallet}: {response.error}")
            return None

        return _normalize_document_result(response.data, owner_wallet=wallet)

