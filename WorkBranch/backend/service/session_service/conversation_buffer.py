import asyncio
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime

from singleton import get_conversation_dao
from data.conversation_dao import ConversationDAO


@dataclass
class BufferNode:
    role: str
    content: str
    parent_id: Optional[int] = None
    created_at: datetime = field(default_factory=datetime.now)
    node_id: Optional[int] = None


@dataclass
class BufferData:
    session_id: int
    conversation_id: str
    nodes: List[BufferNode] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


class ConversationBuffer:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if ConversationBuffer._initialized:
            return
        ConversationBuffer._initialized = True

        self._buffers: Dict[str, BufferData] = {}
        self._lock = asyncio.Lock()
        self._dao: ConversationDAO = get_conversation_dao()

    async def start_buffer(self, conversation_id: str, session_id: int) -> None:
        async with self._lock:
            if conversation_id in self._buffers:
                return
            self._buffers[conversation_id] = BufferData(
                session_id=session_id,
                conversation_id=conversation_id,
            )

    async def add_node(
        self,
        conversation_id: str,
        role: str,
        content: str,
        parent_id: Optional[int] = None
    ) -> BufferNode:
        async with self._lock:
            if conversation_id not in self._buffers:
                raise ValueError(f"Conversation {conversation_id} not found in buffer")

            node = BufferNode(
                role=role,
                content=content,
                parent_id=parent_id
            )
            self._buffers[conversation_id].nodes.append(node)
            return node

    async def get_buffered_nodes(self, conversation_id: str) -> List[BufferNode]:
        async with self._lock:
            if conversation_id not in self._buffers:
                return []
            return list(self._buffers[conversation_id].nodes)

    async def flush(self, conversation_id: str) -> int:
        async with self._lock:
            if conversation_id not in self._buffers:
                return 0

            buffer_data = self._buffers[conversation_id]
            session_id = buffer_data.session_id
            nodes = buffer_data.nodes

            if not nodes:
                return 0

            parent_id_map: Dict[int, int] = {}
            flushed_count = 0

            for i, node in enumerate(nodes):
                actual_parent_id = parent_id_map.get(node.parent_id) if node.parent_id is not None else None

                node_id = self._dao.add_node(
                    session_id=session_id,
                    conversation_id=conversation_id,
                    role=node.role,
                    content=node.content,
                    parent_id=actual_parent_id
                )

                parent_id_map[i] = node_id
                node.node_id = node_id
                flushed_count += 1

            self._buffers[conversation_id].nodes = []
            return flushed_count

    async def clear(self, conversation_id: str) -> bool:
        async with self._lock:
            if conversation_id in self._buffers:
                del self._buffers[conversation_id]
                return True
            return False

    async def get_active_conversations(self) -> List[Dict[str, Any]]:
        async with self._lock:
            result = []
            for conv_id, data in self._buffers.items():
                result.append({
                    "conversation_id": conv_id,
                    "session_id": data.session_id,
                    "node_count": len(data.nodes),
                    "created_at": data.created_at.isoformat()
                })
            return result

    def has_buffer(self, conversation_id: str) -> bool:
        return conversation_id in self._buffers

    async def get_session_id(self, conversation_id: str) -> Optional[int]:
        async with self._lock:
            if conversation_id in self._buffers:
                return self._buffers[conversation_id].session_id
            return None
