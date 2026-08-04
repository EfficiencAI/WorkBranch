from abc import ABC, abstractmethod
from typing import Optional, Callable, Dict, Any


class BaseSubAgent(ABC):
    """SubAgent 基类"""
    
    name: str = "base_agent"
    description: str = "基础子代理"
    system_prompt: str = ""
    allowed_tools: list = []
    
    def __init__(self, llm_service=None, token_callback: Optional[Callable[[str], None]] = None):
        self.llm_service = llm_service
        self.token_callback = token_callback
    
    @abstractmethod
    def execute(self, task_description: str, context: Optional[Dict[str, Any]] = None) -> dict:
        """执行任务"""
        pass
    
    def _call_llm(self, messages: list) -> str:
        """调用 LLM"""
        if self.llm_service is None:
            raise ValueError("LLM 服务未配置")
        
        result = ""
        for chunk in self.llm_service.chat_stream(messages, self.system_prompt, self.token_callback):
            result += chunk
        
        return result
    
    def get_info(self) -> dict:
        """获取代理信息"""
        return {
            "name": self.name,
            "description": self.description,
            "allowed_tools": self.allowed_tools
        }
