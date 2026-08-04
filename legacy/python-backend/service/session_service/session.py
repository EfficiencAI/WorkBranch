import asyncio
from typing import List, Optional, Dict, Any, Callable, Awaitable

from singleton import get_session_history, get_conversation_service, get_conversation_dao, get_conversation_buffer
from service.user_service.session_history import SessionHistory
from service.session_service.conversation_service import ConversationService
from service.session_service.conversation_buffer import ConversationBuffer
from data.conversation_dao import ConversationDAO, Session, Conversation


class SessionService:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if SessionService._initialized:
            return
        SessionService._initialized = True

        self._session_history: SessionHistory = get_session_history()
        self._conversation_service: ConversationService = get_conversation_service()
        self._conversation_buffer: ConversationBuffer = get_conversation_buffer()
        self._dao: ConversationDAO = get_conversation_dao()
        self._lock = asyncio.Lock()

    def create_session(self, title: str = "新会话") -> Session:
        return self._session_history.create_session(title)

    def delete_session(self, session_id: int) -> bool:
        conversations = self._dao.list_conversations_by_session(session_id)

        async def _async_delete():
            for conversation in conversations:
                await self._conversation_service.delete_conversation(conversation.id)

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(_async_delete())
            else:
                loop.run_until_complete(_async_delete())
        except RuntimeError:
            pass

        self._session_history.delete_session(session_id)
        return True

    def list_sessions(self) -> List[Session]:
        return self._session_history.list_sessions()

    def get_session(self, session_id: int) -> Optional[Session]:
        return self._session_history.get_session(session_id)

    async def create_conversation(
        self,
        session_id: int,
        workspace_id: Optional[str] = None,
        parent_conversation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if parent_conversation_id is not None:
            parent_conversation = self._dao.get_conversation_by_id(parent_conversation_id)
            if not parent_conversation:
                raise ValueError(f"Conversation {parent_conversation_id} not found")
            if parent_conversation.session_id != session_id:
                raise ValueError("Parent conversation does not belong to this session")

        conversation_id = await self._conversation_service.create_conversation(
            session_id=session_id,
            workspace_id=workspace_id,
            parent_conversation_id=parent_conversation_id,
        )

        return {
            "conversation_id": conversation_id,
            "session_id": session_id,
            "parent_conversation_id": parent_conversation_id,
        }

    async def send_message_to_conversation(
        self,
        conversation_id: str,
        message: str,
        on_complete: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
        enable_context: bool = False,
    ) -> Dict[str, Any]:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")

        session = self.get_session(conversation.session_id)
        if not session:
            raise ValueError(f"Session {conversation.session_id} not found")

        async with self._lock:
            if self._conversation_service.is_conversation_running(conversation_id):
                raise RuntimeError(f"Conversation {conversation_id} is already running")

        result = await self._conversation_service.send_user_message(
            conversation_id=conversation_id,
            message=message,
            on_complete=on_complete,
            enable_context=enable_context,
        )

        return {
            "message_id": result["message_id"],
            "conversation_id": result["conversation_id"],
            "session_id": conversation.session_id,
        }

    async def end_conversation(self, conversation_id: str) -> int:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            return 0

        flushed_count = await self._conversation_service.end_conversation(conversation_id)
        return flushed_count

    async def cancel_conversation(self, conversation_id: str) -> bool:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            return False

        result = await self._conversation_service.cancel_conversation(conversation_id)
        return result

    async def delete_conversation(self, conversation_id: str) -> bool:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            return False

        return await self._conversation_service.delete_conversation(conversation_id)

    async def cascade_delete_conversation(self, conversation_id: str) -> bool:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            return False

        return await self._conversation_service.cascade_delete_conversation(conversation_id)

    def get_persisted_conversation(self, conversation_id: str) -> Optional[Conversation]:
        return self._dao.get_conversation_by_id(conversation_id)

    async def update_conversation_positions(self, session_id: int, positions: List[Dict[str, Any]]) -> None:
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        normalized_positions: List[Dict[str, Any]] = []
        for item in positions:
            conversation_id = str(item.get("conversation_id") or "").strip()
            if not conversation_id:
                raise ValueError("conversation_id is required")

            try:
                x = float(item.get("x"))
                y = float(item.get("y"))
            except (TypeError, ValueError):
                raise ValueError(f"Invalid position for conversation {conversation_id}")

            normalized_positions.append({
                "conversation_id": conversation_id,
                "x": x,
                "y": y,
            })

        self._dao.update_conversation_positions(session_id, normalized_positions)

    async def list_conversation_summaries(self, session_id: int) -> List[Dict[str, Any]]:
        await self._conversation_service.ensure_conversations_loaded(session_id)
        conversations = self._dao.list_conversations_by_session(session_id)
        return [
            {
                "conversation_id": conversation.id,
                "parent_conversation_id": conversation.parent_conversation_id,
                "title": conversation.title,
                "state": conversation.state,
                "message_count": conversation.message_count,
                "created_at": conversation.created_at,
                "updated_at": conversation.updated_at,
                "position_x": conversation.position_x,
                "position_y": conversation.position_y,
            }
            for conversation in conversations
        ]

    async def get_conversation_detail(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        persisted = self._dao.get_conversation_by_id(conversation_id)
        runtime = self._conversation_service.get_state(conversation_id)

        if not persisted and not runtime:
            return None

        messages = self._dao.get_messages_by_conversation(conversation_id)
        actual_message_count = len(messages)

        if persisted:
            detail = {
                "conversation_id": persisted.id,
                "session_id": persisted.session_id,
                "workspace_id": persisted.workspace_id,
                "parent_conversation_id": persisted.parent_conversation_id,
                "title": persisted.title,
                "state": persisted.state,
                "created_at": persisted.created_at,
                "updated_at": persisted.updated_at,
                "ended_at": persisted.ended_at,
                "message_count": actual_message_count,
                "error": persisted.error,
                "position_x": persisted.position_x,
                "position_y": persisted.position_y,
            }
        else:
            detail = {
                "conversation_id": runtime["conversation_id"],
                "session_id": runtime["session_id"],
                "parent_conversation_id": runtime.get("parent_conversation_id"),
                "title": runtime.get("title"),
                "state": runtime["state"],
                "created_at": runtime["created_at"],
                "updated_at": runtime["created_at"],
                "ended_at": None,
                "message_count": actual_message_count,
                "error": runtime["error"],
                "position_x": None,
                "position_y": None,
            }

        if runtime:
            detail.update({
                "workspace_id": runtime.get("workspace_id"),
                "title": runtime.get("title"),
                "state": runtime.get("state"),
                "created_at": runtime.get("created_at"),
                "message_count": actual_message_count,
                "error": runtime.get("error"),
            })

            if not persisted:
                detail["parent_conversation_id"] = runtime.get("parent_conversation_id")

        return detail

    async def get_conversation_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        messages = self._dao.get_messages_by_conversation(conversation_id)
        return [
            {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "session_id": msg.session_id,
                "user_content": msg.user_content,
                "assistant_content": msg.assistant_content,
                "thinking_content": msg.thinking_content,
                "status": msg.status,
                "created_at": msg.created_at,
                "updated_at": msg.updated_at,
            }
            for msg in messages
        ]

    async def get_parent_chain_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        messages = self._dao.get_parent_chain_messages(conversation_id)
        return [
            {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "session_id": msg.session_id,
                "user_content": msg.user_content,
                "assistant_content": msg.assistant_content,
                "status": msg.status,
                "created_at": msg.created_at,
                "updated_at": msg.updated_at,
            }
            for msg in messages
        ]

    async def get_context_info(self, conversation_id: str) -> Dict[str, Any]:
        messages = await self.get_parent_chain_messages(conversation_id)
        total_chars = 0
        for msg in messages:
            total_chars += len(msg.get("user_content") or "")
            total_chars += len(msg.get("assistant_content") or "")
        estimated_tokens = total_chars // 4
        return {
            "conversation_id": conversation_id,
            "message_count": len(messages),
            "total_chars": total_chars,
            "estimated_tokens": estimated_tokens,
        }
