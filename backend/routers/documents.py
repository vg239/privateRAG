import os
import tempfile
from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Depends
from fastapi.concurrency import run_in_threadpool

from auth_utils import get_current_wallet

from config import settings
from database.repositories import DocumentRepository
from nova_storage import nova_upload
from pageindex_service import generate_tree_from_pdf, infer_num_pages_from_tree
from schemas import DocumentResponse, DocumentListResponse


router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    current_wallet: str = Depends(get_current_wallet),
) -> DocumentResponse:
    """
    Upload a PDF document: store it on Nova (encrypted IPFS), generate its
    PageIndex tree, and persist both in the database.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    safe_name = file.filename.replace("/", "_").replace("\\", "_")
    content = await file.read()

    # ── Upload to Nova (encrypted IPFS) ──────────────────────────────────
    group_id = settings.NOVA_GROUP_ID
    if not group_id:
        raise HTTPException(
            status_code=500,
            detail="NOVA_GROUP_ID is not configured on the server",
        )

    try:
        nova_result = await nova_upload(group_id, content, safe_name)
        nova_cid = nova_result["cid"]
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Nova IPFS upload failed: {exc}",
        ) from exc

    # ── Create DB record in "indexing" state ──────────────────────────────
    doc_title = title or file.filename
    initial = await DocumentRepository.create(
        title=doc_title,
        nova_cid=nova_cid,
        status="indexing",
        owner_wallet=current_wallet,
    )

    # ── Generate PageIndex tree (needs a temp file on disk) ───────────────
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        tree = await run_in_threadpool(generate_tree_from_pdf, tmp_path)
        num_pages = infer_num_pages_from_tree(tree)

        updated = await DocumentRepository.update_after_indexing(
            document_id=initial["id"],
            status="ready",
            tree=tree,  # type: ignore[arg-type]
            num_pages=num_pages,
            owner_wallet=current_wallet,
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update document after indexing")
        return DocumentResponse(**updated)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        await DocumentRepository.update_after_indexing(
            document_id=initial["id"],
            status="failed",
            error_message=str(exc),
        )
        raise HTTPException(status_code=500, detail=f"PageIndex indexing failed: {exc}") from exc
    finally:
        # Clean up the temp file
        try:
            os.unlink(tmp_path)
        except (OSError, NameError):
            pass


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_wallet: str = Depends(get_current_wallet),
) -> DocumentListResponse:
    """Return a paginated list of all documents."""
    items = await DocumentRepository.list_for_owner(current_wallet, limit=limit, offset=offset)
    # For now we don't track total separately; approximate using returned count + offset.
    total = len(items) + offset
    return DocumentListResponse(
        total=total,
        items=[DocumentResponse(**item) for item in items],
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    wallet: str = Depends(get_current_wallet),
) -> DocumentResponse:
    """Return a single document for the current wallet."""
    doc = await DocumentRepository.get_by_id_for_owner(document_id, wallet)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse(**doc)

