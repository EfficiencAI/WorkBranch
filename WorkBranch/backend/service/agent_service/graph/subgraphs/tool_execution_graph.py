from typing import TypedDict, List, Optional, Literal, Callable
from langgraph.graph import StateGraph, END
import os
import shutil

from ...state import ToolExecutionState, ToolCall


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
    
    if tool_name == "read_file":
        return _execute_read_file(tool_args)
    
    if tool_name == "write_file":
        return _execute_write_file(tool_args)
    
    if tool_name == "delete_file":
        return _execute_delete_file(tool_args)
    
    if tool_name == "list_dir":
        return _execute_list_dir(tool_args)
    
    if tool_name == "create_dir":
        return _execute_create_dir(tool_args)
    
    result = f"工具 {tool_name} 执行成功"
    print(f"[ToolExec] 结果: {result}")
    
    return {"result": result, "error": None}


def _execute_read_file(tool_args: dict) -> dict:
    """执行 read_file 工具"""
    file_path = tool_args.get("file_path") or tool_args.get("path")
    if not file_path:
        return {"result": None, "error": "缺少 file_path 参数"}
    
    encoding = tool_args.get("encoding", "utf-8")
    start_line = tool_args.get("start_line", 1)
    end_line = tool_args.get("end_line")
    
    print(f"[ToolExec] read_file: {file_path}")
    
    try:
        if not os.path.exists(file_path):
            return {"result": None, "error": f"文件不存在: {file_path}"}
        
        if not os.path.isfile(file_path):
            return {"result": None, "error": f"路径不是文件: {file_path}"}
        
        with open(file_path, "r", encoding=encoding) as f:
            lines = f.readlines()
        
        total_lines = len(lines)
        start_idx = max(0, start_line - 1)
        end_idx = end_line if end_line else total_lines
        
        selected_lines = lines[start_idx:end_idx]
        
        result_lines = []
        for i, line in enumerate(selected_lines, start=start_idx + 1):
            result_lines.append(f"{i:6d}\t{line.rstrip()}")
        
        content = "\n".join(result_lines)
        if end_line is None or end_line >= total_lines:
            summary = f"文件共 {total_lines} 行，已读取全部内容"
        else:
            summary = f"文件共 {total_lines} 行，已读取第 {start_line}-{end_line} 行"
        
        print(f"[ToolExec] read_file 成功: {summary}")
        return {"result": f"{summary}\n\n{content}", "error": None}
    
    except UnicodeDecodeError:
        return {"result": None, "error": f"文件编码错误，无法用 {encoding} 解码"}
    except Exception as e:
        print(f"[ToolExec] read_file 失败: {e}")
        return {"result": None, "error": f"读取文件失败: {str(e)}"}


def _execute_write_file(tool_args: dict) -> dict:
    """执行 write_file 工具"""
    file_path = tool_args.get("file_path") or tool_args.get("path")
    if not file_path:
        return {"result": None, "error": "缺少 file_path 参数"}
    
    content = tool_args.get("content")
    if content is None:
        return {"result": None, "error": "缺少 content 参数"}
    
    mode = tool_args.get("mode", "write")
    encoding = tool_args.get("encoding", "utf-8")
    
    print(f"[ToolExec] write_file: {file_path}, mode: {mode}")
    
    try:
        dir_path = os.path.dirname(file_path)
        if dir_path and not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
        
        write_mode = "a" if mode == "append" else "w"
        with open(file_path, write_mode, encoding=encoding) as f:
            f.write(content)
        
        action = "追加" if mode == "append" else "写入"
        print(f"[ToolExec] write_file 成功: {action} {len(content)} 字符")
        return {"result": f"文件{action}成功: {file_path}", "error": None}
    
    except Exception as e:
        print(f"[ToolExec] write_file 失败: {e}")
        return {"result": None, "error": f"写入文件失败: {str(e)}"}


