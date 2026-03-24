import asyncio
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Callable, Awaitable
from enum import Enum
from datetime import datetime

from singleton import get_conversation_buffer, get_agent_service
from service.session_service.conversation_buffer import ConversationBuffer
from service.agent_service.agent_service import AgentService


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
        self._conversations: Dict[str, ConversationInfo] = {}
        self._lock = asyncio.Lock()

    async def create_conversation(
        self,
        session_id: int,
        workspace_id: Optional[str] = None
    ) -> str:
        agent_conv_id = await self._agent.create_conversation(
            workspace_id=workspace_id,
            session_id=str(session_id)
        )
        
        await self._buffer.start_buffer(agent_conv_id, session_id)
        
        async with self._lock:
            self._conversations[agent_conv_id] = ConversationInfo(
                conversation_id=agent_conv_id,
                session_id=session_id,
                workspace_id=workspace_id or agent_conv_id,
                state=ConversationState.PENDING
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
                raise ValueError(f"Conversation {conversation_id} not found")
            
            if conv_info.state == ConversationState.RUNNING:
                raise RuntimeError(f"Conversation {conversation_id} is already running")
        
        await self._buffer.add_node(
            conversation_id=conversation_id,
            role="user",
            content=message
        )
        
        async with self._lock:
            conv_info.state = ConversationState.RUNNING
            conv_info.message_count += 1
        
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
        
        assistant_content = result.get("response", "") if result else ""
        if assistant_content:
            nodes = await self._buffer.get_buffered_nodes(conversation_id)
            parent_id = len(nodes) - 1 if nodes else None
            
            await self._buffer.add_node(
                conversation_id=conversation_id,
                role="assistant",
                content=assistant_content,
                parent_id=parent_id
            )

    async def end_conversation(self, conversation_id: str) -> int:
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                return 0
            
            if conv_info.state == ConversationState.RUNNING:
                if conv_info.task and not conv_info.task.done():
                    try:
                        await asyncio.wait_for(conv_info.task, timeout=5.0)
                    except asyncio.TimeoutError:
                        conv_info.task.cancel()
                    except Exception:
                        pass
            
            conv_info.state = ConversationState.COMPLETED
        
        flushed_count = await self._buffer.flush(conversation_id)
        
        return flushed_count

    async def cancel_conversation(self, conversation_id: str) -> bool:
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                return False
            
            if conv_info.state == ConversationState.RUNNING:
                self._agent.cancel_conversation(conversation_id)
            
            conv_info.state = ConversationState.CANCELLED
        
        await self._buffer.clear(conversation_id)
        
        return True

    def get_state(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        conv_info = self._conversations.get(conversation_id)
        if not conv_info:
            return None
        
        return {
            "conversation_id": conv_info.conversation_id,
            "session_id": conv_info.session_id,
            "workspace_id": conv_info.workspace_id,
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
        async with self._lock:
            conv_info = self._conversations.get(conversation_id)
            if not conv_info:
                return False
            
            if conv_info.state == ConversationState.RUNNING:
                self._agent.cancel_conversation(conversation_id)
            
            del self._conversations[conversation_id]
        
        await self._buffer.clear(conversation_id)
        self._agent.delete_conversation(conversation_id)
        
        return True

    def is_conversation_running(self, conversation_id: str) -> bool:
        conv_info = self._conversations.get(conversation_id)
        return conv_info is not None and conv_info.state == ConversationState.RUNNING
