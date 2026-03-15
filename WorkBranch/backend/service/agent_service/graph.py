from typing import Literal
from langgraph.graph import StateGraph, END
from .state import AgentState, ToolCall
from .plan import run_plan_flow
from .tool_execution import run_tool_execution
from .compaction import run_compaction
from .persistence import PersistenceService

MAX_REPLAN_COUNT = 3
MAX_MESSAGES = 10

persistence = PersistenceService()


def check_state(state: AgentState) -> Literal["plan", "build", "compaction", "done"]:
    """检查状态，决定下一步"""
    if not state.get("plan"):
        print("[Graph] 状态: 无计划 → Plan")
        return "plan"
    
    if state.get("plan_failed"):
        replan_count = state.get("replan_count", 0)
        if replan_count >= MAX_REPLAN_COUNT:
            print(f"[Graph] 重规划次数已达上限 ({replan_count}/{MAX_REPLAN_COUNT}) → Done")
            return "done"
        print(f"[Graph] 状态: 计划失败 → 重新Plan ({replan_count}/{MAX_REPLAN_COUNT})")
        return "plan"
    
    if state["current_step"] < len(state["plan"]):
        print(f"[Graph] 状态: 执行中 ({state['current_step']}/{len(state['plan'])}) → Build")
        return "build"
    
    print("[Graph] 状态: 完成 → Done")
    return "done"


def create_plan_node(llm_service=None):
    """创建 Plan 节点"""
    def plan_node(state: AgentState) -> dict:
        is_replan = state.get("plan_failed", False)
        replan_count = state.get("replan_count", 0)
        
        if is_replan:
            print("\n" + "="*60)
            print(f"[Graph] 重新规划 (第 {replan_count + 1} 次)，重置状态")
            print("="*60)
        
        result = run_plan_flow(state, llm_service)
        
        if is_replan:
            result["tool_history"] = []
            result["plan_failed"] = False
            result["current_step"] = 0
            result["results"] = []
            result["replan_count"] = replan_count + 1
        
        persistence.save(state["workspace_id"], result)
        
        return result
    
    return plan_node


def create_build_flow(llm_service=None):
    """创建 Build 流程"""
    def build_flow(state: AgentState) -> dict:
        print("\n" + "="*60)
        print("[Graph] 节点: build_flow")
        print("="*60)
        
        step = state["current_step"]
        plan = state["plan"]
        
        if step >= len(plan):
            print("[Build] 所有任务已完成")
            return {"current_step": step}
        
        task = plan[step]
        print(f"[Build] 执行任务 {step + 1}/{len(plan)}: {task['description']}")
        
        tool_name = task.get("tool") or "default_tool"
        tool_args = task.get("args") or {}
        tool_history = state.get("tool_history", [])
        
        tool_result = run_tool_execution(
            tool_name=tool_name,
            tool_args=tool_args,
            workspace_id=state["workspace_id"],
            previous_calls=tool_history
        )
        
        if tool_result.get("error"):
            print(f"[Build] 执行失败: {tool_result['error']}")
            if tool_result.get("doom_loop_detected"):
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
    """Compaction 节点：压缩消息"""
    messages = state.get("messages", [])
    
    if len(messages) > MAX_MESSAGES:
        result = run_compaction(messages, MAX_MESSAGES)
        return {"messages": result["messages"]}
    
    return {}


def create_main_graph(llm_service=None):
    """创建主 Graph"""
    graph = StateGraph(AgentState)
    
    graph.add_node("plan_flow", create_plan_node(llm_service))
    graph.add_node("build_flow", create_build_flow(llm_service))
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


def run_graph(user_message: str, workspace_id: str, llm_service=None) -> dict:
    """运行主 Graph"""
    print("\n" + "="*60)
    print("[Graph] 主 Graph 启动")
    print("="*60)
    
    saved_state = persistence.load(workspace_id)
    
    if saved_state:
        print(f"[Graph] 恢复已保存的状态")
        initial_state = saved_state
        initial_state["messages"] = initial_state.get("messages", []) + [user_message]
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
        }
    
    graph = create_main_graph(llm_service)
    final_state = graph.invoke(initial_state)
    
    persistence.save(workspace_id, final_state)
    
    print("\n" + "="*60)
    print("[Graph] 主 Graph 执行完成")
    print("="*60)
    
    return final_state
