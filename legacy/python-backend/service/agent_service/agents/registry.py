from typing import Dict, Optional, Any
from .definitions import AgentDefinition, BUILTIN_AGENTS


class AgentRegistry:
    """Agent 注册表"""
    
    def __init__(self):
        self._agents: Dict[str, AgentDefinition] = {}
        self._register_builtin_agents()
    
    def _register_builtin_agents(self):
        """注册内置 Agent"""
        for agent_type, agent_def in BUILTIN_AGENTS.items():
            self.register(agent_def)
    
    def register(self, agent_def: AgentDefinition) -> None:
        """注册 Agent"""
        self._agents[agent_def.agent_type] = agent_def
    
    def get(self, agent_type: str) -> Optional[AgentDefinition]:
        """获取 Agent 定义"""
        return self._agents.get(agent_type)
    
    def get_all(self) -> Dict[str, AgentDefinition]:
        """获取所有 Agent"""
        return self._agents.copy()
    
    def get_agent_info(self, agent_type: str) -> Dict[str, Any]:
        """获取 Agent 信息"""
        agent = self.get(agent_type)
        if not agent:
            return {}
        
        return {
            "agent_type": agent.agent_type,
            "description": agent.description,
            "when_to_use": agent.when_to_use,
            "capabilities": [cap.value for cap in agent.capabilities],
            "allowed_tools": agent.allowed_tools,
            "disallowed_tools": agent.disallowed_tools,
            "model": agent.model
        }
