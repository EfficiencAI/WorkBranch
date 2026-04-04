from typing import Literal, List, Callable, Optional
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field
import json
import re

from ...state import AgentState, Task, IntentAnalysis
from .tool_execution_graph import generate_tool_prompt
from service.session_service.canonical import ContentBlockType


class TaskItem(BaseModel):
    """单个任务"""
    id: int = Field(description="任务ID，从1开始")
    description: str = Field(description="任务描述")
    tool: Optional[str] = Field(default=None, description="要使用的工具名称，如 thinking, read_file, write_file 等")
    args: Optional[dict] = Field(default=None, description="工具参数")


class TaskPlan(BaseModel):
    """LLM 输出的任务计划"""
    tasks: List[TaskItem] = Field(description="任务列表")


INTENT_ANALYSIS_PROMPT = """你是一个专业的需求分析专家。请分析用户的输入，识别其真实意图和需求。

## 意图类型说明
- develop: 开发新功能、编写代码、创建文件
- explore: 探索代码库、查找文件、理解项目结构
- review: 代码审查、检查问题、优化建议
- question: 问答、咨询、解释说明
- debug: 调试问题、修复错误、排查故障
- refactor: 重构代码、优化结构、改进设计
- other: 其他类型

## 输出格式要求
请严格按照以下 JSON 格式输出：

```json
{
  "intent_type": "意图类型",
  "summary": "需求摘要（一句话描述核心需求）",
  "key_points": ["关键点1", "关键点2"],
  "suggested_tools": ["建议使用的工具1", "建议使用的工具2"],
  "complexity": "simple/medium/complex",
  "confidence": 0.95
}
```

## 分析要点
1. 准确识别用户的主要意图
2. 提取核心需求点
3. 判断任务复杂度
4. 给出置信度（0-1之间）
5. 只输出 JSON，不要有其他文字"""


PLAN_SYSTEM_PROMPT_BASE = """你是一个专业的软件工程师助手。你的任务是根据用户需求生成一个清晰的执行计划。

{tool_prompt}

## 输出格式要求
你必须严格按照以下 JSON 格式输出，不要有任何其他文字：

```json
{{
  "tasks": [
    {{
      "id": 1,
      "description": "任务描述",
      "tool": "工具名称或null",
      "args": {{"参数名": "参数值"}}或null
    }}
  ]
}}
```

## 注意事项
1. 每个任务必须包含 id, description, tool, args 四个字段
2. tool 如果不需要使用工具，设为 null
3. args 如果没有参数，设为 null
4. 只输出 JSON，不要有任何解释或额外文字"""


def get_plan_system_prompt(agent_type: str = "build_agent", settings_service=None) -> str:
    """
    获取包含工具列表的系统 prompt
    
    Args:
        agent_type: Agent 类型
        settings_service: 设置服务实例
        
    Returns:
        完整的系统 prompt
    """
    tool_prompt = generate_tool_prompt(agent_type, settings_service)
    return PLAN_SYSTEM_PROMPT_BASE.format(tool_prompt=tool_prompt)


def parse_intent_from_text(text: str) -> IntentAnalysis:
    """从 LLM 响应中解析意图分析结果"""
    text = text.strip()
    
    json_match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
    if json_match:
        json_str = json_match.group(1)
    else:
        json_match2 = re.search(r'\{[\s\S]*"intent_type"[\s\S]*\}', text)
        if json_match2:
            json_str = json_match2.group(0)
        else:
            json_str = text
    
    try:
        data = json.loads(json_str)
        return {
            "intent_type": data.get("intent_type", "other"),
            "summary": data.get("summary", ""),
            "key_points": data.get("key_points", []),
            "suggested_tools": data.get("suggested_tools", []),
            "complexity": data.get("complexity", "medium"),
            "confidence": float(data.get("confidence", 0.5))
        }
    except (json.JSONDecodeError, ValueError) as e:
        print(f"[Plan] 意图解析失败: {e}")
        return {
            "intent_type": "other",
            "summary": text[:100] if text else "",
            "key_points": [],
            "suggested_tools": [],
            "complexity": "medium",
            "confidence": 0.3
        }


def _log(send_message, content: str):
    print(content)
    if send_message:
        send_message(content + "\n", ContentBlockType.TEXT, {})


