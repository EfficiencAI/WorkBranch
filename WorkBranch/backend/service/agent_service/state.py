from typing import TypedDict, List, Any, Optional


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
