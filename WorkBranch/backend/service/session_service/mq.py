import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
import queue
import threading
import json
import os
from pathlib import Path

from service.settings_service.settings_service import SettingsService


class MessageType(Enum):
    TEXT = "text"
    ERROR = "error"
    DONE = "done"
    THINKING = "thinking"
    PLAN = "plan"
    PLAN_START = "plan_start"
    PLAN_END = "plan_end"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    EXECUTE_START = "execute_start"
    EXECUTE_END = "execute_end"
    STEP_START = "step_start"
    STEP_END = "step_end"


@dataclass
class StreamMessage:
    session_id: str
    conversation_id: str
    workspace_id: str
    content: str
    message_type: MessageType = MessageType.TEXT
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "conversation_id": self.conversation_id,
            "workspace_id": self.workspace_id,
            "content": self.content,
            "message_type": self.message_type.value,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }


class MessageQueue:
    """消息队列服务（单例）"""

    def __init__(self, settings: SettingsService = None):
        if settings is None:
            settings = SettingsService()
        self._settings = settings
        self._max_size = self._get_max_size()
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=self._max_size)
        self._consumer_task: Optional[asyncio.Task] = None
        self._running = False
        self._sync_queue: queue.Queue = queue.Queue(maxsize=self._max_size)
        self._sync_bridge_running = False
        self._sync_bridge_thread: Optional[threading.Thread] = None
        self._main_loop: Optional[asyncio.AbstractEventLoop] = None
        self._storage_dir = self._get_storage_dir()
        self._conversation_messages: Dict[str, List[dict]] = {}
        self._file_lock = threading.Lock()

    def _get_max_size(self) -> int:
        try:
            return self._settings.get("mq:max_size")
        except KeyError:
            return 1000
    
    def _get_storage_dir(self) -> Path:
        try:
            storage_dir = self._settings.get("mq:storage_dir")
        except KeyError:
            storage_dir = ".temp/conversations"
        
        path = Path(storage_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def _get_conversation_file(self, conversation_id: str) -> Path:
        return self._storage_dir / f"{conversation_id}.json"
    
    def _save_message_to_file(self, message: StreamMessage) -> None:
        msg_dict = message.to_dict()
        conv_id = message.conversation_id
        
        with self._file_lock:
            if conv_id not in self._conversation_messages:
                self._conversation_messages[conv_id] = []
                file_path = self._get_conversation_file(conv_id)
                if file_path.exists():
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            self._conversation_messages[conv_id] = json.load(f)
                    except Exception as e:
                        print(f"[MQ] 加载已有消息文件失败: {e}")
                        self._conversation_messages[conv_id] = []
            
            self._conversation_messages[conv_id].append(msg_dict)
            
            file_path = self._get_conversation_file(conv_id)
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(self._conversation_messages[conv_id], f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[MQ] 保存消息文件失败: {e}")

    async def publish(self, message: StreamMessage) -> bool:
        """
        生产者：发布消息到队列
        
        Args:
            message: 流式消息对象
            
        Returns:
            是否成功发布（队列满时返回 False）
        """
        try:
            self._queue.put_nowait(message)
            return True
        except asyncio.QueueFull:
            print(f"[MQ] 队列已满 (max_size={self._max_size})，消息被丢弃: {message.content[:50]}...")
            return False

    async def publish_batch(self, messages: list[StreamMessage]) -> int:
        """
        批量发布消息
        
        Args:
            messages: 消息列表
            
        Returns:
            成功发布的消息数量
        """
        success_count = 0
        for msg in messages:
            if await self.publish(msg):
                success_count += 1
        return success_count

    def publish_sync(self, message: StreamMessage) -> bool:
        """
        同步发布消息（用于同步上下文，如 LLM 流式回调）
        
        将消息放入同步队列，由异步消费者线程转发到异步队列
        
        Args:
            message: 流式消息对象
            
        Returns:
            是否成功发布
        """
        try:
            self._sync_queue.put_nowait(message)
            return True
        except queue.Full:
            print(f"[MQ] 同步队列已满，消息被丢弃: {message.content[:50]}...")
            return False

    def _start_sync_bridge(self) -> None:
        """启动同步-异步桥接线程"""
        if self._sync_bridge_running:
            return
        
        self._sync_bridge_running = True
        try:
            self._main_loop = asyncio.get_running_loop()
        except RuntimeError:
            self._main_loop = None
        
        self._sync_bridge_thread = threading.Thread(
            target=self._sync_bridge_loop,
            daemon=True
        )
        self._sync_bridge_thread.start()
        print("[MQ] 同步-异步桥接线程已启动")

    def _sync_bridge_loop(self) -> None:
        """同步-异步桥接循环"""
        while self._sync_bridge_running:
            try:
                message = self._sync_queue.get(timeout=0.1)
                if self._main_loop and self._main_loop.is_running():
                    self._main_loop.call_soon_threadsafe(
                        lambda msg=message: self._main_loop.create_task(self._put_to_async_queue(msg))
                    )
                else:
                    self._queue.put_nowait(message)
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[MQ] 同步桥接异常: {e}")
        
        loop.close()

    async def _put_to_async_queue(self, message: StreamMessage) -> None:
        """将消息放入异步队列"""
        try:
            self._queue.put_nowait(message)
        except asyncio.QueueFull:
            print(f"[MQ] 队列已满，消息被丢弃: {message.content[:50]}...")

    async def start_consumer(self) -> None:
        """启动消费者后台任务"""
        if self._running:
            print("[MQ] 消费者已在运行")
            return

        self._running = True
        self._consumer_task = asyncio.create_task(self._consume_loop())
        self._start_sync_bridge()
        print(f"[MQ] 消费者已启动 (队列容量: {self._max_size})")

    async def stop_consumer(self) -> None:
        """停止消费者"""
        if not self._running:
            return

        self._running = False
        self._sync_bridge_running = False

        if self._consumer_task:
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass
            self._consumer_task = None

        print("[MQ] 消费者已停止")

    async def _consume_loop(self) -> None:
        """消费者循环（内部方法）"""
        print("[MQ] 消费循环开始")
        while self._running:
            try:
                message = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=1.0
                )
                await self._consume(message)
                self._queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[MQ] 消费异常: {e}")

        print("[MQ] 消费循环结束")

    async def _consume(self, message: StreamMessage) -> None:
        """
        消费单条消息
        
        功能：
        - 打印到控制台
        - 保存到 JSON 文件（按对话 ID）
        """
        msg_dict = message.to_dict()
        print(f"[MQ] 消费消息: {msg_dict}")
        
        self._save_message_to_file(message)

    @property
    def size(self) -> int:
        """当前队列大小"""
        return self._queue.qsize()

    @property
    def is_running(self) -> bool:
        """消费者是否在运行"""
        return self._running

    async def wait_until_empty(self, timeout: float = None) -> bool:
        """
        等待队列清空
        
        Args:
            timeout: 超时时间（秒），None 表示无限等待
            
        Returns:
            是否成功清空
        """
        try:
            await asyncio.wait_for(self._queue.join(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False