def phase1_understand(state: AgentState, llm_service=None, token_callback: Optional[Callable[[str], None]] = None, message_context: dict = None) -> dict:
    """Phase 1: 理解需求 - 调用 LLM 分析用户意图"""
    send_message = message_context.get("send_message") if message_context else None
    
    _log(send_message, "\n" + "="*60)
    _log(send_message, "[Plan] Phase 1/5: 理解需求")
    _log(send_message, "="*60)
    
    user_message = state["messages"][-1] if state["messages"] else ""
    _log(send_message, f"[Plan] 用户消息: {user_message}")
    
    if llm_service is None:
        _log(send_message, "[Plan] LLM 服务未配置，使用默认意图分析")
        intent_analysis: IntentAnalysis = {
            "intent_type": "other",
            "summary": user_message[:50] if user_message else "",
            "key_points": [user_message] if user_message else [],
            "suggested_tools": [],
            "complexity": "medium",
            "confidence": 0.5
        }
    else:
        try:
            _log(send_message, "[Plan] 调用 LLM 分析用户意图...")
            
            prompt = f"请分析以下用户输入的意图：\n\n{user_message}"
            messages = [{"role": "user", "content": prompt}]
            
            def intent_token_callback(token: str):
                if token_callback:
                    token_callback(token)
            
            full_response = ""
            for chunk in llm_service.chat_stream(messages, INTENT_ANALYSIS_PROMPT, intent_token_callback):
                full_response += chunk
            
            intent_analysis = parse_intent_from_text(full_response)
            
            _log(send_message, f"[Plan] 意图分析完成:")
            _log(send_message, f"  - 意图类型: {intent_analysis['intent_type']}")
            _log(send_message, f"  - 需求摘要: {intent_analysis['summary']}")
            _log(send_message, f"  - 关键点: {intent_analysis['key_points']}")
            _log(send_message, f"  - 建议工具: {intent_analysis['suggested_tools']}")
            _log(send_message, f"  - 复杂度: {intent_analysis['complexity']}")
            _log(send_message, f"  - 置信度: {intent_analysis['confidence']}")
            
        except Exception as e:
            _log(send_message, f"[Plan] 意图分析失败: {e}")
            intent_analysis = {
                "intent_type": "other",
                "summary": user_message[:50] if user_message else "",
                "key_points": [user_message] if user_message else [],
                "suggested_tools": [],
                "complexity": "medium",
                "confidence": 0.3
            }
    
    _log(send_message, "[Plan] 需求分析完成，进入下一阶段")
    return {"intent_analysis": intent_analysis}


