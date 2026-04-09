import asyncio
from typing import Optional, Dict, Any, List
import queue
import threading
import json
import time
from pathlib import Path

from service.settings_service.settings_service import SettingsService
from core.logging import bind_ctx
from service.session_service.canonical import (
    Message,
    ContentBlock,
    MessageFormatter,
)


class MessageQueue:
    """消息队列服务（单例）- 纯事件通道"""

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
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}
        self._subscribers_lock = threading.Lock()
        self._file_lock = threading.Lock()
        self._logger = None

    def _get_max_size(self) -> int:
        try:
            return self._settings.get("mq:max_size")
        except KeyError:
            return 1000
    
    def _log_message_event(
        self,
        level: str,
        event: str,
        msg: str,
        message: Message,
        *,
        source: str,
        target: str,
        latency_ms: Optional[int] = None,
        exception: str | None = None,
        error: str | None = None,
    ) -> None:
        extra = {
            "conversation_id": message.conversation_id,
            "workspace_id": message.workspace_id,
            "source": source,
            "target": target,
            "size": len(message.content or ""),
        }
        if latency_ms is not None:
            extra["latency_ms"] = latency_ms
        if error is not None:
            extra["error"] = error
        with bind_ctx(conversation_id=message.conversation_id, workspace_id=message.workspace_id):
            logger = self._get_logger()
            if level == "ERROR":
                logger.error(event=event, msg=msg, extra=extra, exception=exception)
            else:
                logger.info(event=event, msg=msg, extra=extra)

    def _get_logger(self):
        if self._logger is None:
            from singleton import get_logging_runtime

            self._logger = get_logging_runtime().get_logger("mq")
        return self._logger

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
    
    def _save_message_to_file(self, message: Message) -> None:
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

    async def publish(self, message: Message) -> bool:
        """
        生产者：发布消息到队列

        Args:
            message: 消息对象

        Returns:
            是否成功发布（队列满时返回 False）
        """
        try:
            self._queue.put_nowait(message)
            self._log_message_event(
                "INFO",
                "mq.message.received",
                "mq message queued",
                message,
                source="producer",
                target="async_queue",
            )
            return True
        except asyncio.QueueFull:
            self._log_message_event(
                "ERROR",
                "mq.message.failed",
                "mq message dropped because queue is full",
                message,
                source="producer",
                target="async_queue",
                error="queue_full",
            )
            return False

    async def publish_batch(self, messages: list[Message]) -> int:
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

    def publish_sync(self, message: Message) -> bool:
        """
        同步发布消息（用于同步上下文，如 LLM 流式回调）

        将消息放入同步队列，由异步消费者线程转发到异步队列

        Args:
            message: 消息对象

        Returns:
            是否成功发布
        """
        try:
            self._sync_queue.put_nowait(message)
            self._log_message_event(
                "INFO",
                "mq.message.received",
                "mq sync message queued",
                message,
                source="agent",
                target="sync_queue",
            )
            return True
        except queue.Full:
            self._log_message_event(
                "ERROR",
                "mq.message.failed",
                "mq sync message dropped because queue is full",
                message,
                source="agent",
                target="sync_queue",
                error="queue_full",
            )
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
                pass

    async def _put_to_async_queue(self, message: Message) -> None:
        """将消息放入异步队列"""
        try:
            self._queue.put_nowait(message)
        except asyncio.QueueFull:
            pass

    def subscribe(self, conversation_id: str) -> asyncio.Queue:
        subscriber_queue: asyncio.Queue = asyncio.Queue()
        with self._subscribers_lock:
            subscribers = self._subscribers.setdefault(conversation_id, [])
            subscribers.append(subscriber_queue)
        return subscriber_queue

    def unsubscribe(self, conversation_id: str, subscriber_queue: asyncio.Queue) -> None:
        with self._subscribers_lock:
            subscribers = self._subscribers.get(conversation_id)
            if not subscribers:
                return
            self._subscribers[conversation_id] = [q for q in subscribers if q is not subscriber_queue]
            if not self._subscribers[conversation_id]:
                del self._subscribers[conversation_id]

    def _publish_to_subscribers(self, message: Message) -> None:
        with self._subscribers_lock:
            subscribers = list(self._subscribers.get(message.conversation_id, []))
        for subscriber in subscribers:
            try:
                subscriber.put_nowait(message)
            except Exception:
                continue

    async def start_consumer(self) -> None:
        """启动消费者后台任务"""
        if self._running:
            return

        self._running = True
        self._consumer_task = asyncio.create_task(self._consume_loop())
        self._start_sync_bridge()

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

    async def _consume_loop(self) -> None:
        """消费者循环（内部方法）"""
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
                pass

    async def _consume(self, message: Message) -> None:
        """
        消费单条消息

        MQ 只做通道层：
        - 保存到 JSON 文件（调试/转录）
        - 广播给订阅方
        - 转发给 Buffer 消费
        """
        try:
            self._save_message_to_file(message)
            self._publish_to_subscribers(message)
            
            await self._forward_to_buffer(message)
            
        except Exception as exc:
            raise

    async def _forward_to_buffer(self, message: Message) -> None:
        """将事件转发给 Buffer 消费"""
        from singleton import get_conversation_buffer
        
        buffer = get_conversation_buffer()
        
        if not buffer.has_draft(message.message_id):
            return
        
        await buffer.consume_message(message)

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
