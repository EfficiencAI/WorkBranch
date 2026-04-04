from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class ContentBlockType(Enum):
    TEXT = "text"
    THINKING = "thinking"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    DONE = "done"


@dataclass
class ContentBlock:
    type: ContentBlockType
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
            type=ContentBlockType(data["type"]),
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
        if block.type == ContentBlockType.TEXT:
            self.content += block.content

    def get_last_block(self) -> Optional[ContentBlock]:
        if self.content_blocks:
            return self.content_blocks[-1]
        return None

    def get_blocks_by_type(self, block_type: ContentBlockType) -> List[ContentBlock]:
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
            type=ContentBlockType.TEXT,
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
    def format_thinking(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        content: str,
        duration_ms: Optional[int] = None,
    ) -> Message:
        metadata = {}
        if duration_ms is not None:
            metadata["duration_ms"] = duration_ms
        block = ContentBlock(
            type=ContentBlockType.THINKING,
            content=content,
            metadata=metadata,
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
    def format_tool_use(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        tool_call_id: str,
        name: str,
        arguments: str,
    ) -> Message:
        block = ContentBlock(
            type=ContentBlockType.TOOL_USE,
            content="",
            metadata={
                "tool_call_id": tool_call_id,
                "name": name,
                "arguments": arguments,
            },
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
    def format_tool_result(
        message_id: str,
        conversation_id: str,
        session_id: str,
        workspace_id: str,
        tool_call_id: str,
        content: str,
    ) -> Message:
        block = ContentBlock(
            type=ContentBlockType.TOOL_RESULT,
            content=content,
            metadata={
                "tool_call_id": tool_call_id,
            },
        )
        return Message(
            role=MessageFormatter.ROLE_TOOL,
            message_id=message_id,
            conversation_id=conversation_id,
            session_id=session_id,
            workspace_id=workspace_id,
            content_blocks=[block],
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
            type=ContentBlockType.ERROR,
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
            type=ContentBlockType.DONE,
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


CanonicalSegment = ContentBlock
SegmentType = ContentBlockType
CanonicalMessage = Message
CanonicalFormatter = MessageFormatter