def _execute_delete_file(tool_args: dict) -> dict:
    """执行 delete_file 工具"""
    file_path = tool_args.get("file_path") or tool_args.get("path")
    if not file_path:
        return {"result": None, "error": "缺少 file_path 参数"}
    
    print(f"[ToolExec] delete_file: {file_path}")
    
    try:
        if not os.path.exists(file_path):
            return {"result": None, "error": f"路径不存在: {file_path}"}
        
        if os.path.isfile(file_path):
            os.remove(file_path)
            print(f"[ToolExec] delete_file 成功: 已删除文件")
            return {"result": f"文件已删除: {file_path}", "error": None}
        elif os.path.isdir(file_path):
            shutil.rmtree(file_path)
            print(f"[ToolExec] delete_file 成功: 已删除目录及其内容")
            return {"result": f"目录已删除: {file_path}", "error": None}
        else:
            return {"result": None, "error": f"未知文件类型: {file_path}"}
    
    except Exception as e:
        print(f"[ToolExec] delete_file 失败: {e}")
        return {"result": None, "error": f"删除失败: {str(e)}"}


def _execute_list_dir(tool_args: dict) -> dict:
    """执行 list_dir 工具"""
    dir_path = tool_args.get("directory") or tool_args.get("path") or tool_args.get("dir_path")
    if not dir_path:
        return {"result": None, "error": "缺少 directory 参数"}
    
    recursive = tool_args.get("recursive", False)
    show_hidden = tool_args.get("show_hidden", False)
    
    print(f"[ToolExec] list_dir: {dir_path}, recursive: {recursive}")
    
    try:
        if not os.path.exists(dir_path):
            return {"result": None, "error": f"目录不存在: {dir_path}"}
        
        if not os.path.isdir(dir_path):
            return {"result": None, "error": f"路径不是目录: {dir_path}"}
        
        result_lines = []
        file_count = 0
        dir_count = 0
        
        if recursive:
            for root, dirs, files in os.walk(dir_path):
                if not show_hidden:
                    dirs[:] = [d for d in dirs if not d.startswith(".")]
                    files = [f for f in files if not f.startswith(".")]
                
                rel_root = os.path.relpath(root, dir_path)
                if rel_root == ".":
                    rel_root = ""
                
                for d in sorted(dirs):
                    dir_count += 1
                    prefix = f"{rel_root}/" if rel_root else ""
                    result_lines.append(f"📁 {prefix}{d}/")
                
                for f in sorted(files):
                    file_count += 1
                    prefix = f"{rel_root}/" if rel_root else ""
                    result_lines.append(f"📄 {prefix}{f}")
        else:
            entries = os.listdir(dir_path)
            if not show_hidden:
                entries = [e for e in entries if not e.startswith(".")]
            
            for entry in sorted(entries):
                full_path = os.path.join(dir_path, entry)
                if os.path.isdir(full_path):
                    dir_count += 1
                    result_lines.append(f"📁 {entry}/")
                else:
                    file_count += 1
                    result_lines.append(f"📄 {entry}")
        
        summary = f"目录: {dir_path}\n共 {dir_count} 个目录, {file_count} 个文件"
        content = "\n".join(result_lines) if result_lines else "(空目录)"
        
        print(f"[ToolExec] list_dir 成功: {dir_count} 目录, {file_count} 文件")
        return {"result": f"{summary}\n\n{content}", "error": None}
    
    except Exception as e:
        print(f"[ToolExec] list_dir 失败: {e}")
        return {"result": None, "error": f"列出目录失败: {str(e)}"}


def _execute_create_dir(tool_args: dict) -> dict:
    """执行 create_dir 工具"""
    dir_path = tool_args.get("directory") or tool_args.get("path") or tool_args.get("dir_path")
    if not dir_path:
        return {"result": None, "error": "缺少 directory 参数"}
    
    print(f"[ToolExec] create_dir: {dir_path}")
    
    try:
        if os.path.exists(dir_path):
            if os.path.isdir(dir_path):
                return {"result": f"目录已存在: {dir_path}", "error": None}
            else:
                return {"result": None, "error": f"路径已存在但不是目录: {dir_path}"}
        
        os.makedirs(dir_path, exist_ok=True)
        print(f"[ToolExec] create_dir 成功")
        return {"result": f"目录已创建: {dir_path}", "error": None}
    
    except Exception as e:
        print(f"[ToolExec] create_dir 失败: {e}")
        return {"result": None, "error": f"创建目录失败: {str(e)}"}


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
