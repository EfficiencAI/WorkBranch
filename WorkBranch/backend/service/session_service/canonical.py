from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
import threading


class SegmentType(Enum):
    THINKING_START = "thinking_start"
    THINKING_DELTA = "thinking_delta"
    THINKING_END = "thinking_end"
    THINKING = "thinking"  # 新增独立的thinking消息类型
    
    TEXT_START = "text_start"
    TEXT_DELTA = "text_delta"
    TEXT_END = "text_end"
    
    PLAN_START = "plan_start"
    PLAN_DELTA = "plan_delta"
    PLAN_END = "plan_end"
    
    STATE_CHANGE = "state_change"
    TOOL_CALL = "tool_call"
    TOOL_RES = "tool_res"
    ERROR = "error"
    DONE = "done"


@dataclass
class Segment:
    cid: str
    mid: str
    idx: int
    type: SegmentType
    payload: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "cid": self.cid,
            "mid": self.mid,
            "idx": self.idx,
            "type": self.type.value,
            "payload": self.payload,
            "meta": self.meta,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Segment":
        return cls(
            cid=data["cid"],
            mid=data["mid"],
            idx=data["idx"],
            type=SegmentType(data["type"]),
            payload=data.get("payload", ""),
            meta=data.get("meta", {}),
        )


class SegmentBuilder:
    _counter: Dict[str, int] = {}
    _lock = threading.Lock()
    
    @classmethod
    def _next_idx(cls, mid: str) -> int:
        with cls._lock:
            if mid not in cls._counter:
                cls._counter[mid] = 0
            cls._counter[mid] += 1
            return cls._counter[mid]
    
    @classmethod
    def reset(cls, mid: str = None) -> None:
        with cls._lock:
            if mid:
                cls._counter.pop(mid, None)
            else:
                cls._counter.clear()
    
    @classmethod
    def build(
        cls,
        cid: str,
        mid: str,
        segment_type: SegmentType,
        payload: str = "",
        meta: Dict[str, Any] = None
    ) -> Segment:
        return Segment(
            cid=cid,
            mid=mid,
            idx=cls._next_idx(mid),
            type=segment_type,
            payload=payload,
            meta=meta or {},
        )
    
    @classmethod
    def thinking_start(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.THINKING_START, "", meta)
    
    @classmethod
    def thinking_delta(cls, cid: str, mid: str, payload: str) -> Segment:
        return cls.build(cid, mid, SegmentType.THINKING_DELTA, payload)
    
    @classmethod
    def thinking_end(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.THINKING_END, "", meta)
    
    @classmethod
    def text_start(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.TEXT_START, "", meta)
    
    @classmethod
    def text_delta(cls, cid: str, mid: str, payload: str) -> Segment:
        return cls.build(cid, mid, SegmentType.TEXT_DELTA, payload)
    
    @classmethod
    def text_end(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.TEXT_END, "", meta)
    
    @classmethod
    def plan_start(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.PLAN_START, "", meta)
    
    @classmethod
    def plan_delta(cls, cid: str, mid: str, payload: str) -> Segment:
        return cls.build(cid, mid, SegmentType.PLAN_DELTA, payload)
    
    @classmethod
    def plan_end(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.PLAN_END, "", meta)
    
    @classmethod
    def state_change(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.STATE_CHANGE, "", meta)
    
    @classmethod
    def tool_call(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.TOOL_CALL, "", meta)
    
    @classmethod
    def tool_res(cls, cid: str, mid: str, payload: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.TOOL_RES, payload, meta)
    
    @classmethod
    def error(cls, cid: str, mid: str, payload: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.ERROR, payload, meta)
    
    @classmethod
    def done(cls, cid: str, mid: str, meta: dict = None) -> Segment:
        return cls.build(cid, mid, SegmentType.DONE, "", meta)


@dataclass
class ContentBlock:
    type: SegmentType
    content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "type": self.type.value,
            "content": self.content,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ContentBlock":
        return cls(
            type=SegmentType(data["type"]),
            content=data.get("content", ""),
            metadata=data.get("metadata", {}),
        )


@dataclass
class Message:
    role: str
    message_id: str
    conversation_id: str
    session_id: str
    workspace_id: str
    content_blocks: List[ContentBlock] = field(default_factory=list)
    content: str = ""
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "message_id": self.message_id,
            "conversation_id": self.conversation_id,
            "session_id": self.session_id,
            "workspace_id": self.workspace_id,
            "content_blocks": [block.to_dict() for block in self.content_blocks],
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Message":
        content_blocks = [ContentBlock.from_dict(block) for block in data.get("content_blocks", [])]
        timestamp = data.get("timestamp")
        if isinstance(timestamp, str):
            try:
                timestamp = datetime.fromisoformat(timestamp)
            except ValueError:
                timestamp = datetime.now()
        else:
            timestamp = datetime.now()

        return cls(
            role=data["role"],
            message_id=data["message_id"],
            conversation_id=data["conversation_id"],
            session_id=data["session_id"],
            workspace_id=data["workspace_id"],
            content_blocks=content_blocks,
            content=data.get("content", ""),
            timestamp=timestamp,
            metadata=data.get("metadata", {}),
        )

    def add_block(self, block: ContentBlock) -> None:
        self.content_blocks.append(block)
        if block.type in (SegmentType.TEXT_DELTA, SegmentType.TEXT_START):
            self.content += block.content

    def get_last_block(self) -> Optional[ContentBlock]:
        if self.content_blocks:
            return self.content_blocks[-1]
        return None

    def get_blocks_by_type(self, block_type: SegmentType) -> List[ContentBlock]:
        return [block for block in self.content_blocks if block.type == block_type]


class MessageFormatter:
    ROLE_USER = "user"
    ROLE_ASSISTANT = "assistant"
    ROLE_SYSTEM = "system"
    ROLE_TOOL = "tool"

    @staticmethod
    def format_text(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        text: str,
        role: str = ROLE_ASSISTANT,
    ) -> Message:
        block = ContentBlock(
            type=SegmentType.TEXT_DELTA,
            content=text,
        )
        return Message(
            role=role,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            content_blocks=[block],
            content=text,
        )

    @staticmethod
    def format_error(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        error_message: str,
    ) -> Message:
        block = ContentBlock(
            type=SegmentType.ERROR,
            content=error_message,
        )
        return Message(
            role=MessageFormatter.ROLE_ASSISTANT,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            content_blocks=[block],
        )

    @staticmethod
    def format_done(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
    ) -> Message:
        block = ContentBlock(
            type=SegmentType.DONE,
            content="",
        )
        return Message(
            role=MessageFormatter.ROLE_ASSISTANT,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            content_blocks=[block],
        )


ContentBlockType = SegmentType
CanonicalSegment = Segment
CanonicalMessage = Message
CanonicalFormatter = MessageFormatter
