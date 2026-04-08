from typing import List, Optional, Callable, Dict, Any
from dataclasses import dataclass, field
from enum import Enum


class AgentCapability(str, Enum):
    """Agent 能力标识"""
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    EXPLORE = "explore"
    PLAN = "plan"
    REVIEW = "review"


@dataclass
class AgentDefinition:
    """Agent 定义 - 参考 Claude Code 架构"""
    agent_type: str
    description: str
    when_to_use: str
    capabilities: List[AgentCapability] = field(default_factory=list)
    allowed_tools: List[str] = field(default_factory=lambda: ["*"])
    disallowed_tools: List[str] = field(default_factory=list)
    model: str = "inherit"  # inherit, gpt-4, gpt-3.5-turbo
    system_prompt_generator: Optional[Callable[[], str]] = None
    permission_mode: Optional[str] = None
    omit_claude_md: bool = False
    background: bool = False


BUILTIN_AGENTS: Dict[str, AgentDefinition] = {
    "general-purpose": AgentDefinition(
        agent_type="general-purpose",
        description="通用 Agent，可执行任何任务",
        when_to_use="复杂任务、多步骤操作、需要读写文件的任务",
        capabilities=[
            AgentCapability.READ,
            AgentCapability.WRITE,
            AgentCapability.EXECUTE,
        ],
        allowed_tools=["*"],
        model="inherit",
    ),
    
    "explore": AgentDefinition(
        agent_type="explore",
        description="代码探索 Agent，只读模式",
        when_to_use="快速搜索代码、查找文件、理解项目结构",
        capabilities=[AgentCapability.READ, AgentCapability.EXPLORE],
        allowed_tools=["read_file", "list_dir", "explore_code", "explore_internet"],
        disallowed_tools=["write_file", "delete_file", "create_dir"],
        model="gpt-3.5-turbo",
    ),
    
    "plan": AgentDefinition(
        agent_type="plan",
        description="规划 Agent，用于设计实现方案",
        when_to_use="需要设计实现策略、架构决策、复杂任务分解",
        capabilities=[AgentCapability.READ, AgentCapability.PLAN],
        allowed_tools=["read_file", "list_dir", "explore_code", "thinking"],
        disallowed_tools=["write_file", "delete_file"],
        model="inherit",
    ),
    
    "review": AgentDefinition(
        agent_type="review",
        description="代码审查 Agent",
        when_to_use="代码审查、问题检测、优化建议",
        capabilities=[AgentCapability.READ, AgentCapability.REVIEW],
        allowed_tools=["read_file", "list_dir", "explore_code"],
        disallowed_tools=["write_file", "delete_file"],
        model="inherit",
    ),
}