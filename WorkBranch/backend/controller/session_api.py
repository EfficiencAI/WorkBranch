from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from singleton import get_session_service
from service.session_service.session import SessionService
from controller.VO.result import Result

router = APIRouter(prefix="/session", tags=["session"])


class UpdateSessionBody(BaseModel):
    active_conversation_id: Optional[str] = None


class CreateConversationBody(BaseModel):
    workspace_id: Optional[str] = None
    parent_conversation_id: Optional[str] = None


@router.post("/sessions")
def create_session(
    title: str = "新会话",
    service: SessionService = Depends(get_session_service),
) -> Result:
    session = service.create_session(title)
    return Result.success(data={
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "has_active_conversation": False,
        "active_conversation_id": session.active_conversation_id,
    })


@router.get("/sessions")
def list_sessions(
    service: SessionService = Depends(get_session_service),
) -> Result:
    sessions = service.list_sessions()
    return Result.success(data=[
        {
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
            "has_active_conversation": bool(s.active_conversation_id),
            "active_conversation_id": s.active_conversation_id,
        }
        for s in sessions
    ])


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int,
    service: SessionService = Depends(get_session_service),
) -> Result:
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return Result.success(data={
        "id": session.id,
        "user_id": session.user_id,
        "title": session.title,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "has_active_conversation": bool(session.active_conversation_id),
        "active_conversation_id": session.active_conversation_id,
    })


@router.get("/sessions/{session_id}/conversations")
def list_session_conversations(
    session_id: int,
    service: SessionService = Depends(get_session_service),
) -> Result:
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return Result.success(data=service.list_conversation_summaries(session_id))


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: int,
    body: UpdateSessionBody,
    service: SessionService = Depends(get_session_service),
) -> Result:
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.active_conversation_id is not None:
        conversation = service.get_persisted_conversation(body.active_conversation_id)
        if not conversation:
            raise HTTPException(status_code=400, detail="Conversation not found")
        if conversation.session_id != session_id:
            raise HTTPException(status_code=400, detail="Conversation does not belong to this session")

    updated_session = service.update_session_active_conversation(session_id, body.active_conversation_id)
    if not updated_session:
        raise HTTPException(status_code=404, detail="Session not found")

    return Result.success(data={
        "id": updated_session.id,
        "user_id": updated_session.user_id,
        "title": updated_session.title,
        "created_at": updated_session.created_at,
        "updated_at": updated_session.updated_at,
        "has_active_conversation": bool(updated_session.active_conversation_id),
        "active_conversation_id": updated_session.active_conversation_id,
    })


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    service: SessionService = Depends(get_session_service),
) -> Result:
    service.delete_session(session_id)
    return Result.success()


@router.post("/sessions/{session_id}/conversations")
async def create_conversation(
    session_id: int,
    body: CreateConversationBody,
    service: SessionService = Depends(get_session_service),
) -> Result:
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        result = await service.create_conversation(
            session_id=session_id,
            workspace_id=body.workspace_id,
            parent_conversation_id=body.parent_conversation_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Result.success(data=result)
