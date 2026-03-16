from typing import TypedDict, List, Literal
from langgraph.graph import StateGraph, END
import os
import glob as glob_module


class ExploreState(TypedDict):
    """Explore 子图状态"""
    request: str
    workspace_path: str
    thoroughness: Literal["quick", "medium", "thorough"]
    findings: List[dict]
    summary: str


def analyze_request(state: ExploreState) -> dict:
    """分析探索请求"""
    print("\n" + "-"*40)
    print("[Explore] 分析探索请求...")
    print(f"[Explore] 请求: {state['request']}")
    print(f"[Explore] 彻底性: {state['thoroughness']}")
    return {}


def quick_search(state: ExploreState) -> dict:
    """快速搜索：仅 Glob"""
    print("[Explore] 执行快速搜索...")
    findings = []
    
    patterns = ["**/*.py", "**/*.json", "**/*.md"]
    for pattern in patterns:
        matches = glob_module.glob(
            os.path.join(state["workspace_path"], pattern),
            recursive=True
        )
        for m in matches[:5]:
            findings.append({"path": m, "type": "file"})
    
    print(f"[Explore] 快速搜索发现 {len(findings)} 个文件")
    return {"findings": findings}


def medium_search(state: ExploreState) -> dict:
    """中等搜索：Glob + 读取关键文件"""
    print("[Explore] 执行中等搜索...")
    findings = []
    
    patterns = ["**/*.py"]
    for pattern in patterns:
        matches = glob_module.glob(
            os.path.join(state["workspace_path"], pattern),
            recursive=True
        )
        for m in matches[:10]:
            findings.append({"path": m, "type": "file"})
    
    print(f"[Explore] 中等搜索发现 {len(findings)} 个文件")
    return {"findings": findings}


def thorough_search(state: ExploreState) -> dict:
    """彻底搜索：多位置深度搜索"""
    print("[Explore] 执行彻底搜索...")
    findings = []
    
    patterns = ["**/*.py", "**/*.json", "**/*.md", "**/*.txt", "**/*.yaml"]
    for pattern in patterns:
        matches = glob_module.glob(
            os.path.join(state["workspace_path"], pattern),
            recursive=True
        )
        for m in matches[:20]:
            findings.append({"path": m, "type": "file"})
    
    print(f"[Explore] 彻底搜索发现 {len(findings)} 个文件")
    return {"findings": findings}


def summarize(state: ExploreState) -> dict:
    """总结探索发现"""
    print("[Explore] 总结探索发现...")
    
    findings = state.get("findings", [])
    summary = f"发现 {len(findings)} 个相关文件"
    
    if findings:
        summary += "，包括："
        for f in findings[:3]:
            summary += f"\n  - {os.path.basename(f['path'])}"
    
    print(f"[Explore] {summary}")
    return {"summary": summary}


def route_by_thoroughness(state: ExploreState) -> str:
    """根据彻底性级别路由"""
    return state["thoroughness"]


def create_explore_subgraph():
    """创建 Explore 子图"""
    graph = StateGraph(ExploreState)
    
    graph.add_node("analyze", analyze_request)
    graph.add_node("quick", quick_search)
    graph.add_node("medium", medium_search)
    graph.add_node("thorough", thorough_search)
    graph.add_node("summarize", summarize)
    
    graph.set_entry_point("analyze")
    graph.add_conditional_edges(
        "analyze",
        route_by_thoroughness,
        {"quick": "quick", "medium": "medium", "thorough": "thorough"}
    )
    
    graph.add_edge("quick", "summarize")
    graph.add_edge("medium", "summarize")
    graph.add_edge("thorough", "summarize")
    graph.add_edge("summarize", END)
    
    return graph.compile()


def run_explore(request: str, workspace_path: str, thoroughness: str = "medium") -> dict:
    """
    运行 Explore 子图
    
    Args:
        request: 探索请求
        workspace_path: 工作区路径
        thoroughness: 彻底性级别 (quick/medium/thorough)
        
    Returns:
        探索结果
    """
    print("\n" + "="*60)
    print("[Subgraph] Explore 子图启动")
    print("="*60)
    
    initial_state: ExploreState = {
        "request": request,
        "workspace_path": workspace_path,
        "thoroughness": thoroughness,
        "findings": [],
        "summary": "",
    }
    
    graph = create_explore_subgraph()
    result = graph.invoke(initial_state)
    
    print("="*60)
    print("[Subgraph] Explore 子图完成")
    print("="*60)
    
    return result
