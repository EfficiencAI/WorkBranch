"""
Orchestrator Graph - 主编排图

架构说明:
    - Plan 节点使用 plan_agent 类型
    - Build 节点使用 build_agent 类型
    - SubAgent (explore_agent, review_agent) 通过工具调用
"""

from typing import Literal, Callable, Optional, List
from langgraph.graph import StateGraph, END

from ..state import AgentState, ToolCall
from ..persistence import PersistenceService
from .subgraphs import run_plan_flow, run_tool_execution, run_compaction
from service.session_service.canonical import SegmentType, ContentBlock

MAX_REPLAN_COUNT = 3
MAX_MESSAGES = 10

persistence = PersistenceService()


def get_previous_results(
    tool_history: List[ToolCall],
    memory_mode: str = "accumulate",
    window_size: int = 3
) -> List[str]:
    all_results = [call.get("result", "") for call in tool_history if call.get("result")]
    
    if memory_mode == "sliding":
        return all_results[-window_size:] if window_size > 0 else []
    
    return all_results


def check_state(state: AgentState) -> Literal["plan", "build", "compaction", "done"]:
    if not state.get("plan"):
        print("[Orchestrator] 状态: 无计划 → Plan")
        return "plan"
    
    if state.get("plan_failed"):
        replan_count = state.get("replan_count", 0)
        if replan_count >= MAX_REPLAN_COUNT:
            print(f"[Orchestrator] 重规划次数已达上限 ({replan_count}/{MAX_REPLAN_COUNT}) → Done")
            return "done"
        print(f"[Orchestrator] 状态: 计划失败 → 重新Plan ({replan_count}/{MAX_REPLAN_COUNT})")
        return "plan"
    
    if state["current_step"] < len(state["plan"]):
        print(f"[Orchestrator] 状态: 执行中 ({state['current_step']}/{len(state['plan'])}) → Build")
        return "build"
    
    print("[Orchestrator] 状态: 完成 → Done")
    return "done"


def create_plan_node(llm_service=None, token_callback: Optional[Callable[[str], None]] = None, settings_service=None, message_context: dict = None):
    def plan_node(state: AgentState) -> dict:
        is_replan = state.get("plan_failed", False)
        replan_count = state.get("replan_count", 0)
        
        if message_context:
            send_message = message_context.get("send_message")
            if send_message:
                metadata = {"state": "plan", "is_replan": is_replan}
                send_message("", SegmentType.STATE_CHANGE, metadata)
        
        plan_state = {**state, "agent_type": "plan_agent"}
        
        if is_replan:
            print("\n" + "="*60)
            print(f"[Orchestrator] 重新规划 (第 {replan_count + 1} 次)，重置状态")
            print("="*60)
        
        result = run_plan_flow(plan_state, llm_service, token_callback, settings_service, message_context)
        
        if is_replan:
            result["tool_history"] = []
            result["plan_failed"] = False
            result["current_step"] = 0
            result["results"] = []
            result["replan_count"] = replan_count + 1
        
        persistence.save(state["workspace_id"], result)
        
        return result
    
    return plan_node


