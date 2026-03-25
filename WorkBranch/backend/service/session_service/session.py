import asyncio
from typing import List, Optional, Dict, Any, Callable, Awaitable

from singleton import get_session_history, get_conversation_creator, get_conversation_dao
from service.user_service.session_history import SessionHistory
from service.session_service.conversation_creator import ConversationCreator
from data.conversation_dao import ConversationDAO, Session, Node


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

    def get_nodes(self, session_id: int) -> List[Node]:
        return self._dao.get_nodes_by_session(session_id)

    def get_conversation_state(self, session_id: int) -> Optional[Dict[str, Any]]:
        conversation_id = self._active_conversations.get(session_id)
        if conversation_id is None:
            return None
        return self._conversation_creator.get_state(conversation_id)

    def get_active_conversation_id(self, session_id: int) -> Optional[str]:
        return self._active_conversations.get(session_id)

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
        return session_id in self._active_conversations
