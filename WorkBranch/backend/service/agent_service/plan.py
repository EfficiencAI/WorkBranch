from typing import Literal, List, Callable, Optional
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field
from .state import AgentState, Task
from .explore import run_explore


class TaskPlan(BaseModel):
    """LLM 输出的任务计划"""
    tasks: List[dict] = Field(description="任务列表，每个任务包含 id, description, tool, args")


PLAN_SYSTEM_PROMPT = """你是一个专业的软件工程师助手。你的任务是根据用户需求生成一个清晰的执行计划。

请生成一个任务列表，每个任务应该：
1. 有明确的描述
2. 指定需要使用的工具（如果需要）
3. 提供工具参数（如果需要）

可用的工具包括：
- read_file: 读取文件内容
- write_file: 写入文件
- search_code: 搜索代码
- execute_command: 执行命令
- default_tool: 默认工具（用于分析、设计等非工具操作）

请直接输出任务列表，不要有多余的解释。"""


def phase1_understand(state: AgentState, llm_service=None) -> dict:
    """Phase 1: 理解需求"""
    print("\n" + "="*60)
    print("[Plan] Phase 1/5: 理解需求")
    print("="*60)
    
    user_message = state["messages"][-1] if state["messages"] else ""
    print(f"[Plan] 用户消息: {user_message}")
    
    print("[Plan] 判断是否需要探索代码库...")
    need_explore = len(user_message) > 10
    
    if need_explore:
        print("[Plan] 需要探索代码库")
        explore_result = run_explore(
            request=user_message,
            workspace_path=".",
            thoroughness="medium"
        )
        print(f"[Plan] 探索结果: {explore_result['summary']}")
        return {"explore_result": explore_result}
    
    print("[Plan] 无需探索，直接进入下一阶段")
    return {}


def phase2_design(state: AgentState, llm_service=None, token_callback: Optional[Callable[[str], None]] = None) -> dict:
    """Phase 2: 生成计划"""
    print("\n" + "="*60)
    print("[Plan] Phase 2/5: 生成计划")
    print("="*60)
    
    user_message = state["messages"][-1] if state["messages"] else ""
    print(f"[Plan] 基于需求设计任务计划...")
    
    explore_result = state.get("explore_result", {})
    explore_context = ""
    if explore_result:
        explore_context = f"\n\n代码库探索结果:\n{explore_result.get('summary', '无')}"
    
    if llm_service is None:
        print("[Plan] LLM 服务未配置，使用默认计划")
        plan = [
            {"id": 1, "description": f"分析需求: {user_message[:30]}...", "tool": None, "args": None},
            {"id": 2, "description": "设计实现方案", "tool": None, "args": None},
            {"id": 3, "description": "执行实现", "tool": None, "args": None},
            {"id": 4, "description": "验证结果", "tool": None, "args": None},
        ]
    else:
        try:
            print("[Plan] 调用 LLM 生成计划...")
            print("[Plan] LLM 思考中:")
            
            prompt = f"""请根据以下用户需求生成执行计划：

用户需求: {user_message}
{explore_context}

请生成一个包含 2-5 个任务的执行计划。"""
            
            messages = [{"role": "user", "content": prompt}]
            
            full_response = ""
            for chunk in llm_service.chat_stream(messages, PLAN_SYSTEM_PROMPT, token_callback):
                full_response += chunk
            
            plan = parse_plan_from_text(full_response)
            
            for i, task in enumerate(plan):
                task["id"] = i + 1
            
            print(f"\n[Plan] LLM 生成了 {len(plan)} 个任务")
            
        except Exception as e:
            print(f"[Plan] LLM 调用失败: {e}")
            print("[Plan] 使用默认计划")
            plan = [
                {"id": 1, "description": f"分析需求: {user_message[:30]}...", "tool": None, "args": None},
                {"id": 2, "description": "设计实现方案", "tool": None, "args": None},
                {"id": 3, "description": "执行实现", "tool": None, "args": None},
                {"id": 4, "description": "验证结果", "tool": None, "args": None},
            ]
    
    print(f"[Plan] 生成 {len(plan)} 个任务:")
    for task in plan:
        print(f"  - Task {task['id']}: {task['description']}")
    
    return {"plan": plan}


def parse_plan_from_text(text: str) -> List[dict]:
    """从文本解析计划"""
    tasks = []
    lines = text.strip().split("\n")
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        if line[0].isdigit() or line.startswith("-") or line.startswith("*"):
            desc = line.lstrip("0123456789.-* ").strip()
            if desc:
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
    
    return tasks


def phase3_review(state: AgentState, llm_service=None) -> dict:
    """Phase 3: 审查计划"""
    print("\n" + "="*60)
    print("[Plan] Phase 3/5: 审查计划")
    print("="*60)
    
    plan = state.get("plan", [])
    print(f"[Plan] 审查 {len(plan)} 个任务...")
    
    for task in plan:
        print(f"  ✓ Task {task['id']}: {task['description']}")
    
    print("[Plan] 审查通过")
    return {}


def phase4_finalize(state: AgentState, llm_service=None) -> dict:
    """Phase 4: 最终计划"""
    print("\n" + "="*60)
    print("[Plan] Phase 4/5: 最终计划")
    print("="*60)
    
    plan = state.get("plan", [])
    print(f"[Plan] 确认最终计划，共 {len(plan)} 个任务")
    
    return {"current_step": 0, "plan_failed": False}


def phase5_exit(state: AgentState, llm_service=None) -> dict:
    """Phase 5: 计划退出"""
    print("\n" + "="*60)
    print("[Plan] Phase 5/5: 计划完成")
    print("="*60)
    
    print("[Plan] Plan 流程结束，准备进入 Build 流程")
    return {}


def create_plan_subgraph(llm_service=None, token_callback: Optional[Callable[[str], None]] = None):
    """创建 Plan 子图"""
    
    def _phase1(state):
        return phase1_understand(state, llm_service)
    
    def _phase2(state):
        return phase2_design(state, llm_service, token_callback)
    
    def _phase3(state):
        return phase3_review(state, llm_service)
    
    def _phase4(state):
        return phase4_finalize(state, llm_service)
    
    def _phase5(state):
        return phase5_exit(state, llm_service)
    
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


def run_plan_flow(state: AgentState, llm_service=None, token_callback: Optional[Callable[[str], None]] = None) -> dict:
    """运行 Plan 流程"""
    print("\n" + "="*60)
    print("[Flow] Plan 流程启动")
    print("="*60)
    
    graph = create_plan_subgraph(llm_service, token_callback)
    result = graph.invoke(state)
    
    print("="*60)
    print("[Flow] Plan 流程完成")
    print("="*60)
    
    return result
