from typing import TypedDict, List, Any, Literal


class CompactionState(TypedDict):
    """Compaction 子图状态"""
    messages: List[Any]
    max_messages: int
    compressed: bool
    summary: str


class ToolExecutionState(TypedDict):
    """工具执行子图状态"""
    tool_name: str
    tool_args: dict
    workspace_id: str
    permission: str
    result: str
    error: str
    doom_loop_detected: bool
    previous_calls: List[dict]
    task_description: str
    previous_results: List[str]
    agent_type: str
