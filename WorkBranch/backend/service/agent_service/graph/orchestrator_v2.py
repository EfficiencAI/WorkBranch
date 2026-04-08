from typing import Literal, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
from .decision.complexity_analyzer import ExecutionMode, analyze_task_complexity, evaluate_task_complexity
from ..state import AgentState
from ..persistence import PersistenceService
from .subgraphs import run_tool_execution
from service.session_service.canonical import SegmentType, ContentBlock
from core.logging import console


MAX_REPLAN_COUNT = 3
MAX_MESSAGES = 10

persistence = PersistenceService()


def check_state_v2(state: AgentState) -> Literal["analyze", "execute", "plan", "subagent", "done"]:
    """
    新版状态检查 - 支持多种执行模式
    """
    # 首次进入：分析任务（execution_mode字段不存在）
    if "execution_mode" not in state:
        return "analyze"
    
    # 如果execution_mode为None，说明已经执行完成
    if state.get("execution_mode") is None:
        return "done"
    
    # 规划模式
    if state.get("in_plan_mode"):
        if state.get("plan") and state["current_step"] < len(state["plan"]):
            return "execute"
        return "done"
    
    # 子 Agent 模式
    if state.get("active_subagent"):
        return "subagent"
    
    # 直接执行模式
    if state.get("pending_tools"):
        return "execute"
    
    # 完成
    return "done"


def create_analyze_node(llm_service=None):
    """分析节点 - 决定执行模式"""
    def analyze_node(state: AgentState) -> dict:
        user_message = state["messages"][-1] if state["messages"] else ""
        
        console.step("分析节点", "入口", user_message)
        
        if llm_service:
            system_prompt = """你是一个任务分析专家。请分析用户任务的复杂度，并决定执行模式。

执行模式选项：
1. DIRECT - 直接执行：适用于简单任务，如读取文件、查询信息等
2. PLAN - 规划模式：适用于复杂开发任务，需要多步骤规划
3. SUBAGENT - 子Agent模式：适用于特定类型任务，如探索、审查等

请以JSON格式返回分析结果：
{
    "complexity": "simple/medium/complex",
    "intent_type": "develop/explore/review/question/debug/refactor/other",
    "execution_mode": "DIRECT/PLAN/SUBAGENT",
    "reason": "选择该模式的原因",
    "suggested_tools": ["工具列表"],
    "suggested_agent": "explore/review/None"
}

只返回JSON，不要其他内容。"""
            
            messages = [{"role": "user", "content": f"请分析以下任务：\n\n{user_message}"}]
            
            console.prompt_box("发送给大模型的 Prompt", system_prompt, user_message)
            
            try:
                response = llm_service.chat(messages, system_prompt=system_prompt)
                
                console.response_box(response)
                
                import json
                response_text = response.strip()
                if response_text.startswith("```json"):
                    response_text = response_text[7:]
                if response_text.startswith("```"):
                    response_text = response_text[3:]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]
                response_text = response_text.strip()
                
                analysis_result = json.loads(response_text)
                
                mode_str = analysis_result.get("execution_mode", "DIRECT")
                execution_mode = ExecutionMode[mode_str]
                
                mode_decision = {
                    "mode": execution_mode,
                    "reason": analysis_result.get("reason", ""),
                    "suggested_tools": analysis_result.get("suggested_tools", []),
                    "suggested_agent": analysis_result.get("suggested_agent")
                }
                
                intent_analysis = {
                    "intent_type": analysis_result.get("intent_type", "other"),
                    "summary": user_message[:100],
                    "key_points": [user_message],
                    "suggested_tools": analysis_result.get("suggested_tools", []),
                    "complexity": analysis_result.get("complexity", "medium"),
                    "confidence": 0.9
                }
                
            except Exception as e:
                console.warning(f"调用大模型失败: {e}，使用默认逻辑")
                complexity = evaluate_task_complexity(user_message)
                intent_analysis = {
                    "intent_type": "other",
                    "summary": user_message[:100],
                    "key_points": [user_message],
                    "suggested_tools": [],
                    "complexity": complexity,
                    "confidence": 0.7
                }
                mode_decision = analyze_task_complexity(user_message, intent_analysis)
        else:
            complexity = evaluate_task_complexity(user_message)
            intent_analysis = {
                "intent_type": "other",
                "summary": user_message[:100],
                "key_points": [user_message],
                "suggested_tools": [],
                "complexity": complexity,
                "confidence": 0.7
            }
            mode_decision = analyze_task_complexity(user_message, intent_analysis)
        
        console.decision_box(
            route_after_analyze({'execution_mode': mode_decision['mode']}),
            f"执行模式: {mode_decision['mode']}\n原因: {mode_decision['reason']}"
        )
        
        return {
            "intent_analysis": intent_analysis,
            "execution_mode": mode_decision["mode"],
            "mode_reason": mode_decision["reason"],
            "suggested_tools": mode_decision["suggested_tools"],
            "suggested_subagent": mode_decision["suggested_agent"],
            "in_plan_mode": mode_decision["mode"] == ExecutionMode.PLAN,
            "active_subagent": mode_decision["mode"] == ExecutionMode.SUBAGENT
        }
    
    return analyze_node


