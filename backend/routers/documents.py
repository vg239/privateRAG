from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.concurrency import run_in_threadpool

from config import settings
from database.repositories import DocumentRepository
from pageindex_service import generate_tree_from_pdf, infer_num_pages_from_tree
from schemas import DocumentResponse, DocumentListResponse


router = APIRouter(prefix="/documents", tags=["documents"])

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _resolve_storage_path(filename: str) -> Path:
    """Resolve the absolute path where an uploaded PDF will be stored."""
    storage_root = Path(settings.DOCS_STORAGE_PATH)
    if not storage_root.is_absolute():
        storage_root = BACKEND_ROOT / storage_root
    storage_root.mkdir(parents=True, exist_ok=True)
    return storage_root / filename


@router.post("/", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(None),
) -> DocumentResponse:
    """
    Upload a PDF document, generate its PageIndex tree, and store both in Postgres.

    This endpoint is synchronous for simplicity: it returns once indexing is done.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    safe_name = file.filename.replace("/", "_").replace("\\", "_")
    storage_path = _resolve_storage_path(safe_name)

    # Persist the uploaded file to disk
    content = await file.read()
    storage_path.write_bytes(content)

    # Create the DB record in "indexing" state
    doc_title = title or file.filename
    initial = await DocumentRepository.create(
        title=doc_title,
        file_path=str(storage_path.relative_to(BACKEND_ROOT)),
        status="indexing",
    )

    try:
        # Run PageIndex generation in a worker thread so its internal asyncio.run()
        # does not conflict with FastAPI's running event loop.
        tree = await run_in_threadpool(generate_tree_from_pdf, str(storage_path))
        num_pages = infer_num_pages_from_tree(tree)

        updated = await DocumentRepository.update_after_indexing(
            document_id=initial["id"],
            status="ready",
            tree=tree,  # type: ignore[arg-type]
            num_pages=num_pages,
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update document after indexing")
        return DocumentResponse(**updated)
    except Exception as exc:  # pragma: no cover - defensive
        await DocumentRepository.update_after_indexing(
            document_id=initial["id"],
            status="failed",
            error_message=str(exc),
        )
        raise HTTPException(status_code=500, detail=f"PageIndex indexing failed: {exc}") from exc


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> DocumentListResponse:
    """Return a paginated list of all documents."""
    items = await DocumentRepository.list_all(limit=limit, offset=offset)
    # For now we don't track total separately; approximate using returned count + offset.
    total = len(items) + offset
    return DocumentListResponse(
        total=total,
        items=[DocumentResponse(**item) for item in items],
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: int) -> DocumentResponse:
    """Return a single document, including its stored PageIndex tree."""
    doc = await DocumentRepository.get_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse(**doc)

