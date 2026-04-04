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


@dataclass
class AssistantDraft:
    conversation_id: str
    message_id: str
    content: str = ""
    parent_id: Optional[int] = None
    created_at: datetime = field(default_factory=datetime.now)
    persisted_node_id: Optional[int] = None


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
        self._drafts: Dict[str, Dict[str, AssistantDraft]] = {}
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

    async def consume_text_event(
        self,
        conversation_id: str,
        message_id: str,
        content: str,
        parent_id: Optional[int] = None
    ) -> None:
        async with self._lock:
            if conversation_id not in self._drafts:
                self._drafts[conversation_id] = {}
            
            if message_id not in self._drafts[conversation_id]:
                self._drafts[conversation_id][message_id] = AssistantDraft(
                    conversation_id=conversation_id,
                    message_id=message_id,
                    content="",
                    parent_id=parent_id
                )
            
            self._drafts[conversation_id][message_id].content += content

    async def consume_done_event(
        self,
        conversation_id: str,
        message_id: str
    ) -> Optional[int]:
        async with self._lock:
            if conversation_id not in self._drafts:
                return None
            
            if message_id not in self._drafts[conversation_id]:
                return None
            
            draft = self._drafts[conversation_id].pop(message_id)
            
            if not draft.content:
                return None
            
            session_id = None
            if conversation_id in self._buffers:
                session_id = self._buffers[conversation_id].session_id
            else:
                persisted = self._dao.get_conversation_by_id(conversation_id)
                if persisted:
                    session_id = persisted.session_id
            
            if session_id is None:
                return None
            
            parent_id = draft.parent_id
            if parent_id is None:
                if conversation_id in self._buffers:
                    buffer_nodes = self._buffers[conversation_id].nodes
                    if buffer_nodes:
                        for i, node in enumerate(buffer_nodes):
                            actual_parent_id = None
                            node_id = self._dao.add_node(
                                session_id=session_id,
                                conversation_id=conversation_id,
                                role=node.role,
                                content=node.content,
                                parent_id=actual_parent_id
                            )
                            parent_id = node_id
                        self._buffers[conversation_id].nodes = []
                
                if parent_id is None:
                    persisted_nodes = self._dao.get_nodes_by_conversation(conversation_id)
                    if persisted_nodes:
                        parent_id = persisted_nodes[-1].id
            
            node_id = self._dao.add_node(
                session_id=session_id,
                conversation_id=conversation_id,
                role="assistant",
                content=draft.content,
                parent_id=parent_id
            )
            
            draft.persisted_node_id = node_id
            
            if conversation_id in self._drafts and not self._drafts[conversation_id]:
                del self._drafts[conversation_id]
            
            return node_id

    async def get_draft_content(
        self,
        conversation_id: str,
        message_id: str
    ) -> Optional[str]:
        async with self._lock:
            if conversation_id not in self._drafts:
                return None
            if message_id not in self._drafts[conversation_id]:
                return None
            return self._drafts[conversation_id][message_id].content

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
            cleared = False
            if conversation_id in self._buffers:
                del self._buffers[conversation_id]
                cleared = True
            if conversation_id in self._drafts:
                del self._drafts[conversation_id]
                cleared = True
            return cleared

    async def get_active_conversations(self) -> List[Dict[str, Any]]:
        async with self._lock:
            result = []
            for conv_id, data in self._buffers.items():
                draft_count = len(self._drafts.get(conv_id, {}))
                result.append({
                    "conversation_id": conv_id,
                    "session_id": data.session_id,
                    "node_count": len(data.nodes),
                    "draft_count": draft_count,
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

    async def get_last_persisted_node_id(self, conversation_id: str) -> Optional[int]:
        async with self._lock:
            nodes = self._dao.get_nodes_by_conversation(conversation_id)
            if nodes:
                return nodes[-1].id
            return None
