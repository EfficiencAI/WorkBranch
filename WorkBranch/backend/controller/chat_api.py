import json
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from singleton import get_agent_service, get_message_queue
from service.agent_service import AgentService, ConversationStatus
from service.session_service.mq import MessageQueue
from controller.VO.result import Result

router = APIRouter(prefix="/chat", tags=["chat"])


class CreateConversationBody(BaseModel):
    workspace_id: Optional[str] = None
    session_id: Optional[str] = None


class SendMessageBody(BaseModel):
    message: str


@router.post("/conversations")
async def create_conversation(
    body: CreateConversationBody,
    service: AgentService = Depends(get_agent_service),
) -> Result:
    """创建新对话，返回对话 ID。"""
    conv_id = await service.create_conversation(
        workspace_id=body.workspace_id,
        session_id=body.session_id,
    )
    return Result.success(data={"conversation_id": conv_id})


@router.post("/conversations/{conv_id}/messages")
async def send_message(
    conv_id: str,
    body: SendMessageBody,
    service: AgentService = Depends(get_agent_service),
) -> Result:
    """向对话发送消息，立即返回（异步执行）。"""
    if service.get_status(conv_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await service.send_message(conv_id, body.message)
    return Result.success()


@router.get("/conversations")
def list_conversations(
    status: Optional[str] = None,
    service: AgentService = Depends(get_agent_service),
) -> Result:
    """列出所有对话，可按 status 过滤。"""
    filter_status = None
    if status:
        try:
            filter_status = ConversationStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status value: {status}")
    return Result.success(data=service.list_conversations(filter_status))


@router.get("/conversations/{conv_id}/status")
def get_status(
    conv_id: str,
    service: AgentService = Depends(get_agent_service),
) -> Result:
    """获取对话当前状态。"""
    status = service.get_status(conv_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return Result.success(data=status)


@router.get("/conversations/{conv_id}/result")
def get_result(
    conv_id: str,
    service: AgentService = Depends(get_agent_service),
) -> Result:
    """获取已完成对话的执行结果。"""
    if service.get_status(conv_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = service.get_result(conv_id)
    if result is None:
        return Result.success(data=None, message="Conversation not yet completed")
    return Result.success(data=result)


@router.delete("/conversations/{conv_id}")
def cancel_conversation(
    conv_id: str,
    service: AgentService = Depends(get_agent_service),
) -> Result:
    """取消正在运行的对话。"""
    if service.get_status(conv_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    cancelled = service.cancel_conversation(conv_id)
    return Result.success(data={"cancelled": cancelled})


@router.get("/conversations/{conv_id}/stream")
async def stream_conversation(
    conv_id: str,
    service: AgentService = Depends(get_agent_service),
    mq: MessageQueue = Depends(get_message_queue),
):
    """SSE 端点：实时推送对话消息流，直到收到 done/error 消息或超时。"""
    if service.get_status(conv_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    async def event_generator():
        sent = 0
        elapsed = 0.0
        timeout = 300.0
        interval = 0.1

        while elapsed < timeout:
            messages = mq._conversation_messages.get(conv_id, [])
            while sent < len(messages):
                msg = messages[sent]
                sent += 1
                yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
                if msg.get("message_type") in ("done", "error"):
                    return
            await asyncio.sleep(interval)
            elapsed += interval

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
