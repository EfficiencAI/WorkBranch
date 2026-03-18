from typing import TypedDict, List, Any, Optional
from enum import Enum


class AgentType(str, Enum):
    """Agent 类型枚举"""
    PLAN_AGENT = "plan_agent"
    BUILD_AGENT = "build_agent"
    REVIEW_AGENT = "review_agent"
    EXPLORE_AGENT = "explore_agent"
    ADMIN_AGENT = "admin_agent"


class Task(TypedDict):
    """单个任务定义"""
    id: int
    description: str
    tool: Optional[str]
    args: Optional[dict]


class ToolCall(TypedDict):
    """工具调用记录"""
    tool: str
    args: dict
    result: Optional[str]


class AgentState(TypedDict):
    """Agent 状态定义"""
    messages: List[Any]
    workspace_id: str
    plan: List[Task]
    current_step: int
    results: List[Any]
    plan_failed: bool
    explore_result: Optional[dict]
    tool_history: List[ToolCall]
    replan_count: int
    agent_type: Optional[str]