def phase2_design(state: AgentState, llm_service=None, token_callback: Optional[Callable[[str], None]] = None, settings_service=None, message_context: dict = None) -> dict:
    """Phase 2: 生成计划"""
    send_message = message_context.get("send_message") if message_context else None
    
    _log(send_message, "\n" + "="*60)
    _log(send_message, "[Plan] Phase 2/5: 生成计划")
    _log(send_message, "="*60)
    
    user_message = state["messages"][-1] if state["messages"] else ""
    agent_type = state.get("agent_type", "build_agent")
    intent_analysis = state.get("intent_analysis")
    
    _log(send_message, f"[Plan] 基于需求设计任务计划...")
    _log(send_message, f"[Plan] Agent 类型: {agent_type}")
    
    if intent_analysis:
        _log(send_message, f"[Plan] 使用意图分析结果:")
        _log(send_message, f"  - 意图类型: {intent_analysis.get('intent_type')}")
        _log(send_message, f"  - 需求摘要: {intent_analysis.get('summary')}")
        _log(send_message, f"  - 建议工具: {intent_analysis.get('suggested_tools')}")
    
    if llm_service is None:
        _log(send_message, "[Plan] LLM 服务未配置，使用默认计划")
        plan = [
            {"id": 1, "description": f"分析需求: {user_message[:30]}...", "tool": None, "args": None},
            {"id": 2, "description": "设计实现方案", "tool": None, "args": None},
            {"id": 3, "description": "执行实现", "tool": None, "args": None},
            {"id": 4, "description": "验证结果", "tool": None, "args": None},
        ]
    else:
        try:
            _log(send_message, "[Plan] 调用 LLM 生成计划...")
            _log(send_message, "[Plan] LLM 思考中:")
            
            system_prompt = get_plan_system_prompt(agent_type, settings_service)
            
            intent_context = ""
            if intent_analysis:
                intent_context = f"""
## 意图分析结果
- 意图类型: {intent_analysis.get('intent_type', 'unknown')}
- 需求摘要: {intent_analysis.get('summary', '')}
- 关键点: {', '.join(intent_analysis.get('key_points', []))}
- 建议工具: {', '.join(intent_analysis.get('suggested_tools', []))}
- 复杂度: {intent_analysis.get('complexity', 'medium')}
"""
            
            prompt = f"""请根据以下用户需求生成执行计划：

用户需求: {user_message}
{intent_context}
请生成一个包含 2-5 个任务的执行计划，严格按照 JSON 格式输出。"""
            
            messages = [{"role": "user", "content": prompt}]
            
            def plan_token_callback(token: str):
                if token_callback:
                    token_callback(token)
            
            full_response = ""
            for chunk in llm_service.chat_stream(messages, system_prompt, plan_token_callback):
                full_response += chunk
            
            plan = parse_plan_from_text(full_response, send_message)
            
            for i, task in enumerate(plan):
                task["id"] = i + 1
            
            _log(send_message, f"\n[Plan] LLM 生成了 {len(plan)} 个任务")
            
        except Exception as e:
            _log(send_message, f"[Plan] LLM 调用失败: {e}")
            _log(send_message, "[Plan] 使用默认计划")
            plan = [
                {"id": 1, "description": f"分析需求: {user_message[:30]}...", "tool": None, "args": None},
                {"id": 2, "description": "设计实现方案", "tool": None, "args": None},
                {"id": 3, "description": "执行实现", "tool": None, "args": None},
                {"id": 4, "description": "验证结果", "tool": None, "args": None},
            ]
    
    _log(send_message, f"[Plan] 生成 {len(plan)} 个任务:")
    for task in plan:
        tool_info = f" [工具: {task.get('tool')}]" if task.get('tool') else ""
        _log(send_message, f"  - Task {task['id']}: {task['description']}{tool_info}")
    
    return {"plan": plan}


def parse_plan_from_text(text: str, send_message=None) -> List[dict]:
    """从文本解析计划 - 支持 JSON 格式"""
    text = text.strip()
    _log(send_message, f"[Plan] 原始响应文本:\n{text[:500]}...")
    
    json_match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
    if json_match:
        json_str = json_match.group(1)
        _log(send_message, f"[Plan] 从代码块提取 JSON")
    else:
        json_str = text
    
    json_match2 = re.search(r'\{[\s\S]*"tasks"[\s\S]*\}', text)
    if json_match2 and not json_match:
        json_str = json_match2.group(0)
        _log(send_message, f"[Plan] 从文本提取 JSON 对象")
    
    try:
        data = json.loads(json_str)
        if isinstance(data, dict) and "tasks" in data:
            tasks = []
            for task_data in data["tasks"]:
                if isinstance(task_data, dict):
                    task = {
                        "id": task_data.get("id", len(tasks) + 1),
                        "description": task_data.get("description", ""),
                        "tool": task_data.get("tool"),
                        "args": task_data.get("args"),
                    }
                    if task["description"]:
                        tasks.append(task)
            
            if tasks:
                _log(send_message, f"[Plan] JSON 解析成功，找到 {len(tasks)} 个任务")
                return tasks
    except json.JSONDecodeError as e:
        _log(send_message, f"[Plan] JSON 解析失败: {e}")
    
    _log(send_message, "[Plan] JSON 解析失败，尝试逐行解析...")
    tasks = []
    lines = text.strip().split("\n")
    
    current_task = None
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        task_match = re.match(r'^Task\s*(\d+)\s*[:：]\s*(.+)$', line, re.IGNORECASE)
        if task_match:
            if current_task and current_task.get("description"):
                tasks.append(current_task)
            current_task = {
                "id": int(task_match.group(1)),
                "description": task_match.group(2).strip(),
                "tool": None,
                "args": None
            }
            continue
        
        if current_task:
            tool_match = re.match(r'^工具\s*[:：]\s*(\w+)', line)
            if tool_match:
                current_task["tool"] = tool_match.group(1)
                continue
            
            args_match = re.match(r'^参数\s*[:：]\s*(.+)$', line)
            if args_match:
                try:
                    current_task["args"] = json.loads(args_match.group(1))
                except:
                    current_task["args"] = None
                continue
    
    if current_task and current_task.get("description"):
        tasks.append(current_task)
    
    if not tasks:
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            if line[0].isdigit() or line.startswith("-") or line.startswith("*"):
                desc = line.lstrip("0123456789.-* ").strip()
                if desc and not desc.lower().startswith(("工具", "参数", "tool", "args")):
                    tasks.append({
                        "id": len(tasks) + 1,
                        "description": desc,
                        "tool": None,
                        "args": None
                    })
    
    if not tasks:
        tasks = [
            {"id": 1, "description": "分析需求", "tool": None, "args": None},
            {"id": 2, "description": "执行实现", "tool": None, "args": None},
        ]
    
    _log(send_message, f"[Plan] 逐行解析完成，找到 {len(tasks)} 个任务")
    return tasks


