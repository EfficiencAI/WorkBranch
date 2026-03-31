import asyncio
from typing import List, Optional, Dict, Any, Callable, Awaitable

from core.logging import bind_ctx
from singleton import get_logging_runtime, get_session_history, get_conversation_creator, get_conversation_dao, get_conversation_buffer
from service.user_service.session_history import SessionHistory
from service.session_service.conversation_creator import ConversationCreator
from service.session_service.conversation_buffer import ConversationBuffer
from data.conversation_dao import ConversationDAO, Session, Node, Conversation


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
        self._conversation_creator: ConversationCreator = get_conversation_creator()
        self._conversation_buffer: ConversationBuffer = get_conversation_buffer()
        self._dao: ConversationDAO = get_conversation_dao()
        self._logger = None
        self._lock = asyncio.Lock()

    def _get_logger(self):
        if self._logger is None:
            self._logger = get_logging_runtime().get_logger("app")
        return self._logger

    def _set_active_conversation(
        self,
        session_id: int,
        active_conversation_id: Optional[str],
        *,
        switch_source: str,
        workspace_id: Optional[str] = None,
    ) -> Optional[Session]:
        session = self.get_session(session_id)
        if not session:
            return None

        previous_conversation_id = session.active_conversation_id
        self._dao.update_session_active_conversation(session_id, active_conversation_id)
        updated_session = self.get_session(session_id)

        if active_conversation_id is not None and previous_conversation_id != active_conversation_id:
            with bind_ctx(conversation_id=active_conversation_id, workspace_id=workspace_id):
                self._get_logger().info(
                    event="conversation.switched",
                    msg="active conversation switched",
                    extra={
                        "session_id": session_id,
                        "from_conversation_id": previous_conversation_id,
                        "to_conversation_id": active_conversation_id,
                        "switch_source": switch_source,
                        "workspace_id": workspace_id,
                    },
                )

        return updated_session

    def create_session(self, title: str = "新会话") -> Session:
        return self._session_history.create_session(title)

    def delete_session(self, session_id: int) -> bool:
        conversations = self._dao.list_conversations_by_session(session_id)

        async def _async_delete():
            for conversation in conversations:
                await self._conversation_creator.delete_conversation(conversation.id)

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

        conversation_id = await self._conversation_creator.create_conversation(
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
    ) -> Dict[str, Any]:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")

        session = self.get_session(conversation.session_id)
        if not session:
            raise ValueError(f"Session {conversation.session_id} not found")

        async with self._lock:
            if self._conversation_creator.is_conversation_running(conversation_id):
                raise RuntimeError(f"Conversation {conversation_id} is already running")

        self._set_active_conversation(
            conversation.session_id,
            conversation_id,
            switch_source="send_message",
            workspace_id=conversation.workspace_id,
        )

        task = await self._conversation_creator.send_user_message(
            conversation_id=conversation_id,
            message=message,
            on_complete=on_complete,
        )

        return {
            "conversation_id": conversation_id,
            "session_id": conversation.session_id,
            "task": task,
        }

    async def end_conversation(self, conversation_id: str) -> int:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            return 0

        flushed_count = await self._conversation_creator.end_conversation(conversation_id)

        session = self.get_session(conversation.session_id)
        if session and session.active_conversation_id == conversation_id:
            self._dao.update_session_active_conversation(conversation.session_id, None)

        return flushed_count

    async def cancel_conversation(self, conversation_id: str) -> bool:
        conversation = self._dao.get_conversation_by_id(conversation_id)
        if not conversation:
            return False

        result = await self._conversation_creator.cancel_conversation(conversation_id)

        session = self.get_session(conversation.session_id)
        if session and session.active_conversation_id == conversation_id:
            self._dao.update_session_active_conversation(conversation.session_id, None)

        return result

    def get_active_conversation_id(self, session_id: int) -> Optional[str]:
        session = self.get_session(session_id)
        if not session:
            return None
        return session.active_conversation_id

    def update_session_active_conversation(self, session_id: int, active_conversation_id: Optional[str]) -> Optional[Session]:
        workspace_id = None
        if active_conversation_id is not None:
            conversation = self._dao.get_conversation_by_id(active_conversation_id)
            if conversation:
                workspace_id = conversation.workspace_id
        return self._set_active_conversation(
            session_id,
            active_conversation_id,
            switch_source="session.update_active",
            workspace_id=workspace_id,
        )

    def get_persisted_conversation(self, conversation_id: str) -> Optional[Conversation]:
        return self._dao.get_conversation_by_id(conversation_id)

    def list_conversation_summaries(self, session_id: int) -> List[Dict[str, Any]]:
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
            }
            for conversation in conversations
        ]

    async def list_active_conversations(self) -> List[Dict[str, Any]]:
        result = []
        async with self._lock:
            for session_id, conv_id in self._active_conversations.items():
                state = self._conversation_creator.get_state(conv_id)
                if state:
                    state["session_id"] = session_id
                    result.append(state)
        return result

    def has_active_conversation(self, session_id: int) -> bool:
        return self.get_active_conversation_id(session_id) is not None

    async def get_conversation_detail(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        persisted = self._dao.get_conversation_by_id(conversation_id)
        runtime = self._conversation_creator.get_state(conversation_id)

        if not persisted and not runtime:
            return None

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
                "message_count": persisted.message_count,
                "error": persisted.error,
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
                "message_count": runtime["message_count"],
                "error": runtime["error"],
            }

        if runtime:
            detail.update({
                "workspace_id": runtime.get("workspace_id"),
                "parent_conversation_id": runtime.get("parent_conversation_id"),
                "title": runtime.get("title"),
                "state": runtime.get("state"),
                "created_at": runtime.get("created_at"),
                "message_count": runtime.get("message_count"),
                "error": runtime.get("error"),
            })

        return detail

    async def get_conversation_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        # Business message history comes from SQLite nodes plus in-memory ConversationBuffer.
        # It is intentionally not reconstructed from MQ transcripts or conversation-content logs.
        persisted_nodes = self._dao.get_nodes_by_conversation(conversation_id)
        result = [
            {
                "id": node.id,
                "session_id": node.session_id,
                "conversation_id": node.conversation_id,
                "parent_id": node.parent_id,
                "role": node.role,
                "content": node.content,
                "created_at": node.created_at,
            }
            for node in persisted_nodes
        ]

        buffered_nodes = await self._conversation_buffer.get_buffered_nodes(conversation_id)
        if buffered_nodes:
            session_id = await self._conversation_buffer.get_session_id(conversation_id)
            for index, node in enumerate(buffered_nodes):
                result.append({
                    "id": None,
                    "session_id": session_id,
                    "conversation_id": conversation_id,
                    "parent_id": node.parent_id,
                    "role": node.role,
                    "content": node.content,
                    "created_at": node.created_at.isoformat(),
                    "buffer_index": index,
                })

        return result
