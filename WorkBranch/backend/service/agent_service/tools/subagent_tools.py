from typing import Optional, Callable

from .registry import ToolDefinition, ToolRegistry


def execute_call_explore_agent(tool_args: dict, llm_service=None, token_callback: Optional[Callable[[str], None]] = None) -> dict:
    """执行 call_explore_agent 工具 - 调用探索子代理"""
    task_description = tool_args.get("task_description")
    if not task_description:
        return {"result": None, "error": "缺少 task_description 参数"}
    
    print(f"[Tool] call_explore_agent: {task_description}")
    
    if llm_service is None:
        return {"result": None, "error": "LLM 服务未配置，无法执行子代理任务"}
    
    try:
        EXPLORE_AGENT_PROMPT = """你是一个专业的代码探索代理。你的任务是帮助用户探索和分析代码库或搜索互联网信息。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_internet: 搜索互联网获取信息
- thinking: 思考工具

请根据任务描述，使用合适的工具完成任务，并给出清晰的分析结果。"""

        messages = [{"role": "user", "content": task_description}]
        
        result = ""
        for chunk in llm_service.chat_stream(messages, EXPLORE_AGENT_PROMPT, token_callback):
            result += chunk
        
        print(f"[Tool] call_explore_agent 完成")
        return {"result": result, "error": None}
    
    except Exception as e:
        print(f"[Tool] call_explore_agent 失败: {e}")
        return {"result": None, "error": f"子代理执行失败: {str(e)}"}


def execute_call_review_agent(tool_args: dict, llm_service=None, token_callback: Optional[Callable[[str], None]] = None) -> dict:
    """执行 call_review_agent 工具 - 调用审查子代理"""
    task_description = tool_args.get("task_description")
    if not task_description:
        return {"result": None, "error": "缺少 task_description 参数"}
    
    print(f"[Tool] call_review_agent: {task_description}")
    
    if llm_service is None:
        return {"result": None, "error": "LLM 服务未配置，无法执行子代理任务"}
    
    try:
        REVIEW_AGENT_PROMPT = """你是一个专业的代码审查代理。你的任务是审查代码质量、发现潜在问题并提供改进建议。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_code: 探索代码库结构
- thinking: 思考工具

请根据任务描述，仔细审查代码并给出专业的审查意见。"""

        messages = [{"role": "user", "content": task_description}]
        
        result = ""
        for chunk in llm_service.chat_stream(messages, REVIEW_AGENT_PROMPT, token_callback):
            result += chunk
        
        print(f"[Tool] call_review_agent 完成")
        return {"result": result, "error": None}
    
    except Exception as e:
        print(f"[Tool] call_review_agent 失败: {e}")
        return {"result": None, "error": f"子代理执行失败: {str(e)}"}


def register_subagent_tools():
    """注册 SubAgent 工具"""
    tools = [
        ToolDefinition(
            name="call_explore_agent",
            description="调用探索子代理执行代码探索和互联网搜索任务",
            params="task_description",
            category="subagent",
            executor=execute_call_explore_agent
        ),
        ToolDefinition(
            name="call_review_agent",
            description="调用审查子代理执行代码审查任务",
            params="task_description",
            category="subagent",
            executor=execute_call_review_agent
        ),
    ]
    
    for tool in tools:
        ToolRegistry.register(tool)