def phase3_review(state: AgentState, llm_service=None, message_context: dict = None) -> dict:
    """Phase 3: 审查计划"""
    send_message = message_context.get("send_message") if message_context else None
    
    _log(send_message, "\n" + "="*60)
    _log(send_message, "[Plan] Phase 3/5: 审查计划")
    _log(send_message, "="*60)
    
    plan = state.get("plan", [])
    _log(send_message, f"[Plan] 审查 {len(plan)} 个任务...")
    
    for task in plan:
        _log(send_message, f"  ✓ Task {task['id']}: {task['description']}")
    
    _log(send_message, "[Plan] 审查通过")
    return {}


def phase4_finalize(state: AgentState, llm_service=None, message_context: dict = None) -> dict:
    """Phase 4: 最终计划"""
    send_message = message_context.get("send_message") if message_context else None
    
    _log(send_message, "\n" + "="*60)
    _log(send_message, "[Plan] Phase 4/5: 最终计划")
    _log(send_message, "="*60)
    
    plan = state.get("plan", [])
    _log(send_message, f"[Plan] 确认最终计划，共 {len(plan)} 个任务")
    
    return {"current_step": 0, "plan_failed": False}


def phase5_exit(state: AgentState, llm_service=None, message_context: dict = None) -> dict:
    """Phase 5: 计划退出"""
    send_message = message_context.get("send_message") if message_context else None
    
    _log(send_message, "\n" + "="*60)
    _log(send_message, "[Plan] Phase 5/5: 计划完成")
    _log(send_message, "="*60)
    
    _log(send_message, "[Plan] Plan 流程结束，准备进入 Build 流程")
    return {}


def create_plan_subgraph(llm_service=None, token_callback: Optional[Callable[[str], None]] = None, settings_service=None, message_context: dict = None):
    """创建 Plan 子图"""
    
    def _phase1(state):
        return phase1_understand(state, llm_service, token_callback, message_context)
    
    def _phase2(state):
        return phase2_design(state, llm_service, token_callback, settings_service, message_context)
    
    def _phase3(state):
        return phase3_review(state, llm_service, message_context)
    
    def _phase4(state):
        return phase4_finalize(state, llm_service, message_context)
    
    def _phase5(state):
        return phase5_exit(state, llm_service, message_context)
    
    graph = StateGraph(AgentState)
    
    graph.add_node("phase1", _phase1)
    graph.add_node("phase2", _phase2)
    graph.add_node("phase3", _phase3)
    graph.add_node("phase4", _phase4)
    graph.add_node("phase5", _phase5)
    
    graph.set_entry_point("phase1")
    graph.add_edge("phase1", "phase2")
    graph.add_edge("phase2", "phase3")
    graph.add_edge("phase3", "phase4")
    graph.add_edge("phase4", "phase5")
    graph.add_edge("phase5", END)
    
    return graph.compile()


def run_plan_flow(state: AgentState, llm_service=None, token_callback: Optional[Callable[[str], None]] = None, settings_service=None, message_context: dict = None) -> dict:
    """运行 Plan 流程"""
    send_message = message_context.get("send_message") if message_context else None
    
    _log(send_message, "\n" + "="*60)
    _log(send_message, "[Flow] Plan 流程启动")
    _log(send_message, "="*60)
    
    graph = create_plan_subgraph(llm_service, token_callback, settings_service, message_context)
    result = graph.invoke(state)
    
    _log(send_message, "="*60)
    _log(send_message, "[Flow] Plan 流程完成")
    _log(send_message, "="*60)
    
    return result
