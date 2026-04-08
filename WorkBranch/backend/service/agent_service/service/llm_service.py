from typing import List, Dict, Any, Optional, Generator, Callable, Awaitable
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
import httpx
import time
import traceback
from core.logging import console


class LLMService:
    """LLM 服务：封装 LangChain OpenAI 调用"""
    
    _instance = None
    
    def __new__(cls, settings_service=None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, settings_service=None):
        if self._initialized:
            return
        
        self._settings = settings_service
        self._llm = None
        self._initialized = True
    
    def _get_llm(self) -> ChatOpenAI:
        """获取默认缓存 LLM 实例"""
        if self._llm is None:
            self._llm = self._build_llm()
        return self._llm

    def _build_llm(self, http_client: Any = None, http_async_client: Any = None) -> ChatOpenAI:
        """构造一个可选自定义 HTTP 客户端的 LLM 实例"""
        if self._settings is None:
            raise ValueError("Settings service not initialized")
        
        api_key = self._settings.get("llm:api_key")
        base_url = self._settings.get("llm:base_url")
        model = self._settings.get("llm:model")
        temperature = self._settings.get("llm:temperature")
        max_tokens = self._settings.get("llm:max_tokens")
        
        if not api_key:
            raise ValueError("LLM API key not configured. Please set llm:api_key in settings.")

        return ChatOpenAI(
            api_key=api_key,
            base_url=base_url,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=httpx.Timeout(120.0, connect=30.0),
            http_client=http_client,
            http_async_client=http_async_client,
        )
    
    def _log_llm_event(self, level: str, event: str, msg: str, extra: Optional[dict] = None, exception: str | None = None) -> None:
        from singleton import get_logging_runtime

        logger = get_logging_runtime().get_logger("agent")
        if level == "ERROR":
            logger.error(event=event, msg=msg, extra=extra, exception=exception)
        else:
            logger.info(event=event, msg=msg, extra=extra)

    def _build_llm_extra(self, operation: str, start_time: float, **kwargs) -> dict:
        extra = {
            "operation": operation,
            "provider": "openai_compatible",
            "model": None,
            "latency_ms": round((time.perf_counter() - start_time) * 1000),
        }
        try:
            extra["model"] = self._settings.get("llm:model") if self._settings is not None else None
        except KeyError:
            extra["model"] = None
        extra.update({k: v for k, v in kwargs.items() if v is not None})
        return extra

    def _extract_usage(self, result: Any) -> dict[str, int]:
        usage = getattr(result, "usage_metadata", None)
        if not isinstance(usage, dict):
            response_metadata = getattr(result, "response_metadata", None)
            if isinstance(response_metadata, dict):
                token_usage = response_metadata.get("token_usage")
                if isinstance(token_usage, dict):
                    usage = token_usage

        if not isinstance(usage, dict):
            return {}

        prompt_tokens = usage.get("input_tokens")
        if prompt_tokens is None:
            prompt_tokens = usage.get("prompt_tokens")

        completion_tokens = usage.get("output_tokens")
        if completion_tokens is None:
            completion_tokens = usage.get("completion_tokens")

        total_tokens = usage.get("total_tokens")
        if total_tokens is None and isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
            total_tokens = prompt_tokens + completion_tokens

        extracted = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }
        return {k: v for k, v in extracted.items() if isinstance(v, int)}

    def _invoke_with_logging(self, operation: str, invoke_fn):
        start_time = time.perf_counter()
        self._log_llm_event(
            "INFO",
            "llm.call.started",
            "llm call started",
            extra=self._build_llm_extra(operation, start_time),
        )
        try:
            result = invoke_fn()
        except Exception as exc:
            self._log_llm_event(
                "ERROR",
                "llm.call.failed",
                "llm call failed",
                extra=self._build_llm_extra(operation, start_time, error=str(exc)),
                exception="".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
            )
            raise
        self._log_llm_event(
            "INFO",
            "llm.call.completed",
            "llm call completed",
            extra=self._build_llm_extra(operation, start_time, **self._extract_usage(result)),
        )
        return result

    def _stream_with_logging(self, operation: str, stream_fn) -> Generator[str, None, None]:
        start_time = time.perf_counter()
        usage: dict[str, int] = {}
        self._log_llm_event(
            "INFO",
            "llm.call.started",
            "llm call started",
            extra=self._build_llm_extra(operation, start_time),
        )
        try:
            for chunk in stream_fn():
                if isinstance(chunk, tuple):
                    text, chunk_usage = chunk
                    if isinstance(chunk_usage, dict) and chunk_usage:
                        usage = chunk_usage
                    yield text
                else:
                    yield chunk
        except Exception as exc:
            self._log_llm_event(
                "ERROR",
                "llm.call.failed",
                "llm call failed",
                extra=self._build_llm_extra(operation, start_time, error=str(exc)),
                exception="".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
            )
            raise
        self._log_llm_event(
            "INFO",
            "llm.call.completed",
            "llm call completed",
            extra=self._build_llm_extra(operation, start_time, **usage),
        )

    def chat(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        http_client: Any = None,
        http_async_client: Any = None,
    ) -> str:
        """
        发送聊天请求
        
        Args:
            messages: 消息列表 [{"role": "user", "content": "..."}]
            system_prompt: 系统提示词
            
        Returns:
            AI 响应文本
        """
        if http_client is not None or http_async_client is not None:
            llm = self._build_llm(http_client=http_client, http_async_client=http_async_client)
        else:
            llm = self._get_llm()
        
        lc_messages = []
        
        if system_prompt:
            lc_messages.append(SystemMessage(content=system_prompt))
        
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            if role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                lc_messages.append(AIMessage(content=content))
            elif role == "system":
                lc_messages.append(SystemMessage(content=content))
        
        console.header("LLM 原始提示词", style="single")
        
        for i, msg in enumerate(lc_messages):
            role_name = msg.__class__.__name__.replace("Message", "").upper()
            console.box(f"[{i+1}] {role_name}", msg.content[:200])
        
        console.info(f"发送请求: {len(lc_messages)} 条消息")

        response = self._invoke_with_logging("chat", lambda: llm.invoke(lc_messages))

        console.success(f"收到响应: {len(response.content)} 字符")
        
        return response.content
    
    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        stream_callback: Optional[Callable[[str], None]] = None,
        http_client: Any = None,
        http_async_client: Any = None,
    ) -> Generator[str, None, None]:
        """
        流式聊天请求
        
        Args:
            messages: 消息列表
            system_prompt: 系统提示词
            stream_callback: 可选的流式回调函数，每个 token 调用一次
            
        Yields:
            AI 响应文本片段
        """
        if http_client is not None or http_async_client is not None:
            llm = self._build_llm(http_client=http_client, http_async_client=http_async_client)
        else:
            llm = self._get_llm()
        
        lc_messages = []
        
        if system_prompt:
            lc_messages.append(SystemMessage(content=system_prompt))
        
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            if role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                lc_messages.append(AIMessage(content=content))
            elif role == "system":
                lc_messages.append(SystemMessage(content=content))
        
        console.header("LLM 原始提示词", style="single")
        
        for i, msg in enumerate(lc_messages):
            role_name = msg.__class__.__name__.replace("Message", "").upper()
            console.box(f"[{i+1}] {role_name}", msg.content[:200])
        
        console.info(f"发送流式请求: {len(lc_messages)} 条消息")
        console.section("流式输出")
        
        def stream_chunks():
            for chunk in llm.stream(lc_messages):
                chunk_usage = self._extract_usage(chunk)
                if chunk.content:
                    print(chunk.content, end="", flush=True)
                    if stream_callback:
                        stream_callback(chunk.content)
                    yield chunk.content, chunk_usage

        yield from self._stream_with_logging("chat_stream", stream_chunks)
        
        console.section_end()
    
    def chat_with_history(
        self,
        user_message: str,
        history: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        http_client: Any = None,
        http_async_client: Any = None,
    ) -> str:
        """
        带历史记录的聊天
        
        Args:
            user_message: 用户消息
            history: 历史消息
            system_prompt: 系统提示词
            
        Returns:
            AI 响应文本
        """
        messages = history + [{"role": "user", "content": user_message}]
        return self.chat(messages, system_prompt, http_client=http_client, http_async_client=http_async_client)
    
    def structured_output(
        self,
        messages: List[Dict[str, str]],
        schema: Any,
        system_prompt: Optional[str] = None,
        http_client: Any = None,
        http_async_client: Any = None,
    ) -> Any:
        """
        结构化输出
        
        Args:
            messages: 消息列表
            schema: 输出 schema (Pydantic model)
            system_prompt: 系统提示词
            
        Returns:
            结构化输出
        """
        if http_client is not None or http_async_client is not None:
            llm = self._build_llm(http_client=http_client, http_async_client=http_async_client)
        else:
            llm = self._get_llm()
        structured_llm = llm.with_structured_output(schema)
        
        lc_messages = []
        
        if system_prompt:
            lc_messages.append(SystemMessage(content=system_prompt))
        
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            if role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                lc_messages.append(AIMessage(content=content))
        
        console.info(f"结构化输出请求: {len(lc_messages)} 条消息")
        
        response = self._invoke_with_logging(
            "structured_output",
            lambda: structured_llm.invoke(lc_messages),
        )
        
        console.success("结构化输出完成")
        
        return response


def get_llm_service(settings_service=None) -> LLMService:
    """获取 LLM 服务单例"""
    return LLMService(settings_service)
