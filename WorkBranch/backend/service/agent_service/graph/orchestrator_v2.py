from typing import Literal, Optional, Dict, Any, List
from langgraph.graph import StateGraph, END
from .decision.complexity_analyzer import ExecutionMode, analyze_task_complexity, evaluate_task_complexity
from ..state import AgentState
from ..persistence import PersistenceService
from .subgraphs import run_tool_execution
from service.session_service.canonical import SegmentType, ContentBlock


MAX_REPLAN_COUNT = 3
MAX_MESSAGES = 10

persistence = PersistenceService()


def check_state_v2(state: AgentState) -> Literal["analyze", "execute", "plan", "subagent", "done"]:
    """
    新版状态检查 - 支持多种执行模式
    """
    # 首次进入：分析任务
    if not state.get("execution_mode"):
        return "analyze"
    
    # 规划模式
    if state.get("in_plan_mode"):
        if state.get("plan") and state["current_step"] < len(state["plan"]):
            return "execute"
        return "plan"
    
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
        
        # 1. 评估任务复杂度
        complexity = evaluate_task_complexity(user_message)
        
        # 2. 简单意图分析
        intent_analysis = {
            "intent_type": "other",
            "summary": user_message[:100],
            "key_points": [user_message],
            "suggested_tools": [],
            "complexity": complexity,
            "confidence": 0.7
        }
        
        # 3. 复杂度评估
        mode_decision = analyze_task_complexity(user_message, intent_analysis)
        
        print(f"[Orchestrator] 执行模式: {mode_decision['mode']}")
        print(f"[Orchestrator] 原因: {mode_decision['reason']}")
        
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
        # 检查取消状态
        if message_context:
            cancel_check = message_context.get("cancel_check")
            if cancel_check:
                cancel_check()
        
        print("\n" + "="*60)
        print("[Orchestrator] 节点: execute")
        print("="*60)
        
        # 执行待处理工具
        pending_tools = state.get("pending_tools", [])
        if pending_tools:
            tool_name = pending_tools[0].get("tool")
            tool_args = pending_tools[0].get("args", {})
            
            print(f"[Execute] 执行工具: {tool_name}")
            
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
            
            new_tool_history = state.get("tool_history", []) + [{
                "tool": tool_name,
                "args": tool_args,
                "result": tool_result.get("result")
            }]
            
            return {
                "pending_tools": pending_tools[1:],
                "tool_history": new_tool_history
            }
        
        # 执行规划中的任务
        if state.get("plan") and state.get("current_step", 0) < len(state["plan"]):
            step = state.get("current_step", 0)
            plan = state["plan"]
            task = plan[step]
            
            print(f"[Execute] 执行任务 {step + 1}/{len(plan)}: {task['description']}")
            
            tool_name = task.get("tool") or "thinking"
            tool_args = task.get("args") or {}
            
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
            
            new_results = state.get("results", []) + [{
                "task": task,
                "result": tool_result
            }]
            
            new_tool_history = state.get("tool_history", []) + [{
                "tool": tool_name,
                "args": tool_args,
                "result": tool_result.get("result")
            }]
            
            return {
                "current_step": step + 1,
                "results": new_results,
                "tool_history": new_tool_history
            }
        
        return {}
    
    return execute_node


def create_plan_node(llm_service=None, token_callback=None, settings_service=None, message_context=None):
    """规划节点"""
    def plan_node(state: AgentState) -> dict:
        print("\n" + "="*60)
        print("[Orchestrator] 节点: plan")
        print("="*60)
        
        user_message = state["messages"][-1] if state["messages"] else ""
        
        # 生成规划
        from .subgraphs.plan_graph import generate_plan
        
        plan = generate_plan(
            user_message,
            llm_service=llm_service,
            max_steps=5
        )
        
        print(f"[Plan] 生成了 {len(plan)} 个任务")
        for i, task in enumerate(plan, 1):
            print(f"{i}. {task['description']}")
        
        return {
            "plan": plan,
            "current_step": 0,
            "pending_tools": []
        }
    
    return plan_node


def create_subagent_node(llm_service=None, token_callback=None, settings_service=None, message_context=None):
    """子 Agent 节点"""
    def subagent_node(state: AgentState) -> dict:
        print("\n" + "="*60)
        print("[Orchestrator] 节点: subagent")
        print("="*60)
        
        user_message = state["messages"][-1] if state["messages"] else ""
        suggested_agent = state.get("suggested_subagent", "explore")
        
        print(f"[Subagent] 启动 {suggested_agent} Agent")
        
        # 构建 spawn_agent 工具调用
        pending_tools = [{
            "tool": "spawn_agent",
            "args": {
                "agent_type": suggested_agent,
                "task_description": user_message,
                "background": False
            }
        }]
        
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
