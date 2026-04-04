from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class SegmentType(Enum):
    TEXT = "text"
    THINKING = "thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    DONE = "done"


@dataclass
class CanonicalSegment:
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
    def from_dict(cls, data: dict) -> "CanonicalSegment":
        return cls(
            type=SegmentType(data["type"]),
            content=data.get("content", ""),
            metadata=data.get("metadata", {}),
        )


@dataclass
class CanonicalMessage:
    role: str
    message_id: str
    conversation_id: str
    session_id: str
    workspace_id: str
    segments: List[CanonicalSegment] = field(default_factory=list)
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
            "segments": [seg.to_dict() for seg in self.segments],
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "CanonicalMessage":
        segments = [CanonicalSegment.from_dict(seg) for seg in data.get("segments", [])]
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
            segments=segments,
            content=data.get("content", ""),
            timestamp=timestamp,
            metadata=data.get("metadata", {}),
        )

    def add_segment(self, segment: CanonicalSegment) -> None:
        self.segments.append(segment)
        if segment.type == SegmentType.TEXT:
            self.content += segment.content

    def get_last_segment(self) -> Optional[CanonicalSegment]:
        if self.segments:
            return self.segments[-1]
        return None

    def get_segments_by_type(self, segment_type: SegmentType) -> List[CanonicalSegment]:
        return [seg for seg in self.segments if seg.type == segment_type]


class CanonicalFormatter:
    ROLE_USER = "user"
    ROLE_ASSISTANT = "assistant"
    ROLE_SYSTEM = "system"
    ROLE_TOOL = "tool"

    @staticmethod
    def format_text_token(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        token: str,
        role: str = ROLE_ASSISTANT,
    ) -> CanonicalMessage:
        segment = CanonicalSegment(
            type=SegmentType.TEXT,
            content=token,
        )
        return CanonicalMessage(
            role=role,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            segments=[segment],
            content=token,
        )

    @staticmethod
    def format_thinking(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        content: str,
        duration_ms: Optional[int] = None,
    ) -> CanonicalMessage:
        metadata = {}
        if duration_ms is not None:
            metadata["duration_ms"] = duration_ms
        segment = CanonicalSegment(
            type=SegmentType.THINKING,
            content=content,
            metadata=metadata,
        )
        return CanonicalMessage(
            role=CanonicalFormatter.ROLE_ASSISTANT,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            segments=[segment],
        )

    @staticmethod
    def format_tool_call(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        tool_call_id: str,
        name: str,
        arguments: str,
    ) -> CanonicalMessage:
        segment = CanonicalSegment(
            type=SegmentType.TOOL_CALL,
            content="",
            metadata={
                "tool_call_id": tool_call_id,
                "name": name,
                "arguments": arguments,
            },
        )
        return CanonicalMessage(
            role=CanonicalFormatter.ROLE_ASSISTANT,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            segments=[segment],
        )

    @staticmethod
    def format_tool_result(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        tool_call_id: str,
        content: str,
    ) -> CanonicalMessage:
        segment = CanonicalSegment(
            type=SegmentType.TOOL_RESULT,
            content=content,
            metadata={
                "tool_call_id": tool_call_id,
            },
        )
        return CanonicalMessage(
            role=CanonicalFormatter.ROLE_TOOL,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            segments=[segment],
        )

    @staticmethod
    def format_error(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        error_message: str,
    ) -> CanonicalMessage:
        segment = CanonicalSegment(
            type=SegmentType.ERROR,
            content=error_message,
        )
        return CanonicalMessage(
            role=CanonicalFormatter.ROLE_ASSISTANT,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            segments=[segment],
        )

    @staticmethod
    def format_done(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
    ) -> CanonicalMessage:
        segment = CanonicalSegment(
            type=SegmentType.DONE,
            content="",
        )
        return CanonicalMessage(
            role=CanonicalFormatter.ROLE_ASSISTANT,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            segments=[segment],
        )
