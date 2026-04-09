import asyncio
import json
import time
import traceback
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from controller.VO.result import Result
from core.logging import bind_ctx, get_ctx
from singleton import get_logging_runtime, get_message_queue, get_session_service
from service.session_service.mq import MessageQueue
from service.session_service.canonical import CanonicalMessage, SegmentType
from service.session_service.session import SessionService

router = APIRouter(prefix="/session/conversations", tags=["conversations"])
STREAM_MAX_TIMEOUT_TICKS = 300


class SendConversationMessageBody(BaseModel):
    message: str
    enable_context: bool = False


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


@router.get("/{conversation_id}/context-info")
async def get_conversation_context_info(
    conversation_id: str,
    service: SessionService = Depends(get_session_service),
) -> Result:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    context_info = await service.get_context_info(conversation_id)
    return Result.success(data=context_info)


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
            enable_context=body.enable_context,
        )
        message_id = result["message_id"]
        target_conversation_id = result["conversation_id"]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger = get_logging_runtime().get_logger("api")
    request_ctx = get_ctx()
    request_ctx["conversation_id"] = target_conversation_id
    request_ctx["workspace_id"] = conversation.get("workspace_id") or request_ctx.get("workspace_id")

    async def event_generator() -> AsyncGenerator[str, None]:
        stream_start = time.perf_counter()
        first_chunk_logged = False
        done_received = False
        timeout_counter = 0
        max_timeout = STREAM_MAX_TIMEOUT_TICKS

        subscriber = None

        with bind_ctx(**request_ctx):
            logger.info(
                event="stream.started",
                msg="conversation stream started",
                extra={"conversation_id": target_conversation_id, "message_id": message_id},
            )

            yield f"data: {json.dumps({'type': 'message_created', 'message_id': message_id, 'conversation_id': target_conversation_id, 'user_content': body.message}, ensure_ascii=False)}\n\n"

            try:
                await mq.start_consumer()
                subscriber = mq.subscribe(target_conversation_id)

                while not done_received and timeout_counter < max_timeout:
                    try:
                        message: CanonicalMessage = await asyncio.wait_for(
                            subscriber.get(),
                            timeout=1.0,
                        )

                        event_data = message.to_dict()
                        event_data["message_id"] = message_id

                        if not first_chunk_logged:
                            logger.info(
                                event="stream.first_chunk",
                                msg="conversation stream first chunk sent",
                                extra={
                                    "conversation_id": target_conversation_id,
                                    "message_id": message_id,
                                    "latency_ms": round((time.perf_counter() - stream_start) * 1000),
                                },
                            )
                            first_chunk_logged = True

                        yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"

                        has_done_segment = any(
                            seg.type == SegmentType.DONE for seg in message.content_blocks
                        )
                        if has_done_segment:
                            done_received = True
                            logger.info(
                                event="stream.completed",
                                msg="conversation stream completed",
                                extra={
                                    "conversation_id": target_conversation_id,
                                    "message_id": message_id,
                                    "latency_ms": round((time.perf_counter() - stream_start) * 1000),
                                },
                            )

                        timeout_counter = 0

                    except asyncio.TimeoutError:
                        timeout_counter += 1
                        yield ": heartbeat\n\n"

                        current = await service.get_conversation_detail(target_conversation_id)
                        if not current:
                            continue

                        request_ctx["workspace_id"] = current.get("workspace_id") or request_ctx.get("workspace_id")
                        state = current.get("state")
                        if state == "completed":
                            done_received = True
                            logger.info(
                                event="stream.completed",
                                msg="conversation stream completed from state",
                                extra={
                                    "conversation_id": target_conversation_id,
                                    "message_id": message_id,
                                    "latency_ms": round((time.perf_counter() - stream_start) * 1000),
                                },
                            )
                            yield f"data: {json.dumps({'type': 'done', 'message_id': message_id, 'content': ''}, ensure_ascii=False)}\n\n"
                        elif state == "failed":
                            done_received = True
                            error_message = current.get("error") or state
                            logger.error(
                                event="stream.failed",
                                msg="conversation stream failed from state",
                                extra={
                                    "conversation_id": target_conversation_id,
                                    "message_id": message_id,
                                    "reason": "conversation_failed",
                                    "latency_ms": round((time.perf_counter() - stream_start) * 1000),
                                    "conversation_error": error_message,
                                },
                            )
                            yield f"data: {json.dumps({'type': 'error', 'message_id': message_id, 'content': error_message}, ensure_ascii=False)}\n\n"
                        elif state == "cancelled":
                            done_received = True
                            logger.error(
                                event="stream.failed",
                                msg="conversation stream cancelled from state",
                                extra={
                                    "conversation_id": target_conversation_id,
                                    "message_id": message_id,
                                    "reason": "conversation_cancelled",
                                    "latency_ms": round((time.perf_counter() - stream_start) * 1000),
                                },
                            )
                            yield f"data: {json.dumps({'type': 'error', 'message_id': message_id, 'content': state}, ensure_ascii=False)}\n\n"

                if not done_received:
                    logger.error(
                        event="stream.failed",
                        msg="conversation stream timed out",
                        extra={
                            "conversation_id": target_conversation_id,
                            "message_id": message_id,
                            "reason": "timeout",
                            "latency_ms": round((time.perf_counter() - stream_start) * 1000),
                        },
                    )
                    yield f"data: {json.dumps({'type': 'error', 'message_id': message_id, 'content': 'Timeout'}, ensure_ascii=False)}\n\n"

            except Exception as e:
                logger.error(
                    event="stream.failed",
                    msg="conversation stream raised exception",
                    extra={
                        "conversation_id": target_conversation_id,
                        "message_id": message_id,
                        "reason": "exception",
                        "latency_ms": round((time.perf_counter() - stream_start) * 1000),
                    },
                    exception="".join(traceback.format_exception(type(e), e, e.__traceback__)),
                )
                yield f"data: {json.dumps({'type': 'error', 'message_id': message_id, 'content': str(e)}, ensure_ascii=False)}\n\n"
            finally:
                if subscriber is not None:
                    mq.unsubscribe(target_conversation_id, subscriber)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{conversation_id}/end")
async def end_conversation(
    conversation_id: str,
    service: SessionService = Depends(get_session_service),
) -> Result:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    flushed_count = await service.end_conversation(conversation_id)
    return Result.success(data={"flushed_count": flushed_count})


@router.post("/{conversation_id}/cancel")
async def cancel_conversation(
    conversation_id: str,
    service: SessionService = Depends(get_session_service),
) -> Result:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await service.cancel_conversation(conversation_id)
    return Result.success(data={"cancelled": result})


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    service: SessionService = Depends(get_session_service),
) -> Result:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    deleted = await service.delete_conversation(conversation_id)
    return Result.success(data={"deleted": deleted, "conversation_id": conversation_id})


@router.delete("/{conversation_id}/cascade")
async def cascade_delete_conversation(
    conversation_id: str,
    service: SessionService = Depends(get_session_service),
) -> Result:
    conversation = await service.get_conversation_detail(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    deleted = await service.cascade_delete_conversation(conversation_id)
    return Result.success(data={"deleted": deleted, "conversation_id": conversation_id})
