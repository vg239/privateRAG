from fastapi import APIRouter, HTTPException

from database.repositories import DocumentRepository
from openai_client import answer_question_over_tree
from schemas import ChatRequest, ChatResponse


router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Ask a question about a specific document using its stored PageIndex tree.
    """
    doc = await DocumentRepository.get_by_id(request.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.get("status") != "ready" or not doc.get("tree"):
        raise HTTPException(
            status_code=400,
            detail="Document is not ready for chat yet (indexing may still be running or failed).",
        )

    history_payload = None
    if request.history:
        history_payload = [{"role": m.role, "content": m.content} for m in request.history]

    answer = await answer_question_over_tree(
        question=request.question,
        tree=doc["tree"],
        chat_history=history_payload,
    )

    return ChatResponse(
        document_id=request.document_id,
        answer=answer,
    )

