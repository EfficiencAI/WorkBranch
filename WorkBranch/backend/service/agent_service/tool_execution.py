from typing import TypedDict, List, Optional, Literal
from langgraph.graph import StateGraph, END


class ToolCall(TypedDict):
    """工具调用记录"""
    tool: str
    args: dict
    result: Optional[str]


class ToolExecutionState(TypedDict):
    """工具执行子图状态"""
    tool_name: str
    tool_args: dict
    workspace_id: str
    permission: str
    result: Optional[str]
    error: Optional[str]
    doom_loop_detected: bool
    previous_calls: List[ToolCall]


def check_permission(state: ToolExecutionState) -> dict:
    """权限检查"""
    print("\n" + "-"*40)
    print("[ToolExec] 权限检查...")
    
    tool_name = state["tool_name"]
    workspace_id = state["workspace_id"]
    
    print(f"[ToolExec] 工具: {tool_name}")
    print(f"[ToolExec] 工作区: {workspace_id}")
    
    dangerous_tools = ["delete_file", "execute_command", "modify_system"]
    
    if tool_name in dangerous_tools:
        print(f"[ToolExec] 危险工具，需要用户确认")
        return {"permission": "ask"}
    
    print(f"[ToolExec] 权限检查通过")
    return {"permission": "allow"}


def route_by_permission(state: ToolExecutionState) -> str:
    """根据权限路由"""
    return state["permission"]


def ask_user(state: ToolExecutionState) -> dict:
    """询问用户（模拟）"""
    print("[ToolExec] 询问用户确认...")
    print(f"[ToolExec] 是否允许执行 {state['tool_name']}?")
    print("[ToolExec] 模拟用户同意")
    return {"permission": "allow"}


def deny_execution(state: ToolExecutionState) -> dict:
    """拒绝执行"""
    print("[ToolExec] 执行被拒绝")
    return {"error": "Permission denied", "result": None}


def execute_tool(state: ToolExecutionState) -> dict:
    """执行工具"""
    print("[ToolExec] 执行工具...")
    
    tool_name = state["tool_name"]
    tool_args = state["tool_args"]
    
    print(f"[ToolExec] 工具: {tool_name}")
    print(f"[ToolExec] 参数: {tool_args}")
    
    result = f"工具 {tool_name} 执行成功"
    print(f"[ToolExec] 结果: {result}")
    
    return {"result": result, "error": None}


def check_doom_loop(state: ToolExecutionState) -> dict:
    """DoomLoop 检测"""
    print("[ToolExec] DoomLoop 检测...")
    
    tool_name = state["tool_name"]
    tool_args = state["tool_args"]
    previous_calls = state.get("previous_calls", [])
    
    duplicate_count = 0
    for call in previous_calls:
        if call["tool"] == tool_name and call["args"] == tool_args:
            duplicate_count += 1
    
    if duplicate_count >= 3:
        print("[ToolExec] 检测到 DoomLoop!")
        return {"doom_loop_detected": True, "error": "DoomLoop detected"}
    
    print("[ToolExec] DoomLoop 检测通过")
    return {"doom_loop_detected": False}


def create_tool_execution_subgraph():
    """创建工具执行子图"""
    graph = StateGraph(ToolExecutionState)
    
    graph.add_node("check_permission", check_permission)
    graph.add_node("ask_user", ask_user)
    graph.add_node("deny", deny_execution)
    graph.add_node("execute", execute_tool)
    graph.add_node("doom_loop_check", check_doom_loop)
    
    graph.set_entry_point("check_permission")
    
    graph.add_conditional_edges(
        "check_permission",
        route_by_permission,
        {"allow": "execute", "ask": "ask_user", "deny": "deny"}
    )
    
    graph.add_edge("ask_user", "execute")
    graph.add_edge("execute", "doom_loop_check")
    graph.add_edge("doom_loop_check", END)
    graph.add_edge("deny", END)
    
    return graph.compile()


def run_tool_execution(
    tool_name: str,
    tool_args: dict,
    workspace_id: str,
    previous_calls: List[ToolCall] = None
) -> dict:
    """
    运行工具执行子图
    
    Args:
        tool_name: 工具名称
        tool_args: 工具参数
        workspace_id: 工作区ID
        previous_calls: 之前的工具调用记录
        
    Returns:
        执行结果
    """
    print("\n" + "="*60)
    print("[Subgraph] 工具执行子图启动")
    print("="*60)
    
    initial_state: ToolExecutionState = {
        "tool_name": tool_name,
        "tool_args": tool_args,
        "workspace_id": workspace_id,
        "permission": "pending",
        "result": None,
        "error": None,
        "doom_loop_detected": False,
        "previous_calls": previous_calls or [],
    }
    
    graph = create_tool_execution_subgraph()
    result = graph.invoke(initial_state)
    
    print("="*60)
    print("[Subgraph] 工具执行子图完成")
    print("="*60)
    
    return result
