import asyncio
import json
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime

from singleton import get_conversation_dao
from data.conversation_dao import ConversationDAO
from service.session_service.canonical import (
    Message,
    ContentBlock,
    SegmentType,
)


@dataclass
class MessageDraft:
    message_id: str
    conversation_id: str
    session_id: int
    user_content: str
    assistant_blocks: List[ContentBlock] = field(default_factory=list)
    status: str = 'streaming'
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

        self._drafts: Dict[str, MessageDraft] = {}
        self._lock = asyncio.Lock()
        self._dao: ConversationDAO = get_conversation_dao()

    async def create_message(
        self,
        message_id: str,
        conversation_id: str,
        session_id: int,
        user_content: str,
    ) -> None:
        async with self._lock:
            persisted = self._dao.get_conversation_by_id(conversation_id)
            if not persisted:
                raise ValueError(f"Conversation {conversation_id} not found")

            self._dao.create_message(
                message_id=message_id,
                conversation_id=conversation_id,
                session_id=session_id,
                user_content=user_content,
                status='streaming',
            )

            self._drafts[message_id] = MessageDraft(
                message_id=message_id,
                conversation_id=conversation_id,
                session_id=session_id,
                user_content=user_content,
                status='streaming',
            )

    async def append_assistant_content(
        self,
        message_id: str,
        content: str,
        block_type: SegmentType = SegmentType.TEXT_DELTA,
    ) -> None:
        async with self._lock:
            if message_id not in self._drafts:
                return

            draft = self._drafts[message_id]
            block = ContentBlock(type=block_type, content=content)
            draft.assistant_blocks.append(block)

    async def complete_message(
        self,
        message_id: str,
        status: str = 'completed',
    ) -> Optional[str]:
        async with self._lock:
            if message_id not in self._drafts:
                return None

            draft = self._drafts[message_id]

            merged_blocks = self._merge_adjacent_deltas(draft.assistant_blocks)
            assistant_content = json.dumps(
                [block.to_dict() for block in merged_blocks],
                ensure_ascii=False
            )

            # 提取thinking内容
            thinking_blocks = [block for block in merged_blocks if block.type.value == 'thinking']
            thinking_content = ''.join(block.content for block in thinking_blocks) if thinking_blocks else None

            self._dao.update_message_assistant(
                message_id=message_id,
                assistant_content=assistant_content,
                status=status,
                thinking_content=thinking_content,
            )

            del self._drafts[message_id]

            print(f"[Buffer] 已完成消息: {message_id}, status={status}")
            return assistant_content

    async def fail_message(self, message_id: str) -> None:
        async with self._lock:
            if message_id not in self._drafts:
                return

            draft = self._drafts[message_id]

            merged_blocks = self._merge_adjacent_deltas(draft.assistant_blocks)
            assistant_content = json.dumps(
                [block.to_dict() for block in merged_blocks],
                ensure_ascii=False
            ) if merged_blocks else None

            # 提取thinking内容
            thinking_blocks = [block for block in merged_blocks if block.type.value == 'thinking']
            thinking_content = ''.join(block.content for block in thinking_blocks) if thinking_blocks else None

            self._dao.update_message_assistant(
                message_id=message_id,
                assistant_content=assistant_content or '',
                status='error',
                thinking_content=thinking_content,
            )

            del self._drafts[message_id]

    async def get_draft_assistant_text(self, message_id: str) -> Optional[str]:
        async with self._lock:
            if message_id not in self._drafts:
                return None

            draft = self._drafts[message_id]
            text_parts = []
            for block in draft.assistant_blocks:
                if block.type == SegmentType.TEXT_DELTA:
                    text_parts.append(block.content)
            return "".join(text_parts)

    async def get_draft_blocks(self, message_id: str) -> Optional[List[ContentBlock]]:
        async with self._lock:
            if message_id not in self._drafts:
                return None
            return list(self._drafts[message_id].assistant_blocks)

    async def consume_message(self, message: Message) -> Optional[str]:
        async with self._lock:
            message_id = message.message_id

            if message_id not in self._drafts:
                return None

            draft = self._drafts[message_id]

            for block in message.content_blocks:
                if block.type == SegmentType.DONE:
                    return await self._complete_draft_unlocked(message_id)
                else:
                    draft.assistant_blocks.append(block)

            return None

    async def _complete_draft_unlocked(self, message_id: str) -> Optional[str]:
        if message_id not in self._drafts:
            return None

        draft = self._drafts[message_id]

        merged_blocks = self._merge_adjacent_deltas(draft.assistant_blocks)
        assistant_content = json.dumps(
            [block.to_dict() for block in merged_blocks],
            ensure_ascii=False
        )

        self._dao.update_message_assistant(
            message_id=message_id,
            assistant_content=assistant_content,
            status='completed',
        )

        del self._drafts[message_id]

        print(f"[Buffer] 已完成消息: {message_id}")
        return assistant_content

    def _merge_adjacent_deltas(self, blocks: List[ContentBlock]) -> List[ContentBlock]:
        if not blocks:
            return []

        delta_types = {
            SegmentType.THINKING_DELTA,
            SegmentType.TEXT_DELTA,
            SegmentType.PLAN_DELTA,
        }

        merged = []

        for block in blocks:
            if block.type in delta_types and merged:
                last_block = merged[-1]
                if last_block.type == block.type:
                    last_block.content += block.content
                    continue

            merged.append(ContentBlock(
                type=block.type,
                content=block.content,
                metadata=block.metadata.copy() if block.metadata else {}
            ))

        return merged

    async def clear(self, conversation_id: str) -> bool:
        async with self._lock:
            cleared = False
            to_delete = [
                msg_id for msg_id, draft in self._drafts.items()
                if draft.conversation_id == conversation_id
            ]
            for msg_id in to_delete:
                draft = self._drafts[msg_id]
                merged_blocks = self._merge_adjacent_deltas(draft.assistant_blocks)
                assistant_content = json.dumps(
                    [block.to_dict() for block in merged_blocks],
                    ensure_ascii=False
                ) if merged_blocks else ''

                # 提取thinking内容
                thinking_blocks = [block for block in merged_blocks if block.type.value == 'thinking']
                thinking_content = ''.join(block.content for block in thinking_blocks) if thinking_blocks else None

                self._dao.update_message_assistant(
                    message_id=msg_id,
                    assistant_content=assistant_content,
                    status='error',
                    thinking_content=thinking_content,
                )
                del self._drafts[msg_id]
                cleared = True
            return cleared

    async def get_active_messages(self) -> List[Dict[str, Any]]:
        async with self._lock:
            result = []
            for msg_id, draft in self._drafts.items():
                result.append({
                    "message_id": msg_id,
                    "conversation_id": draft.conversation_id,
                    "session_id": draft.session_id,
                    "status": draft.status,
                    "created_at": draft.created_at.isoformat()
                })
            return result

    def has_draft(self, message_id: str) -> bool:
        return message_id in self._drafts
