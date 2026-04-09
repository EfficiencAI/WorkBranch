import uuid
import asyncio
import traceback
import httpx
from typing import Any, Optional, Dict, List, Callable
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime

from core.logging import bind_ctx
from .service import WorkspaceService
from .graph import run_graph, run_graph_v2
from .agents.registry import AgentRegistry
from .tools.executors import ToolExecutor
from .tools import register_all_tools
from service.session_service.canonical import (
    SegmentType,
    ContentBlock,
    Message,
    MessageFormatter,
)


class ConversationStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Conversation:
    id: str
    workspace_id: str
    session_id: str
    status: ConversationStatus
    created_at: datetime = field(default_factory=datetime.now)
    task: Optional[asyncio.Task] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    messages: List[str] = field(default_factory=list)


class _CancellableLLMServiceProxy:
    def __init__(self, llm_service: Any, http_client: httpx.Client) -> None:
        self._llm_service = llm_service
        self._http_client = http_client

    def chat(self, messages: List[Dict[str, str]], system_prompt: Optional[str] = None, **kwargs: Any) -> str:
        return self._llm_service.chat(messages, system_prompt, http_client=self._http_client, **kwargs)

    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        stream_callback: Optional[Callable[[str], None]] = None,
        **kwargs: Any,
    ):
        return self._llm_service.chat_stream(
            messages,
            system_prompt,
            stream_callback=stream_callback,
            http_client=self._http_client,
            **kwargs,
        )

    def chat_with_history(
        self,
        user_message: str,
        history: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        return self._llm_service.chat_with_history(
            user_message,
            history,
            system_prompt,
            http_client=self._http_client,
            **kwargs,
        )

    def structured_output(self, messages: List[Dict[str, str]], schema: Any, system_prompt: Optional[str] = None, **kwargs: Any) -> Any:
        return self._llm_service.structured_output(
            messages,
            schema,
            system_prompt,
            http_client=self._http_client,
            **kwargs,
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._llm_service, name)


class AgentService:
    """Agent 服务：管理多个并发对话"""

    def __init__(self, workspace_service: WorkspaceService = None, llm_service=None, message_queue=None, settings_service=None):
        if workspace_service is None:
            workspace_service = WorkspaceService()
        self.ws = workspace_service
        self._llm_service = llm_service
        self._message_queue = message_queue
        self._settings = settings_service
        self._conversations: Dict[str, Conversation] = {}
        self._conversation_http_clients: Dict[str, List[httpx.Client]] = {}
        self._lock = asyncio.Lock()
        self.agent_registry = AgentRegistry()
        self.tool_executor = ToolExecutor(llm_service, self)
        # 注册所有工具
        register_all_tools()
    
    def _get_settings(self):
        if self._settings is None:
            from service.settings_service.settings_service import SettingsService
            self._settings = SettingsService()
        return self._settings
    
    def _get_memory_config(self) -> tuple:
        """获取记忆配置"""
        settings = self._get_settings()
        try:
            memory_mode = settings.get("agent:memory_mode")
        except KeyError:
            memory_mode = "accumulate"
        try:
            window_size = settings.get("agent:memory_window_size")
        except KeyError:
            window_size = 3
        return memory_mode, window_size

    def _get_llm_service(self):
        if self._llm_service is None:
            from .service import get_llm_service
            self._llm_service = get_llm_service()
        return self._llm_service

    def _get_message_queue(self):
        if self._message_queue is None:
            from service.session_service.mq import MessageQueue
            from service.settings_service.settings_service import SettingsService
            self._message_queue = MessageQueue(SettingsService())
        return self._message_queue

    def _generate_id(self) -> str:
        return str(uuid.uuid4())

    def _get_logger(self):
        from singleton import get_logging_runtime

        return get_logging_runtime().get_logger("agent")

    def _create_http_client(self) -> httpx.Client:
        settings = self._get_settings()
        timeout = httpx.Timeout(120.0, connect=30.0)
        proxy = None

        try:
            openai_proxy = settings.get("llm:openai_proxy")
        except KeyError:
            openai_proxy = None

        if openai_proxy:
            proxy = openai_proxy

        return httpx.Client(timeout=timeout, proxy=proxy)

    def _register_conversation_http_client(self, conversation_id: str, client: httpx.Client) -> None:
        self._conversation_http_clients.setdefault(conversation_id, []).append(client)

    def _deregister_conversation_http_client(self, conversation_id: str, client: httpx.Client) -> None:
        clients = self._conversation_http_clients.get(conversation_id)
        if not clients:
            return
        try:
            clients.remove(client)
        except ValueError:
            pass
        if not clients:
            self._conversation_http_clients.pop(conversation_id, None)

    def _close_conversation_http_clients(self, conversation_id: str) -> None:
        clients = self._conversation_http_clients.pop(conversation_id, [])
        for client in clients:
            try:
                client.close()
            except Exception:
                pass

    def _log_agent_event(
        self,
        level: str,
        event: str,
        msg: str,
        *,
        conversation_id: str,
        workspace_id: str,
        extra: Optional[dict] = None,
        exception: str | None = None,
    ) -> None:
        payload = {
            "conversation_id": conversation_id,
            "workspace_id": workspace_id,
        }
        if extra:
            payload.update(extra)
        with bind_ctx(conversation_id=conversation_id, workspace_id=workspace_id):
            logger = self._get_logger()
            if level == "ERROR":
                logger.error(event=event, msg=msg, extra=payload, exception=exception)
            else:
                logger.info(event=event, msg=msg, extra=payload)

    async def create_conversation(
        self,
        workspace_id: str = None,
        session_id: str = None
    ) -> str:
        """
        创建新对话
        
        Args:
            workspace_id: 可选的工作区ID，不提供则自动生成
            session_id: 可选的会话ID，不提供则自动生成
            
        Returns:
            对话ID
        """
        conv_id = self._generate_id()
        session_id = session_id or self._generate_id()
        workspace_id = workspace_id or conv_id
        
        self.ws.register(workspace_id, session_id)
        
        async with self._lock:
            self._conversations[conv_id] = Conversation(
                id=conv_id,
                workspace_id=workspace_id,
                session_id=session_id,
                status=ConversationStatus.PENDING
            )

        self._log_agent_event(
            "INFO",
            "conversation.created",
            "conversation created",
            conversation_id=conv_id,
            workspace_id=workspace_id,
            extra={"session_id": session_id},
        )

        print(f"[Agent] 创建对话: {conv_id}, 会话: {session_id}, 工作区: {workspace_id}")
        return conv_id

    async def send_message(
        self,
        conversation_id: str,
        message: str,
        message_id: str = None,
        stream_callback=None,
        parent_chain_messages: List[Dict] = None,
        current_conversation_messages: List[Dict] = None
    ) -> asyncio.Task:
        """
        异步发送消息 - 立即返回 Task，不阻塞
        
        Args:
            conversation_id: 对话ID
            message: 用户消息
            message_id: 消息ID（由 ConversationService 生成）
            stream_callback: 可选的流式回调函数
            parent_chain_messages: 父节点链的历史对话
            current_conversation_messages: 当前对话内的历史内容
            
        Returns:
            asyncio.Task 对象
        """
        async with self._lock:
            conv = self._conversations.get(conversation_id)
            if not conv:
                raise ValueError(f"对话 {conversation_id} 不存在")
        
        conv.messages.append(message)
        self._log_agent_event(
            "INFO",
            "message.sent",
            "message sent to conversation",
            conversation_id=conversation_id,
            workspace_id=conv.workspace_id,
            extra={"message_length": len(message), "message_id": message_id, "context_enabled": bool(parent_chain_messages or current_conversation_messages)},
        )

        task = asyncio.create_task(
            self._run_agent_async(
                conv.workspace_id,
                message,
                conversation_id,
                message_id,
                stream_callback,
                parent_chain_messages or [],
                current_conversation_messages or []
            )
        )
        
        conv.status = ConversationStatus.RUNNING
        conv.task = task
        
        task.add_done_callback(
            lambda t: self._on_task_complete(conversation_id, t)
        )
        
        print(f"[Agent] 对话 {conversation_id} 开始执行")
        return task

    async def _run_agent_async(
        self,
        workspace_id: str,
        message: str,
        conversation_id: str,
        message_id: str = None,
        stream_callback=None,
        parent_chain_messages: List[Dict] = None,
        current_conversation_messages: List[Dict] = None
    ):
        """
        异步执行 Agent（将同步 run_graph 包装为异步）
        """
        base_llm_service = self._get_llm_service()
        mq = self._get_message_queue()
        memory_mode, window_size = self._get_memory_config()
        settings = self._get_settings()
        http_client = self._create_http_client()
        self._register_conversation_http_client(conversation_id, http_client)
        llm_service = _CancellableLLMServiceProxy(base_llm_service, http_client)
        
        conv = self._conversations.get(conversation_id)
        session_id = conv.session_id if conv else ""
        
        if message_id is None:
            message_id = self._generate_id()
        
        with bind_ctx(conversation_id=conversation_id, workspace_id=workspace_id):
            self._log_agent_event(
                "INFO",
                "agent.run.started",
                "agent run started",
                conversation_id=conversation_id,
                workspace_id=workspace_id,
                extra={"session_id": session_id, "message_id": message_id, "parent_chain_count": len(parent_chain_messages) if parent_chain_messages else 0, "current_conv_count": len(current_conversation_messages) if current_conversation_messages else 0},
            )

            text_started = False

            def send_message(
                content: str = "",
                block_type: SegmentType = SegmentType.TEXT_DELTA,
                metadata: dict = None
            ):
                nonlocal text_started
                merged_metadata = {"message_id": message_id}
                if metadata:
                    merged_metadata.update(metadata)
                
                blocks = []
                
                if block_type == SegmentType.TEXT_DELTA:
                    if not text_started:
                        blocks.append(ContentBlock(
                            type=SegmentType.TEXT_START,
                            content="",
                            metadata=merged_metadata,
                        ))
                        text_started = True
                    
                    blocks.append(ContentBlock(
                        type=block_type,
                        content=content,
                        metadata=merged_metadata,
                    ))
                else:
                    blocks.append(ContentBlock(
                        type=block_type,
                        content=content,
                        metadata=merged_metadata,
                    ))
                
                msg = Message(
                    role="assistant",
                    message_id=message_id,
                    conversation_id=conversation_id,
                    session_id=session_id,
                    workspace_id=workspace_id,
                    content_blocks=blocks,
                    content=content if block_type == SegmentType.TEXT_DELTA else "",
                    metadata=merged_metadata,
                )
                mq.publish_sync(msg)

            def cancel_check():
                """检查对话是否被取消，如果取消则抛出异常"""
                conv = self._conversations.get(conversation_id)
                if conv and conv.status == ConversationStatus.CANCELLED:
                    raise asyncio.CancelledError("对话已被取消")

            message_context = {
                "send_message": send_message,
                "session_id": session_id,
                "conversation_id": conversation_id,
                "workspace_id": workspace_id,
                "message_id": message_id,
                "cancel_check": cancel_check,
            }


            def run_with_config():
                try:
                    return run_graph_v2(
                        message,
                        workspace_id,
                        llm_service=llm_service,
                        token_callback=send_message,
                        memory_mode=memory_mode,
                        window_size=window_size,
                        settings_service=settings,
                        message_context=message_context,
                        parent_chain_messages=parent_chain_messages,
                        current_conversation_messages=current_conversation_messages
                    )
                finally:
                    self._deregister_conversation_http_client(conversation_id, http_client)
                    try:
                        http_client.close()
                    except Exception:
                        pass

            loop = asyncio.get_event_loop()
            try:
                result = await loop.run_in_executor(None, run_with_config)
            except Exception as exc:
                self._log_agent_event(
                    "ERROR",
                    "agent.run.failed",
                    "agent run failed",
                    conversation_id=conversation_id,
                    workspace_id=workspace_id,
                    extra={"session_id": session_id, "message_id": message_id, "error": str(exc)},
                    exception="".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
                )
                raise

            blocks = []
            if text_started:
                blocks.append(ContentBlock(
                    type=SegmentType.TEXT_END,
                    content="",
                    metadata={"message_id": message_id},
                ))
            
            blocks.append(ContentBlock(
                type=SegmentType.DONE,
                content="",
                metadata={"message_id": message_id},
            ))
            done_msg = Message(
                role="assistant",
                message_id=message_id,
                conversation_id=conversation_id,
                session_id=session_id,
                workspace_id=workspace_id,
                content_blocks=blocks,
                metadata={"message_id": message_id},
            )
            mq.publish_sync(done_msg)

            self._log_agent_event(
                "INFO",
                "agent.run.completed",
                "agent run completed",
                conversation_id=conversation_id,
                workspace_id=workspace_id,
                extra={"session_id": session_id},
            )

            if stream_callback:
                await stream_callback(result)

            return result

    def _on_task_complete(self, conversation_id: str, task: asyncio.Task):
        """任务完成回调"""
        conv = self._conversations.get(conversation_id)
        if not conv:
            return
        
        try:
            conv.result = task.result()
            conv.status = ConversationStatus.COMPLETED
            print(f"[Agent] 对话 {conversation_id} 执行完成")
        except asyncio.CancelledError:
            conv.status = ConversationStatus.CANCELLED
            print(f"[Agent] 对话 {conversation_id} 已取消")
        except Exception as e:
            conv.error = str(e)
            conv.status = ConversationStatus.FAILED
            print(f"[Agent] 对话 {conversation_id} 执行失败: {e}")

    def get_status(self, conversation_id: str) -> Optional[dict]:
        """
        获取对话状态
        
        Args:
            conversation_id: 对话ID
            
        Returns:
            对话状态字典，不存在返回 None
        """
        conv = self._conversations.get(conversation_id)
        if not conv:
            return None
        
        return {
            "id": conv.id,
            "workspace_id": conv.workspace_id,
            "session_id": conv.session_id,
            "status": conv.status.value,
            "created_at": conv.created_at.isoformat(),
            "result": conv.result,
            "error": conv.error,
            "message_count": len(conv.messages)
        }

    def get_result(self, conversation_id: str) -> Optional[dict]:
        """
        获取对话结果（仅当完成时）
        
        Args:
            conversation_id: 对话ID
            
        Returns:
            执行结果，未完成返回 None
        """
        conv = self._conversations.get(conversation_id)
        if conv and conv.status == ConversationStatus.COMPLETED:
            return conv.result
        return None

    def cancel_conversation(self, conversation_id: str) -> bool:
        """
        取消对话
        
        Args:
            conversation_id: 对话ID
            
        Returns:
            是否成功取消
        """
        self._close_conversation_http_clients(conversation_id)
        conv = self._conversations.get(conversation_id)
        if conv and conv.task and not conv.task.done():
            conv.task.cancel()
            return True
        return False

    def list_conversations(self, status: ConversationStatus = None) -> List[dict]:
        """
        列出对话
        
        Args:
            status: 可选的状态过滤
            
        Returns:
            对话列表
        """
        conversations = []
        for conv in self._conversations.values():
            if status is None or conv.status == status:
                conversations.append(self.get_status(conv.id))
        return conversations

    def delete_conversation(self, conversation_id: str) -> bool:
        """
        删除对话记录
        
        Args:
            conversation_id: 对话ID
            
        Returns:
            是否成功删除
        """
        if conversation_id in self._conversations:
            conv = self._conversations[conversation_id]
            if conv.task and not conv.task.done():
                conv.task.cancel()
            del self._conversations[conversation_id]
            return True
        return False

    async def send_message_and_wait(
        self,
        conversation_id: str,
        message: str
    ) -> dict:
        """
        发送消息并等待完成（阻塞式，用于简单场景）
        
        Args:
            conversation_id: 对话ID
            message: 用户消息
            
        Returns:
            执行结果
        """
        task = await self.send_message(conversation_id, message)
        return await task

    def new_agent(
        self,
        user_message: str,
        workspace_id: Optional[str] = None,
        session_id: Optional[str] = None
    ):
        """
        启动一个新的 Agent（同步版本，向后兼容）
        
        注意：此方法会阻塞直到完成，建议使用异步方法
        
        架构说明:
            - Plan 节点使用 plan_agent 类型
            - Build 节点使用 build_agent 类型
            - SubAgent (explore_agent, review_agent) 通过工具调用
        
        Args:
            user_message: 用户输入的消息
            workspace_id: 可选的工作区ID
            session_id: 可选的会话ID
            
        Returns:
            执行结果
        """
        print("="*60)
        print("[Agent] 启动 Agent (同步模式)")
        print("="*60)

        if not session_id:
            session_id = self._generate_id()
            print(f"[Agent] 自动生成会话ID: {session_id}")
        
        if not workspace_id:
            workspace_id = self._generate_id()
            print(f"[Agent] 自动生成工作区ID: {workspace_id}")

        print(f"[Agent] 注册工作区...")
        self.ws.register(workspace_id, session_id)

        print(f"[Agent] 用户输入: {user_message}")
        print(f"[Agent] 会话ID: {session_id}")
        print(f"[Agent] 工作区ID: {workspace_id}")

        llm_service = self._get_llm_service()
        memory_mode, window_size = self._get_memory_config()
        settings = self._get_settings()
        result = run_graph_v2(
            user_message,
            workspace_id,
            llm_service=llm_service,
            memory_mode=memory_mode,
            window_size=window_size,
            settings_service=settings
        )

        print("\n[Agent] 任务完成！")
        print("="*60)
        return result

    async def new_agent_async(
        self,
        user_message: str,
        workspace_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> asyncio.Task:
        """
        启动一个新的 Agent（异步版本）
        
        创建对话并发送消息，立即返回 Task
        
        Args:
            user_message: 用户输入的消息
            workspace_id: 可选的工作区ID
            session_id: 可选的会话ID
            
        Returns:
            asyncio.Task 对象
        """
        conv_id = await self.create_conversation(workspace_id, session_id)
        return await self.send_message(conv_id, user_message)
