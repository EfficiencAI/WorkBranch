from typing import TypedDict, List, Optional, Literal, Callable
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
    task_description: Optional[str]
    previous_results: List[str]


FILE_TOOLS = {"read_file", "write_file", "delete_file", "list_dir", "create_dir"}

THINK_SYSTEM_PROMPT = """你是一个专业的软件工程师助手。当前正在执行一个任务计划中的某个步骤。

你会收到：
1. 当前任务描述
2. 之前任务的执行结果（如果有）

请针对当前任务进行思考：
1. 分析任务目标
2. 结合之前的执行结果（如果有）
3. 给出你的思考过程和结论

请简洁清晰地回答，不要过于冗长。"""


def check_permission(state: ToolExecutionState, workspace_service=None) -> dict:
    """权限检查"""
    print("\n" + "-"*40)
    print("[ToolExec] 权限检查...")
    
    tool_name = state["tool_name"]
    workspace_id = state["workspace_id"]
    tool_args = state["tool_args"]
    
    print(f"[ToolExec] 工具: {tool_name}")
    print(f"[ToolExec] 工作区: {workspace_id}")

    if tool_name in FILE_TOOLS and workspace_service:
        path_key = "path" if "path" in tool_args else "file_path"
        target_path = tool_args.get(path_key) or tool_args.get("directory")
        
        if target_path:
            allowed, resolved_or_error = workspace_service.resolve_path(workspace_id, target_path)
            if not allowed:
                print(f"[ToolExec] 路径验证失败: {resolved_or_error}")
                return {"permission": "deny", "error": resolved_or_error}
            print(f"[ToolExec] 路径验证通过: {resolved_or_error}")
    
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
    error = state.get("error", "Permission denied")
    return {"error": error, "result": None}


def execute_tool(state: ToolExecutionState, workspace_service=None, llm_service=None, token_callback: Optional[Callable[[str], None]] = None) -> dict:
    """执行工具"""
    print("[ToolExec] 执行工具...")
    
    tool_name = state["tool_name"]
    tool_args = state["tool_args"].copy()
    workspace_id = state["workspace_id"]
    task_description = state.get("task_description", "")
    previous_results = state.get("previous_results", [])
    
    print(f"[ToolExec] 工具: {tool_name}")
    print(f"[ToolExec] 参数: {tool_args}")
    print(f"[ToolExec] 任务描述: {task_description}")
    print(f"[ToolExec] 之前结果数量: {len(previous_results)}")

    if tool_name in FILE_TOOLS and workspace_service:
        path_key = "path" if "path" in tool_args else "file_path"
        target_path = tool_args.get(path_key) or tool_args.get("directory")
        
        if target_path:
            allowed, resolved_path = workspace_service.resolve_path(workspace_id, target_path)
            if allowed:
                if "path" in tool_args:
                    tool_args["path"] = resolved_path
                elif "file_path" in tool_args:
                    tool_args["file_path"] = resolved_path
                elif "directory" in tool_args:
                    tool_args["directory"] = resolved_path
                print(f"[ToolExec] 路径已解析: {resolved_path}")
    
    if tool_name == "thinking":
        if llm_service:
            print("[ToolExec] 调用 LLM 进行思考...")
            try:
                context_parts = [f"当前任务: {task_description}"]
                
                if previous_results:
                    context_parts.append("\n--- 之前任务的执行结果 ---")
                    for i, prev_result in enumerate(previous_results, 1):
                        truncated = prev_result[:500] + "..." if len(prev_result) > 500 else prev_result
                        context_parts.append(f"任务{i}结果:\n{truncated}")
                    context_parts.append("---\n")
                
                context_parts.append("请思考并执行当前任务。")
                prompt = "\n".join(context_parts)
                messages = [{"role": "user", "content": prompt}]
                
                result = ""
                for chunk in llm_service.chat_stream(messages, THINK_SYSTEM_PROMPT, token_callback):
                    result += chunk
                
                print(f"[ToolExec] 思考完成")
                return {"result": result, "error": None}
            except Exception as e:
                print(f"[ToolExec] LLM 调用失败: {e}")
                return {"result": f"思考失败: {e}", "error": str(e)}
        else:
            result = f"思考任务: {task_description} (LLM 服务未配置)"
            print(f"[ToolExec] 结果: {result}")
            return {"result": result, "error": None}
    
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


def create_tool_execution_subgraph(workspace_service=None, llm_service=None, token_callback: Optional[Callable[[str], None]] = None):
    """创建工具执行子图"""
    graph = StateGraph(ToolExecutionState)
    
    def check_permission_node(state: ToolExecutionState) -> dict:
        return check_permission(state, workspace_service)
    
    def execute_tool_node(state: ToolExecutionState) -> dict:
        return execute_tool(state, workspace_service, llm_service, token_callback)
    
    graph.add_node("check_permission", check_permission_node)
    graph.add_node("ask_user", ask_user)
    graph.add_node("deny", deny_execution)
    graph.add_node("execute", execute_tool_node)
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
    previous_calls: List[ToolCall] = None,
    workspace_service=None,
    llm_service=None,
    token_callback: Optional[Callable[[str], None]] = None,
    task_description: str = "",
    previous_results: List[str] = None
) -> dict:
    """
    运行工具执行子图
    
    Args:
        tool_name: 工具名称
        tool_args: 工具参数
        workspace_id: 工作区ID
        previous_calls: 之前的工具调用记录
        workspace_service: 工作区服务实例
        llm_service: LLM 服务实例
        token_callback: 流式输出回调
        task_description: 任务描述（用于思考工具）
        previous_results: 之前任务的执行结果（短期记忆）
        
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
        "task_description": task_description,
        "previous_results": previous_results or [],
    }
    
    graph = create_tool_execution_subgraph(workspace_service, llm_service, token_callback)
    result = graph.invoke(initial_state)
    
    print("="*60)
    print("[Subgraph] 工具执行子图完成")
    print("="*60)
    
    return result
