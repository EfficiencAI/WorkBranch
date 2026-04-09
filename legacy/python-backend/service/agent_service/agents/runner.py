import uuid
from typing import Dict, Any, Optional
from .definitions import AgentDefinition


class AgentRunner:
    """Agent 运行器 - 参考 Claude Code 的 runAgent 函数"""
    
    def __init__(self, definition: AgentDefinition, llm_service=None):
        self.definition = definition
        self.llm_service = llm_service
        self.agent_id = f"agent-{uuid.uuid4().hex[:8]}"
        self.status = "idle"
    
    def _resolve_tools(self) -> list:
        """解析 Agent 可用工具"""
        from ..tools.registry import ToolRegistry
        
        registry = ToolRegistry()
        all_tools = registry.get_all()
        
        # 过滤工具
        resolved_tools = []
        for tool_name, tool_def in all_tools.items():
            # 检查是否在允许列表中
            if "*" in self.definition.allowed_tools or tool_name in self.definition.allowed_tools:
                # 检查是否在禁用列表中
                if tool_name not in self.definition.disallowed_tools:
                    resolved_tools.append(tool_def)
        
        return resolved_tools
    
    def _build_system_prompt(self) -> str:
        """构建系统提示"""
        if self.definition.system_prompt_generator:
            return self.definition.system_prompt_generator()
        
        # 默认系统提示
        prompt = f"你是 {self.definition.description}。"
        prompt += f"\n\n使用场景：{self.definition.when_to_use}"
        
        if self.definition.disallowed_tools:
            prompt += f"\n\n禁止使用的工具：{', '.join(self.definition.disallowed_tools)}"
        
        return prompt
    
    async def run(self, task_description: str, context: dict = None) -> dict:
        """运行 Agent"""
        self.status = "running"
        
        try:
            # 构建系统提示
            system_prompt = self._build_system_prompt()
            
            # 构建工具列表
            tools = self._resolve_tools()
            
            # 构建消息
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": task_description}
            ]
            
            # 调用 LLM
            if not self.llm_service:
                raise ValueError("LLM 服务未配置")
            
            # 执行任务
            result = await self.llm_service.chat(
                messages,
                system_prompt=system_prompt,
                tools=tools
            )
            
            self.status = "completed"
            return {
                "agent_id": self.agent_id,
                "result": result,
                "agent_type": self.definition.agent_type,
                "status": "completed"
            }
            
        except Exception as e:
            self.status = "failed"
            return {
                "agent_id": self.agent_id,
                "error": str(e),
                "agent_type": self.definition.agent_type,
                "status": "failed"
            }