def create_execute_node(llm_service=None, token_callback=None, settings_service=None, message_context=None):
    """执行节点"""
    def execute_node(state: AgentState) -> dict:
        if message_context:
            cancel_check = message_context.get("cancel_check")
            if cancel_check:
                cancel_check()
        
        pending_tools = state.get("pending_tools", [])
        if pending_tools:
            tool_name = pending_tools[0].get("tool")
            tool_args = pending_tools[0].get("args", {})
            
            console.step("执行节点", "分析节点", f"执行工具: {tool_name}")
            
            console.box("执行工具", {
                "工具名称": tool_name,
                "工具参数": tool_args
            })
            
            tool_result = run_tool_execution(
                tool_name=tool_name,
                tool_args=tool_args,
                workspace_id=state["workspace_id"],
                previous_calls=state.get("tool_history", []),
                llm_service=llm_service,
                token_callback=token_callback,
                task_description=tool_args.get("description", ""),
                previous_results=[],
                agent_type="build_agent",
                settings_service=settings_service,
                message_context=message_context
            )
            
            result_str = str(tool_result.get("result", ""))
            console.box("工具执行结果", result_str[:200])
            
            new_tool_history = state.get("tool_history", []) + [{
                "tool": tool_name,
                "args": tool_args,
                "result": tool_result.get("result")
            }]
            
            next_step = "execute" if pending_tools[1:] else "done"
            console.decision_box(next_step)
            
            return {
                "pending_tools": pending_tools[1:],
                "tool_history": new_tool_history
            }
        
        if state.get("plan") and state.get("current_step", 0) < len(state["plan"]):
            step = state.get("current_step", 0)
            plan = state["plan"]
            task = plan[step]
            
            phase = task.get('phase', 'implementation')
            phase_names = {
                'research': '研究阶段',
                'synthesis': '综合阶段',
                'implementation': '实现阶段',
                'verification': '验证阶段'
            }
            phase_name = phase_names.get(phase, phase)
            
            console.step("执行节点", "规划节点", task['description'])
            
            tool_name = task.get("tool") or "thinking"
            tool_args = task.get("args") or {}
            
            console.execution_box(
                step + 1, len(plan), phase_name,
                task['description'], tool_name, tool_args
            )
            
            tool_result = run_tool_execution(
                tool_name=tool_name,
                tool_args=tool_args,
                workspace_id=state["workspace_id"],
                previous_calls=state.get("tool_history", []),
                llm_service=llm_service,
                token_callback=token_callback,
                task_description=task.get("description", ""),
                previous_results=[],
                agent_type="build_agent",
                settings_service=settings_service,
                message_context=message_context
            )
            
            result_str = str(tool_result.get("result", ""))
            task["status"] = "completed" if tool_result.get("result") else "failed"
            task["result"] = result_str
            
            if phase == "research":
                task["feedback"] = f"研究完成：{result_str[:100]}..."
            elif phase == "synthesis":
                task["feedback"] = f"综合完成：制定了实现规范"
            elif phase == "implementation":
                task["feedback"] = f"实现完成：{result_str[:100]}..."
            elif phase == "verification":
                task["feedback"] = f"验证完成：{result_str[:100]}..."
            
            console.result_box(task['status'], result_str[:200], task['feedback'])
            
            new_results = state.get("results", []) + [{
                "task": task,
                "result": tool_result
            }]
            
            new_tool_history = state.get("tool_history", []) + [{
                "tool": tool_name,
                "args": tool_args,
                "result": tool_result.get("result")
            }]
            
            next_step = "execute" if step + 1 < len(plan) else "done"
            console.decision_box(next_step)
            
            return {
                "current_step": step + 1,
                "results": new_results,
                "tool_history": new_tool_history,
                "plan": plan
            }
        
        console.step("执行节点", "无", "没有任务可执行")
        console.decision_box("done", "没有任务可执行，执行完成")
        
        return {
            "pending_tools": [],
            "in_plan_mode": False,
            "active_subagent": False,
            "execution_mode": None
        }
    
    return execute_node


