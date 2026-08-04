from typing import Optional, Callable

from .registry import ToolDefinition, ToolRegistry


def execute_thinking(tool_args: dict, llm_service=None, token_callback: Optional[Callable[[str], None]] = None) -> dict:
    """执行 thinking 工具"""
    task_description = tool_args.get("task_description", tool_args.get("description", ""))
    
    print(f"[Tool] thinking: {task_description[:50]}...")
    
    if llm_service is None:
        result = f"思考任务: {task_description} (LLM 服务未配置)"
        print(f"[Tool] thinking 结果: {result}")
        return {"result": result, "error": None}
    
    try:
        THINKING_PROMPT = """你是一个专业的思考助手。请深入分析以下任务，给出详细的思考过程和建议。

任务描述：
{task}

请从以下角度进行分析：
1. 问题理解
2. 关键点识别
3. 可能的解决方案
4. 潜在风险
5. 建议的执行步骤"""

        prompt = THINKING_PROMPT.format(task=task_description)
        messages = [{"role": "user", "content": prompt}]
        
        result = ""
        for chunk in llm_service.chat_stream(messages, "", token_callback):
            result += chunk
        
        print(f"[Tool] thinking 成功: {len(result)} 字符")
        return {"result": result, "error": None}
    
    except Exception as e:
        print(f"[Tool] thinking 失败: {e}")
        return {"result": None, "error": str(e)}


def register_thinking_tool():
    """注册思考工具"""
    tool = ToolDefinition(
        name="thinking",
        description="思考工具（用于分析、设计等需要思考的任务）",
        params="",
        category="reasoning",
        executor=execute_thinking
    )
    ToolRegistry.register(tool)
