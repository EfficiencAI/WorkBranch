import asyncio
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Callable, Awaitable
from enum import Enum
from datetime import datetime, timezone

from singleton import get_conversation_buffer, get_agent_service, get_conversation_dao, get_logging_runtime
from service.session_service.conversation_buffer import ConversationBuffer
from service.agent_service.agent_service import AgentService
from data.conversation_dao import ConversationDAO


class ConversationState(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ConversationInfo:
    conversation_id: str
    session_id: int
    workspace_id: str
    parent_conversation_id: Optional[str] = None
    title: Optional[str] = None
    state: ConversationState = ConversationState.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    task: Optional[asyncio.Task] = None
    error: Optional[str] = None
    message_count: int = 0


class ConversationCreator:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if ConversationCreator._initialized:
            return
        ConversationCreator._initialized = True

        self._buffer: ConversationBuffer = get_conversation_buffer()
        self._agent: AgentService = get_agent_service()
        self._dao: ConversationDAO = get_conversation_dao()
        self._runtime = None
        self._conversations: Dict[str, ConversationInfo] = {}
        self._lock = asyncio.Lock()

    def _write_content_record(self, conversation_id: str, content_type: str, payload: Dict[str, Any]) -> None:
        # conversation-content is an audit timeline, not the canonical message-body store.
        # Full user/assistant content is retrieved from SQLite nodes plus ConversationBuffer.
        if self._runtime is None:
            self._runtime = get_logging_runtime()
        self._runtime.write_conversation_content(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "conversation_id": conversation_id,
                "type": content_type,
                "payload": payload,
            }
        )

    def _get_logger(self):
        if self._runtime is None:
            self._runtime = get_logging_runtime()
        return self._runtime.get_logger("app")

    async def create_conversation(
        self,
        session_id: int,
        workspace_id: Optional[str] = None,
        parent_conversation_id: Optional[str] = None,
        title: Optional[str] = None,
    ) -> str:
        agent_conv_id = await self._agent.create_conversation(
            workspace_id=workspace_id,
            session_id=str(session_id)
        )

        resolved_workspace_id = workspace_id or agent_conv_id
        await self._buffer.start_buffer(agent_conv_id, session_id)
        self._dao.create_conversation(
            conversation_id=agent_conv_id,
            session_id=session_id,
            workspace_id=resolved_workspace_id,
            parent_conversation_id=parent_conversation_id,
            title=title,
            state=ConversationState.PENDING.value,
        )

        async with self._lock:
            self._conversations[agent_conv_id] = ConversationInfo(
                conversation_id=agent_conv_id,
                session_id=session_id,
                workspace_id=resolved_workspace_id,
                parent_conversation_id=parent_conversation_id,
                title=title,
                state=ConversationState.PENDING
            )

        self._write_content_record(
            agent_conv_id,
            "system_event",
            {
                "event": "conversation.created",
                "session_id": session_id,
                "workspace_id": resolved_workspace_id,
                "parent_conversation_id": parent_conversation_id,
            },
        )

        return agent_conv_id

    async def send_user_message(
        self,
        conversation_id: str,
        message: str,
        on_complete: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
    ) -> asyncio.Task:
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                persisted = self._dao.get_conversation_by_id(conversation_id)
                if not persisted:
                    raise ValueError(f"Conversation {conversation_id} not found")
                conv_info = ConversationInfo(
                    conversation_id=persisted.id,
                    session_id=persisted.session_id,
                    workspace_id=persisted.workspace_id or conversation_id,
                    parent_conversation_id=persisted.parent_conversation_id,
                    title=persisted.title,
                    state=ConversationState(persisted.state or ConversationState.PENDING.value),
                    created_at=datetime.fromisoformat(persisted.created_at) if 'T' in persisted.created_at else datetime.now(),
                    error=persisted.error,
                    message_count=persisted.message_count,
                )
                self._conversations[conversation_id] = conv_info

            if conv_info.state == ConversationState.RUNNING:
                raise RuntimeError(f"Conversation {conversation_id} is already running")

        await self._buffer.add_node(
            conversation_id=conversation_id,
            role="user",
            content=message
        )
        self._write_content_record(
            conversation_id,
            "user_message",
            {
                "role": "user",
                "storage": "sqlite_nodes",
                "content_length": len(message),
                "state": "buffered",
            },
        )

        async with self._lock:
            conv_info.state = ConversationState.RUNNING
            conv_info.message_count += 1
            self._dao.update_conversation(
                conversation_id,
                state=ConversationState.RUNNING.value,
                message_count=conv_info.message_count,
                error=None,
            )

        async def wrapped_callback(result: Dict[str, Any]):
            await self._on_message_complete(conversation_id, result)
            if on_complete:
                await on_complete(result)

        task = await self._agent.send_message(
            conversation_id=conversation_id,
            message=message,
            stream_callback=wrapped_callback
        )

        async with self._lock:
            conv_info.task = task

        asyncio.create_task(self._watch_message_task(conversation_id, task))

        return task

    async def _on_message_complete(
        self,
        conversation_id: str,
        result: Dict[str, Any]
    ):
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                return

            conv_info.state = ConversationState.COMPLETED
            conv_info.error = None
            self._dao.update_conversation(
                conversation_id,
                state=ConversationState.COMPLETED.value,
                message_count=conv_info.message_count,
                error="",
                ended_at=datetime.now().isoformat(),
            )

    async def _finalize_message_failure(
        self,
        conversation_id: str,
        state: ConversationState,
        error: Optional[str] = None,
    ) -> None:
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                persisted = self._dao.get_conversation_by_id(conversation_id)
                if not persisted:
                    return
                conv_info = ConversationInfo(
                    conversation_id=persisted.id,
                    session_id=persisted.session_id,
                    workspace_id=persisted.workspace_id or conversation_id,
                    parent_conversation_id=persisted.parent_conversation_id,
                    title=persisted.title,
                    state=ConversationState(state.value),
                    created_at=datetime.fromisoformat(persisted.created_at) if "T" in persisted.created_at else datetime.now(),
                    error=persisted.error,
                    message_count=persisted.message_count,
                )
                self._conversations[conversation_id] = conv_info

            conv_info.state = state
            conv_info.error = error
            self._dao.update_conversation(
                conversation_id,
                state=state.value,
                message_count=conv_info.message_count,
                error=error if error is not None else "",
                ended_at=datetime.now().isoformat(),
            )

        self._write_content_record(
            conversation_id,
            "system_event",
            {"event": f"conversation.{state.value}", "error": error},
        )

    async def _watch_message_task(self, conversation_id: str, task: asyncio.Task) -> None:
        try:
            await task
        except asyncio.CancelledError:
            await self._finalize_message_failure(conversation_id, ConversationState.CANCELLED)
        except Exception as exc:
            await self._finalize_message_failure(conversation_id, ConversationState.FAILED, str(exc))

    async def end_conversation(self, conversation_id: str) -> int:
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                persisted = self._dao.get_conversation_by_id(conversation_id)
                if not persisted:
                    return 0
                conv_info = ConversationInfo(
                    conversation_id=persisted.id,
                    session_id=persisted.session_id,
                    workspace_id=persisted.workspace_id or conversation_id,
                    parent_conversation_id=persisted.parent_conversation_id,
                    title=persisted.title,
                    state=ConversationState(persisted.state or ConversationState.PENDING.value),
                    created_at=datetime.now(),
                    error=persisted.error,
                    message_count=persisted.message_count,
                )
                self._conversations[conversation_id] = conv_info

            if conv_info.state == ConversationState.RUNNING:
                if conv_info.task and not conv_info.task.done():
                    try:
                        await asyncio.wait_for(conv_info.task, timeout=5.0)
                    except asyncio.TimeoutError:
                        conv_info.task.cancel()
                    except Exception:
                        pass

            conv_info.state = ConversationState.COMPLETED
            self._dao.update_conversation(
                conversation_id,
                state=ConversationState.COMPLETED.value,
                message_count=conv_info.message_count,
                error=conv_info.error,
                ended_at=datetime.now().isoformat(),
            )

        flushed_count = await self._buffer.flush(conversation_id)
        self._dao.update_conversation(conversation_id, message_count=flushed_count)
        return flushed_count

    async def cancel_conversation(self, conversation_id: str) -> bool:
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                persisted = self._dao.get_conversation_by_id(conversation_id)
                if not persisted:
                    return False
                conv_info = ConversationInfo(
                    conversation_id=persisted.id,
                    session_id=persisted.session_id,
                    workspace_id=persisted.workspace_id or conversation_id,
                    parent_conversation_id=persisted.parent_conversation_id,
                    title=persisted.title,
                    state=ConversationState(persisted.state or ConversationState.PENDING.value),
                    created_at=datetime.now(),
                    error=persisted.error,
                    message_count=persisted.message_count,
                )
                self._conversations[conversation_id] = conv_info

            if conv_info.state == ConversationState.RUNNING:
                self._agent.cancel_conversation(conversation_id)

            conv_info.state = ConversationState.CANCELLED
            self._dao.update_conversation(
                conversation_id,
                state=ConversationState.CANCELLED.value,
                message_count=conv_info.message_count,
                error=conv_info.error,
                ended_at=datetime.now().isoformat(),
            )

        await self._buffer.clear(conversation_id)
        self._write_content_record(
            conversation_id,
            "system_event",
            {"event": "conversation.cancelled", "error": conv_info.error},
        )
        return True

    def get_state(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        conv_info = self._conversations.get(conversation_id)
        if not conv_info:
            persisted = self._dao.get_conversation_by_id(conversation_id)
            if not persisted:
                return None
            return {
                "conversation_id": persisted.id,
                "session_id": persisted.session_id,
                "workspace_id": persisted.workspace_id,
                "parent_conversation_id": persisted.parent_conversation_id,
                "title": persisted.title,
                "state": persisted.state,
                "created_at": persisted.created_at,
                "message_count": persisted.message_count,
                "error": persisted.error
            }

        return {
            "conversation_id": conv_info.conversation_id,
            "session_id": conv_info.session_id,
            "workspace_id": conv_info.workspace_id,
            "parent_conversation_id": conv_info.parent_conversation_id,
            "title": conv_info.title,
            "state": conv_info.state.value,
            "created_at": conv_info.created_at.isoformat(),
            "message_count": conv_info.message_count,
            "error": conv_info.error
        }

    async def list_conversations(
        self,
        state: Optional[ConversationState] = None
    ) -> list:
        result = []
        async with self._lock:
            for conv_info in self._conversations.values():
                if state is None or conv_info.state == state:
                    result.append({
                        "conversation_id": conv_info.conversation_id,
                        "session_id": conv_info.session_id,
                        "state": conv_info.state.value,
                        "message_count": conv_info.message_count
                    })
        return result

    async def delete_conversation(self, conversation_id: str) -> bool:
        persisted = self._dao.get_conversation_by_id(conversation_id)
        if not persisted and conversation_id not in self._conversations:
            return False

        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if conv_info and conv_info.state == ConversationState.RUNNING:
                self._agent.cancel_conversation(conversation_id)

            if conversation_id in self._conversations:
                del self._conversations[conversation_id]

        await self._buffer.clear(conversation_id)
        deleted = self._agent.delete_conversation(conversation_id)
        if persisted is not None:
            deleted = True if deleted or persisted is not None else deleted

        if not deleted:
            return False

        session_id = persisted.session_id if persisted else (conv_info.session_id if conv_info else None)
        workspace_id = persisted.workspace_id if persisted else (conv_info.workspace_id if conv_info else None)
        parent_conversation_id = persisted.parent_conversation_id if persisted else (conv_info.parent_conversation_id if conv_info else None)

        with bind_ctx(conversation_id=conversation_id, workspace_id=workspace_id):
            self._get_logger().info(
                event="conversation.deleted",
                msg="conversation deleted",
                extra={
                    "session_id": session_id,
                    "conversation_id": conversation_id,
                    "workspace_id": workspace_id,
                    "parent_conversation_id": parent_conversation_id,
                },
            )

        self._write_content_record(
            conversation_id,
            "system_event",
            {"event": "conversation.deleted", "session_id": session_id, "workspace_id": workspace_id},
        )
        return True

    def is_conversation_running(self, conversation_id: str) -> bool:
        conv_info = self._conversations.get(conversation_id)
        return conv_info is not None and conv_info.state == ConversationState.RUNNING