def create_build_flow(llm_service=None, token_callback: Optional[Callable[[str], None]] = None, memory_mode: str = "accumulate", window_size: int = 3, settings_service=None, message_context: dict = None):
    def build_flow(state: AgentState) -> dict:
        # 检查取消状态
        if message_context:
            cancel_check = message_context.get("cancel_check")
            if cancel_check:
                cancel_check()
        
        print("\n" + "="*60)
        print("[Orchestrator] 节点: build_flow")
        print("="*60)
        
        step = state["current_step"]
        plan = state["plan"]
        agent_type = "build_agent"
        
        if message_context:
            send_message = message_context.get("send_message")
            if send_message:
                metadata = {
                    "state": "build",
                    "step": step + 1,
                    "total": len(plan)
                }
                send_message("", SegmentType.STATE_CHANGE, metadata)
        
        if step >= len(plan):
            print("[Build] 所有任务已完成")
            return {"current_step": step}
        
        task = plan[step]
        print(f"[Build] 执行任务 {step + 1}/{len(plan)}: {task['description']}")
        
        tool_name = task.get("tool") or "thinking"
        tool_args = task.get("args") or {}
        tool_history = state.get("tool_history", [])
        previous_results = get_previous_results(tool_history, memory_mode, window_size)
        
        print(f"[Build] 记忆模式: {memory_mode}, 传递 {len(previous_results)} 个之前结果")
        print(f"[Build] Agent 类型: {agent_type}")
        
        tool_result = run_tool_execution(
            tool_name=tool_name,
            tool_args=tool_args,
            workspace_id=state["workspace_id"],
            previous_calls=tool_history,
            llm_service=llm_service,
            token_callback=token_callback,
            task_description=task.get("description", ""),
            previous_results=previous_results,
            agent_type=agent_type,
            settings_service=settings_service,
            message_context=message_context
        )
        
        if tool_result.get("error"):
            print(f"[Build] 执行失败: {tool_result['error']}")
            if tool_result.get("doom_loop_detected"):
                if message_context:
                    send_message = message_context.get("send_message")
                    if send_message:
                        send_message("DoomLoop detected: repeated tool calls", SegmentType.ERROR, {"source": "doom_loop"})
                return {"plan_failed": True}
            result = f"任务 {task['id']} 失败: {tool_result['error']}"
        else:
            print(f"[Build] 执行成功: {tool_result.get('result')}")
            result = f"任务 {task['id']} 完成: {tool_result.get('result')}"
        
        new_results = state.get("results", []) + [result]
        new_tool_history = tool_history + [{
            "tool": tool_name,
            "args": tool_args,
            "result": tool_result.get("result")
        }]
        
        update = {
            "current_step": step + 1,
            "results": new_results,
            "tool_history": new_tool_history,
            "plan_failed": False
        }
        
        persistence.save(state["workspace_id"], {**state, **update})
        
        return update
    
    return build_flow


def compaction_node(state: AgentState) -> dict:
    messages = state.get("messages", [])
    
    if len(messages) > MAX_MESSAGES:
        result = run_compaction(messages, MAX_MESSAGES)
        return {"messages": result["messages"]}
    
    return {}


def create_orchestrator_graph(llm_service=None, token_callback: Optional[Callable[[str], None]] = None, memory_mode: str = "accumulate", window_size: int = 3, settings_service=None, message_context: dict = None):
    graph = StateGraph(AgentState)
    
    graph.add_node("plan_flow", create_plan_node(llm_service, token_callback, settings_service, message_context))
    graph.add_node("build_flow", create_build_flow(llm_service, token_callback, memory_mode, window_size, settings_service, message_context))
    graph.add_node("compaction", compaction_node)
    
    graph.set_conditional_entry_point(check_state, {
        "plan": "plan_flow",
        "build": "build_flow",
        "compaction": "compaction",
        "done": END
    })
    
    graph.add_conditional_edges("plan_flow", check_state, {
        "plan": "plan_flow",
        "build": "build_flow",
        "compaction": "compaction",
        "done": END
    })
    
    graph.add_conditional_edges("build_flow", check_state, {
        "plan": "plan_flow",
        "build": "build_flow",
        "compaction": "compaction",
        "done": END
    })
    
    graph.add_edge("compaction", "build_flow")
    
    return graph.compile()


def run_graph(
    user_message: str, 
    workspace_id: str, 
    llm_service=None, 
    token_callback: Optional[Callable[[str], None]] = None,
    memory_mode: str = "accumulate",
    window_size: int = 3,
    settings_service=None,
    message_context: dict = None,
    parent_chain_messages: List[dict] = None,
    current_conversation_messages: List[dict] = None
) -> dict:
    print("\n" + "="*60)
    print("[Orchestrator] 主编排图启动")
    print(f"[Orchestrator] 记忆模式: {memory_mode}, 窗口大小: {window_size}")
    print(f"[Orchestrator] 父节点链消息数量: {len(parent_chain_messages) if parent_chain_messages else 0}")
    print(f"[Orchestrator] 当前对话内消息数量: {len(current_conversation_messages) if current_conversation_messages else 0}")
    print("="*60)
    
    saved_state = persistence.load(workspace_id)
    
    if saved_state:
        print(f"[Orchestrator] 恢复已保存的状态")
        initial_state = saved_state
        initial_state["messages"] = initial_state.get("messages", []) + [user_message]
        if parent_chain_messages:
            initial_state["parent_chain_messages"] = parent_chain_messages
        if current_conversation_messages:
            initial_state["current_conversation_messages"] = current_conversation_messages
    else:
        initial_state: AgentState = {
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
    
    graph = create_orchestrator_graph(llm_service, token_callback, memory_mode, window_size, settings_service, message_context)
    final_state = graph.invoke(initial_state)
    
    persistence.save(workspace_id, final_state)
    
    print("\n" + "="*60)
    print("[Orchestrator] 主编排图执行完成")
    print("="*60)
    
    return final_state
