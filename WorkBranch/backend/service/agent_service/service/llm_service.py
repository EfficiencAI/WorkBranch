from typing import List, Dict, Any, Optional, Generator, Callable, Awaitable
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage


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
        """获取 LLM 实例"""
        if self._llm is None:
            if self._settings is None:
                raise ValueError("Settings service not initialized")
            
            api_key = self._settings.get("llm:api_key")
            base_url = self._settings.get("llm:base_url")
            model = self._settings.get("llm:model")
            temperature = self._settings.get("llm:temperature")
            max_tokens = self._settings.get("llm:max_tokens")
            
            if not api_key:
                raise ValueError("LLM API key not configured. Please set llm:api_key in settings.")
            
            self._llm = ChatOpenAI(
                api_key=api_key,
                base_url=base_url,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        
        return self._llm
    
    def chat(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None
    ) -> str:
        """
        发送聊天请求
        
        Args:
            messages: 消息列表 [{"role": "user", "content": "..."}]
            system_prompt: 系统提示词
            
        Returns:
            AI 响应文本
        """
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
        
        print(f"[LLM] 发送请求: {len(lc_messages)} 条消息")
        
        response = llm.invoke(lc_messages)
        
        print(f"[LLM] 收到响应: {len(response.content)} 字符")
        
        return response.content
    
    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        stream_callback: Optional[Callable[[str], None]] = None
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
        
        print(f"[LLM] 发送流式请求: {len(lc_messages)} 条消息")
        print("[LLM] 流式输出:")
        print("-" * 40)
        
        for chunk in llm.stream(lc_messages):
            if chunk.content:
                print(chunk.content, end="", flush=True)
                if stream_callback:
                    stream_callback(chunk.content)
                yield chunk.content
        
        print()
        print("-" * 40)
    
    def chat_with_history(
        self,
        user_message: str,
        history: List[Dict[str, str]],
        system_prompt: Optional[str] = None
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
        return self.chat(messages, system_prompt)
    
    def structured_output(
        self,
        messages: List[Dict[str, str]],
        schema: Any,
        system_prompt: Optional[str] = None
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
        
        print(f"[LLM] 结构化输出请求: {len(lc_messages)} 条消息")
        
        response = structured_llm.invoke(lc_messages)
        
        print(f"[LLM] 结构化输出完成")
        
        return response


def get_llm_service(settings_service=None) -> LLMService:
    """获取 LLM 服务单例"""
    return LLMService(settings_service)
