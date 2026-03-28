from fastapi import APIRouter, Depends, HTTPException

from singleton import get_session_service
from service.session_service.session import SessionService
from controller.VO.result import Result

router = APIRouter(prefix="/chat/conversations", tags=["conversations"])


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    service: SessionService = Depends(get_session_service),
) -> Result:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return Result.success(data=conversation)


@router.get("/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    service: SessionService = Depends(get_session_service),
) -> Result:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await service.get_conversation_messages(conversation_id)
    return Result.success(data=messages)
