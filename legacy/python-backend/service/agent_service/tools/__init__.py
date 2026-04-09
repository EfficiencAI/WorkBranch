from .registry import ToolRegistry, ToolDefinition, ALL_TOOLS, FILE_TOOLS, EXPLORE_TOOLS, SUBAGENT_TOOLS
from .plan_tools import register_plan_tools, PLAN_TOOLS
from .agent_tools import register_agent_tools, AGENT_TOOLS
from .executors import ToolExecutor

__all__ = [
    "ToolRegistry",
    "ToolDefinition",
    "ToolExecutor",
    "ALL_TOOLS",
    "FILE_TOOLS",
    "EXPLORE_TOOLS",
    "SUBAGENT_TOOLS",
    "PLAN_TOOLS",
    "AGENT_TOOLS",
    "register_plan_tools",
    "register_agent_tools",
]

# 注册所有工具
def register_all_tools():
    """注册所有工具"""
    register_plan_tools()
    register_agent_tools()

