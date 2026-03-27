import asyncio
from typing import List, Optional, Dict, Any, Callable, Awaitable

from singleton import get_session_history, get_conversation_creator, get_conversation_dao, get_conversation_buffer
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
        self._active_conversations: Dict[int, str] = {}
        self._lock = asyncio.Lock()

    def create_session(self, title: str = "新会话") -> Session:
        return self._session_history.create_session(title)

    def delete_session(self, session_id: int) -> bool:
        async def _async_delete():
            async with self._lock:
                if session_id in self._active_conversations:
                    conv_id = self._active_conversations[session_id]
                    await self._conversation_creator.cancel_conversation(conv_id)
                    del self._active_conversations[session_id]

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

    async def create_conversation(self, session_id: int, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        conversation_id = await self._conversation_creator.create_conversation(
            session_id=session_id,
            workspace_id=workspace_id,
        )

        return {
            "conversation_id": conversation_id,
            "session_id": session_id,
        }

    async def send_message(
        self,
        session_id: int,
        message: str,
        workspace_id: Optional[str] = None,
        on_complete: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
    ) -> Dict[str, Any]:
        async with self._lock:
            conversation_id = self._active_conversations.get(session_id)

            if conversation_id is None:
                conversation_id = await self._conversation_creator.create_conversation(
                    session_id=session_id,
                    workspace_id=workspace_id
                )
                self._active_conversations[session_id] = conversation_id
            elif self._conversation_creator.is_conversation_running(conversation_id):
                raise RuntimeError(f"Session {session_id} has a running conversation")

        task = await self._conversation_creator.send_user_message(
            conversation_id=conversation_id,
            message=message,
            on_complete=on_complete
        )

        return {
            "conversation_id": conversation_id,
            "session_id": session_id,
            "task": task
        }

    async def end_conversation(self, session_id: int) -> int:
        async with self._lock:
            conversation_id = self._active_conversations.get(session_id)
            if conversation_id is None:
                return 0

            flushed_count = await self._conversation_creator.end_conversation(conversation_id)
            del self._active_conversations[session_id]

            return flushed_count

    async def cancel_conversation(self, session_id: int) -> bool:
        async with self._lock:
            conversation_id = self._active_conversations.get(session_id)
            if conversation_id is None:
                return False

            result = await self._conversation_creator.cancel_conversation(conversation_id)
            del self._active_conversations[session_id]

            return result

    def get_active_conversation_id(self, session_id: int) -> Optional[str]:
        session = self.get_session(session_id)
        if not session:
            return None
        return session.active_conversation_id

    def update_session_active_conversation(self, session_id: int, active_conversation_id: Optional[str]) -> Optional[Session]:
        session = self.get_session(session_id)
        if not session:
            return None
        self._dao.update_session_active_conversation(session_id, active_conversation_id)
        return self.get_session(session_id)

    def get_persisted_conversation(self, conversation_id: str) -> Optional[Conversation]:
        return self._dao.get_conversation_by_id(conversation_id)

    def list_conversation_refs(self, session_id: int) -> List[Dict[str, str]]:
        conversations = self._dao.list_conversations_by_session(session_id)
        return [{"conversation_id": conversation.id} for conversation in conversations]

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
                "workspace_id": runtime["workspace_id"],
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
                "state": runtime.get("state"),
                "created_at": runtime.get("created_at"),
                "message_count": runtime.get("message_count"),
                "error": runtime.get("error"),
            })

        return detail

    async def get_conversation_nodes(self, conversation_id: str) -> List[Dict[str, Any]]:
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
