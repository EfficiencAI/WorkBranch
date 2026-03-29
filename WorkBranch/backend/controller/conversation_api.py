import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from singleton import get_message_queue, get_session_service
from service.session_service.session import SessionService
from service.session_service.mq import MessageQueue, MessageType
from controller.VO.result import Result

router = APIRouter(prefix="/chat/conversations", tags=["conversations"])


class SendConversationMessageBody(BaseModel):
    message: str


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


@router.post("/{conversation_id}/messages")
async def send_conversation_message(
    conversation_id: str,
    body: SendConversationMessageBody,
    service: SessionService = Depends(get_session_service),
    mq: MessageQueue = Depends(get_message_queue),
) -> StreamingResponse:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        result = await service.send_message_to_conversation(
            conversation_id=conversation_id,
            message=body.message,
        )
        target_conversation_id = result["conversation_id"]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            await mq.start_consumer()

            done_received = False
            timeout_counter = 0
            max_timeout = 300

            while not done_received and timeout_counter < max_timeout:
                try:
                    message = await asyncio.wait_for(
                        mq._queue.get(),
                        timeout=1.0,
                    )

                    if message.conversation_id != target_conversation_id:
                        continue

                    event_data = {
                        "type": message.message_type.value,
                        "content": message.content,
                        "timestamp": message.timestamp.isoformat(),
                        "metadata": message.metadata,
                    }

                    yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"

                    if message.message_type == MessageType.DONE:
                        done_received = True

                    timeout_counter = 0

                except asyncio.TimeoutError:
                    timeout_counter += 1
                    yield f": heartbeat\n\n"

                    current = await service.get_conversation_detail(target_conversation_id)
                    if current and current.get("state") in ["completed", "failed", "cancelled"]:
                        done_received = True
                        yield f"data: {json.dumps({'type': 'done', 'content': ''}, ensure_ascii=False)}\n\n"

            if not done_received:
                yield f"data: {json.dumps({'type': 'error', 'content': 'Timeout'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
