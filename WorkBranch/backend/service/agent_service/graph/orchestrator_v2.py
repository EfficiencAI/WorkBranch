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
        
        print("\n" + "╔" + "═"*78 + "╗")
        print("║" + " "*30 + "Graph 执行日志" + " "*34 + "║")
        print("╠" + "═"*78 + "╣")
        print("║ 当前步骤: 分析节点" + " "*58 + "║")
        print("║ 上一步:   入口" + " "*62 + "║")
        print("║ 输入消息: " + user_message[:65] + ("..." if len(user_message) > 65 else "") + " "*(68-min(len(user_message), 65)) + "║")
        print("╚" + "═"*78 + "╝")
        
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
            
            print("\n┌─ 发送给大模型的 Prompt " + "─"*52 + "┐")
            print("│")
            print("│ [系统提示词]")
            print("│ " + system_prompt.replace("\n", "\n│ "))
            print("│")
            print("│ [用户消息]")
            print("│ " + user_message)
            print("│")
            print("└" + "─"*78 + "┘")
            
            try:
                response = llm_service.chat(messages, system_prompt=system_prompt)
                
                print("\n┌─ 大模型的回复 " + "─"*62 + "┐")
                print("│")
                print("│ " + response.replace("\n", "\n│ "))
                print("│")
                print("└" + "─"*78 + "┘")
                
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
                print(f"\n⚠️  调用大模型失败: {e}，使用默认逻辑")
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
        
        print("\n┌─ 执行决策 " + "─"*66 + "┐")
        print("│")
        print(f"│ 执行模式: {mode_decision['mode']}")
        print(f"│ 原因:     {mode_decision['reason']}")
        print(f"│ 下一步:   {route_after_analyze({'execution_mode': mode_decision['mode']})}")
        print("│")
        print("└" + "─"*78 + "┘")
        
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
        
        # 执行待处理工具
        pending_tools = state.get("pending_tools", [])
        if pending_tools:
            tool_name = pending_tools[0].get("tool")
            tool_args = pending_tools[0].get("args", {})
            
            print("\n" + "╔" + "═"*78 + "╗")
            print("║" + " "*30 + "Graph 执行日志" + " "*34 + "║")
            print("╠" + "═"*78 + "╣")
            print("║ 当前步骤: 执行节点" + " "*58 + "║")
            print("║ 上一步:   分析节点" + " "*60 + "║")
            print("║ 执行模式: " + str(state.get("execution_mode")) + " "*(66-len(str(state.get("execution_mode")))) + "║")
            print("╚" + "═"*78 + "╝")
            
            print("\n┌─ 执行工具 " + "─"*66 + "┐")
            print("│")
            print(f"│ 工具名称: {tool_name}")
            print(f"│ 工具参数: {tool_args}")
            print("│")
            print("└" + "─"*78 + "┘")
            
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
            
            print("\n┌─ 工具执行结果 " + "─"*62 + "┐")
            print("│")
            result_str = str(tool_result.get("result", ""))
            print("│ " + result_str[:200].replace("\n", "\n│ "))
            if len(result_str) > 200:
                print("│ ...")
            print("│")
            print("└" + "─"*78 + "┘")
            
            new_tool_history = state.get("tool_history", []) + [{
                "tool": tool_name,
                "args": tool_args,
                "result": tool_result.get("result")
            }]
            
            next_step = "execute" if pending_tools[1:] else "done"
            
            print("\n┌─ 执行决策 " + "─"*66 + "┐")
            print("│")
            print(f"│ 下一步: {next_step}")
            print("│")
            print("└" + "─"*78 + "┘")
            
            return {
                "pending_tools": pending_tools[1:],
                "tool_history": new_tool_history
            }
        
        # 执行规划中的任务
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
            
            print("\n" + "╔" + "═"*78 + "╗")
            print("║" + " "*30 + "Graph 执行日志" + " "*34 + "║")
            print("╠" + "═"*78 + "╣")
            print("║ 当前步骤: 执行节点" + " "*58 + "║")
            print("║ 上一步:   规划节点" + " "*60 + "║")
            print("║ 执行模式: " + str(state.get("execution_mode")) + " "*(66-len(str(state.get("execution_mode")))) + "║")
            print("╚" + "═"*78 + "╝")
            
            print("\n┌─ 执行任务 " + "─"*66 + "┐")
            print("│")
            print(f"│ 任务进度: {step + 1}/{len(plan)}")
            print(f"│ 任务阶段: {phase_name}")
            print(f"│ 任务描述: {task['description']}")
            tool_name = task.get("tool") or "thinking"
            print(f"│ 使用工具: {tool_name}")
            tool_args = task.get("args") or {}
            if tool_args:
                print(f"│ 工具参数: {tool_args}")
            print("│")
            print("└" + "─"*78 + "┘")
            
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
            
            print("\n┌─ 任务执行结果 " + "─"*60 + "┐")
            print("│")
            print(f"│ 状态: {task['status']}")
            print("│ 结果:")
            print("│ " + result_str[:200].replace("\n", "\n│ "))
            if len(result_str) > 200:
                print("│ ...")
            print("│")
            print(f"│ 反馈: {task['feedback']}")
            print("│")
            print("└" + "─"*78 + "┘")
            
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
            
            print("\n┌─ 执行决策 " + "─"*66 + "┐")
            print("│")
            print(f"│ 下一步: {next_step}")
            print("│")
            print("└" + "─"*78 + "┘")
            
            return {
                "current_step": step + 1,
                "results": new_results,
                "tool_history": new_tool_history,
                "plan": plan
            }
        
        # 没有任务可执行，返回完成状态
        print("\n" + "╔" + "═"*78 + "╗")
        print("║" + " "*30 + "Graph 执行日志" + " "*34 + "║")
        print("╠" + "═"*78 + "╣")
        print("║ 当前步骤: 执行节点" + " "*58 + "║")
        print("║ 上一步:   无" + " "*66 + "║")
        print("╚" + "═"*78 + "╝")
        
        print("\n┌─ 执行决策 " + "─"*66 + "┐")
        print("│")
        print("│ 没有任务可执行，执行完成")
        print("│ 下一步: done")
        print("│")
        print("└" + "─"*78 + "┘")
        
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
        
        print("\n" + "╔" + "═"*78 + "╗")
        print("║" + " "*30 + "Graph 执行日志" + " "*34 + "║")
        print("╠" + "═"*78 + "╣")
        print("║ 当前步骤: 规划节点" + " "*58 + "║")
        print("║ 上一步:   分析节点" + " "*60 + "║")
        print("║ 输入消息: " + user_message[:65] + ("..." if len(user_message) > 65 else "") + " "*(68-min(len(user_message), 65)) + "║")
        print("╚" + "═"*78 + "╝")
        
        if llm_service:
            from .subgraphs.plan_graph import get_plan_system_prompt, parse_plan_from_text
            
            system_prompt = get_plan_system_prompt("build_agent", settings_service)
            
            messages = [{"role": "user", "content": f"请为以下任务生成详细的执行计划，包含2-5个步骤：\n\n{user_message}"}]
            
            print("\n┌─ 发送给大模型的 Prompt " + "─"*52 + "┐")
            print("│")
            print("│ [系统提示词]")
            print("│ " + system_prompt[:200].replace("\n", "\n│ ") + "...")
            print("│")
            print("│ [用户消息]")
            print("│ " + user_message)
            print("│")
            print("└" + "─"*78 + "┘")
            
            try:
                response = llm_service.chat(messages, system_prompt=system_prompt)
                
                print("\n┌─ 大模型的回复 " + "─"*62 + "┐")
                print("│")
                print("│ " + response.replace("\n", "\n│ "))
                print("│")
                print("└" + "─"*78 + "┘")
                
                plan = parse_plan_from_text(response)
                
                for i, task in enumerate(plan):
                    task["id"] = i + 1
                
                print("\n┌─ 生成的任务计划 " + "─"*58 + "┐")
                print("│")
                print(f"│ 共生成 {len(plan)} 个任务:")
                current_phase = None
                for task in plan:
                    phase = task.get('phase', 'implementation')
                    if phase != current_phase:
                        current_phase = phase
                        phase_names = {
                            'research': '研究阶段',
                            'synthesis': '综合阶段',
                            'implementation': '实现阶段',
                            'verification': '验证阶段'
                        }
                        print(f"│")
                        print(f"│ [{phase_names.get(phase, phase)}]")
                    
                    tool_info = f" [工具: {task.get('tool')}]" if task.get('tool') else ""
                    print(f"│   {task['id']}. {task['description']}{tool_info}")
                print("│")
                print("└" + "─"*78 + "┘")
                
            except Exception as e:
                print(f"\n⚠️  调用大模型失败: {e}，使用默认计划")
                plan = [
                    {"id": 1, "description": f"分析需求: {user_message[:30]}...", "phase": "research", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                    {"id": 2, "description": "设计实现方案", "phase": "synthesis", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                    {"id": 3, "description": "执行实现", "phase": "implementation", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                    {"id": 4, "description": "验证结果", "phase": "verification", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                ]
        else:
            print("\n⚠️  LLM服务未配置，使用默认计划")
            plan = [
                {"id": 1, "description": f"分析需求: {user_message[:30]}...", "phase": "research", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                {"id": 2, "description": "设计实现方案", "phase": "synthesis", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                {"id": 3, "description": "执行实现", "phase": "implementation", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
                {"id": 4, "description": "验证结果", "phase": "verification", "status": "pending", "tool": None, "args": None, "result": None, "feedback": None},
            ]
        
        print("\n┌─ 执行决策 " + "─"*66 + "┐")
        print("│")
        print("│ 下一步: execute")
        print("│")
        print("└" + "─"*78 + "┘")
        
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
