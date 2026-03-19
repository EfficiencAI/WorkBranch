from typing import TypedDict, List, Any
from langgraph.graph import StateGraph, END
import json

from ...state import CompactionState


def estimate_token_count(messages: List[Any]) -> int:
    """估算消息 token 数量"""
    total = 0
    for msg in messages:
        if isinstance(msg, str):
            total += len(msg) // 4
        elif isinstance(msg, dict):
            total += len(json.dumps(msg)) // 4
        else:
            total += len(str(msg)) // 4
    return total


def compress_messages(messages: List[Any], keep_recent: int = 2) -> tuple:
    """
    压缩消息列表
    
    Args:
        messages: 原始消息列表
        keep_recent: 保留最近几条消息
        
    Returns:
        (压缩后的消息, 压缩摘要)
    """
    if len(messages) <= keep_recent + 1:
        return messages, ""
    
    old_messages = messages[:-keep_recent]
    recent_messages = messages[-keep_recent:]
    
    summary_parts = []
    for i, msg in enumerate(old_messages):
        if isinstance(msg, str):
            summary_parts.append(f"[{i+1}] {msg[:100]}...")
        elif isinstance(msg, dict):
            summary_parts.append(f"[{i+1}] {msg.get('content', str(msg))[:100]}...")
        else:
            summary_parts.append(f"[{i+1}] {str(msg)[:100]}...")
    
    summary = f"历史消息摘要 ({len(old_messages)} 条):\n" + "\n".join(summary_parts)
    
    compressed = [{"role": "system", "content": summary}] + recent_messages
    
    return compressed, summary


def check_compaction(state: CompactionState) -> dict:
    """检查是否需要压缩"""
    print("\n" + "-"*40)
    print("[Compaction] 检查消息长度...")
    
    messages = state["messages"]
    max_messages = state.get("max_messages", 10)
    
    token_count = estimate_token_count(messages)
    message_count = len(messages)
    
    print(f"[Compaction] 消息数: {message_count}, 估算Token: {token_count}")
    
    if message_count > max_messages:
        print(f"[Compaction] 超过限制 ({max_messages})，需要压缩")
        return {"compressed": False}
    
    print("[Compaction] 无需压缩")
    return {"compressed": True}


def route_by_compaction(state: CompactionState) -> str:
    """根据压缩需求路由"""
    return "skip" if state["compressed"] else "compress"


def do_compaction(state: CompactionState) -> dict:
    """执行压缩"""
    print("[Compaction] 执行消息压缩...")
    
    messages = state["messages"]
    max_messages = state.get("max_messages", 10)
    keep_recent = max_messages // 2
    
    compressed_messages, summary = compress_messages(messages, keep_recent)
    
    print(f"[Compaction] 压缩前: {len(messages)} 条")
    print(f"[Compaction] 压缩后: {len(compressed_messages)} 条")
    print(f"[Compaction] 摘要长度: {len(summary)} 字符")
    
    return {
        "messages": compressed_messages,
        "compressed": True,
        "summary": summary
    }


def skip_compaction(state: CompactionState) -> dict:
    """跳过压缩"""
    return {"compressed": True}


def create_compaction_subgraph():
    """创建 Compaction 子图"""
    graph = StateGraph(CompactionState)
    
    graph.add_node("check", check_compaction)
    graph.add_node("compress", do_compaction)
    graph.add_node("skip", skip_compaction)
    
    graph.set_entry_point("check")
    
    graph.add_conditional_edges(
        "check",
        route_by_compaction,
        {"compress": "compress", "skip": "skip"}
    )
    
    graph.add_edge("compress", END)
    graph.add_edge("skip", END)
    
    return graph.compile()


def run_compaction(messages: List[Any], max_messages: int = 10) -> dict:
    """
    运行 Compaction 子图
    
    Args:
        messages: 消息列表
        max_messages: 最大消息数量
        
    Returns:
        压缩结果
    """
    print("\n" + "="*60)
    print("[Subgraph] Compaction 子图启动")
    print("="*60)
    
    initial_state: CompactionState = {
        "messages": messages,
        "max_messages": max_messages,
        "compressed": False,
        "summary": "",
    }
    
    graph = create_compaction_subgraph()
    result = graph.invoke(initial_state)
    
    print("="*60)
    print("[Subgraph] Compaction 子图完成")
    print("="*60)
    
    return result