def create_plan_node(llm_service=None, token_callback=None, settings_service=None, message_context=None):
    """规划节点"""
    def plan_node(state: AgentState) -> dict:
        user_message = state["messages"][-1] if state["messages"] else ""
        
        console.step("规划节点", "分析节点", user_message)
        
        if llm_service:
            from .subgraphs.plan_graph import get_plan_system_prompt, parse_plan_from_text
            
            system_prompt = get_plan_system_prompt("build_agent", settings_service)
            
            messages = [{"role": "user", "content": f"请为以下任务生成详细的执行计划，包含2-5个步骤：\n\n{user_message}"}]
            
            console.prompt_box("发送给大模型的 Prompt", system_prompt[:200] + "...", user_message)
            
            try:
                response = llm_service.chat(messages, system_prompt=system_prompt)
                
                console.response_box(response)
                
                plan = parse_plan_from_text(response)
                
                for i, task in enumerate(plan):
                    task["id"] = i + 1
                
                console.task_list_box(plan)
                
            except Exception as e:
                console.warning(f"调用大模型失败: {e}，使用默认计划")
                plan = [
                    {"id": 1, "description": f"分析需求: {user_message[:30]}...", "phase": "research", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                    {"id": 2, "description": "设计实现方案", "phase": "synthesis", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                    {"id": 3, "description": "执行实现", "phase": "implementation", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                    {"id": 4, "description": "验证结果", "phase": "verification", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                ]
        else:
            console.warning("LLM服务未配置，使用默认计划")
            plan = [
                {"id": 1, "description": f"分析需求: {user_message[:30]}...", "phase": "research", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                {"id": 2, "description": "设计实现方案", "phase": "synthesis", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                {"id": 3, "description": "执行实现", "phase": "implementation", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                {"id": 4, "description": "验证结果", "phase": "verification", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
            ]
        
        console.decision_box("execute")
        
        return {
            "plan": plan,
            "current_step": 0,
            "pending_tools": []
        }
    
    return plan_node


def create_subagent_node(llm_service=None, token_callback=None, settings_service=None, message_context=None):
    """子 Agent 节点"""
    def subagent_node(state: AgentState) -> dict:
        print("\n" + "="*80)
        print("[Graph执行] 当前步骤: 子Agent节点")
        print("[Graph执行] 上一步: 分析节点")
        
        user_message = state["messages"][-1] if state["messages"] else ""
        suggested_agent = state.get("suggested_subagent", "explore")
        print(f"[Graph执行] 输入消息: {user_message}")
        print(f"[Graph执行] 启动子Agent: {suggested_agent}")
        
        # 模拟发送给大模型的prompt
        prompt = f"请启动 {suggested_agent} Agent 执行任务: {user_message}"
        print(f"[Graph执行] 发送给大模型的prompt: {prompt}")
        
        # 构建 spawn_agent 工具调用
        pending_tools = [{
            "tool": "spawn_agent",
            "args": {
                "agent_type": suggested_agent,
                "task_description": user_message,
                "background": False
            }
        }]
        
        print(f"[Graph执行] 大模型的回复: 启动 {suggested_agent} Agent")
        print("[Graph执行] 下一步: execute")
        
        return {
            "pending_tools": pending_tools,
            "active_subagent": None  # 清除活跃子 Agent 标记
        }
    
    return subagent_node


def route_after_analyze(state: AgentState) -> str:
    """分析后路由"""
    mode = state.get("execution_mode")
    if mode == ExecutionMode.PLAN:
        return "plan"
    elif mode == ExecutionMode.SUBAGENT:
        return "subagent"
    return "execute"


def create_orchestrator_graph_v2(llm_service=None, token_callback=None, memory_mode="accumulate", window_size=3, settings_service=None, message_context=None):
    """
    新版 Orchestrator - 支持多模式执行
    """
    graph = StateGraph(AgentState)
    
    # 节点
    graph.add_node("analyze", create_analyze_node(llm_service))
    graph.add_node("execute", create_execute_node(llm_service, token_callback, settings_service, message_context))
    graph.add_node("plan", create_plan_node(llm_service, token_callback, settings_service, message_context))
    graph.add_node("subagent", create_subagent_node(llm_service, token_callback, settings_service, message_context))
    
    # 入口
    graph.set_conditional_entry_point(check_state_v2, {
        "analyze": "analyze",
        "execute": "execute",
        "plan": "plan",
        "subagent": "subagent",
        "done": END
    })
    
    # 分析后路由
    graph.add_conditional_edges("analyze", route_after_analyze, {
        "execute": "execute",
        "plan": "plan",
        "subagent": "subagent",
    })
    
    # 执行后检查
    graph.add_conditional_edges("execute", check_state_v2, {
        "analyze": "analyze",
        "execute": "execute",
        "plan": "plan",
        "subagent": "subagent",
        "done": END
    })
    
    # 规划后执行
    graph.add_edge("plan", "execute")
    
    # 子 Agent 完成后
    graph.add_conditional_edges("subagent", check_state_v2, {
        "analyze": "analyze",
        "execute": "execute",
        "done": END
    })
    
    return graph.compile()



def run_graph_v2(
    user_message: str, 
    workspace_id: str, 
    llm_service=None, 
    token_callback=None,
    memory_mode: str = "accumulate",
    window_size: int = 3,
    settings_service=None,
    message_context: dict = None,
    parent_chain_messages: List[dict] = None,
    current_conversation_messages: List[dict] = None
) -> dict:
    """
    运行新版 Orchestrator
    """
    print("\n" + "="*60)
    print("[Orchestrator V2] 主编排图启动")
    print(f"[Orchestrator V2] 记忆模式: {memory_mode}, 窗口大小: {window_size}")
    print("="*60)
    
    saved_state = persistence.load(workspace_id)
    
    if saved_state:
        print(f"[Orchestrator V2] 恢复已保存的状态")
        initial_state = saved_state
        initial_state["messages"] = initial_state.get("messages", []) + [user_message]
    else:
        initial_state = {
            "messages": [user_message],
            "workspace_id": workspace_id,
            "plan": [],
            "current_step": 0,
            "results": [],
            "plan_failed": False,
            "explore_result": None,
            "tool_history": [],
            "replan_count": 0,
            "agent_type": None,
            "parent_chain_messages": parent_chain_messages or [],
            "current_conversation_messages": current_conversation_messages or [],
        }
    
    graph = create_orchestrator_graph_v2(llm_service, token_callback, memory_mode, window_size, settings_service, message_context)
    final_state = graph.invoke(initial_state)
    
    persistence.save(workspace_id, final_state)
    
    print("\n" + "="*60)
    print("[Orchestrator V2] 主编排图执行完成")
    print("="*60)
    
    return final_state
