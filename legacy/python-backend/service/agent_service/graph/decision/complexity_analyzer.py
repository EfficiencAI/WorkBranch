from enum import Enum
from typing import Dict, List, Optional


class ExecutionMode(str, Enum):
    """执行模式"""
    DIRECT = "direct"          # 直接执行
    PLAN = "plan"              # 规划模式
    SUBAGENT = "subagent"      # 子 Agent 模式


def analyze_task_complexity(user_message: str, intent_analysis: dict) -> dict:
    """
    分析任务复杂度，决定执行模式
    
    Returns:
        {
            "mode": ExecutionMode,
            "reason": str,
            "suggested_tools": List[str],
            "suggested_agent": Optional[str]
        }
    """
    complexity = intent_analysis.get("complexity", "medium")
    intent_type = intent_analysis.get("intent_type", "other")
    suggested_tools = intent_analysis.get("suggested_tools", [])
    
    # 简单任务：直接执行
    if complexity == "simple":
        return {
            "mode": ExecutionMode.DIRECT,
            "reason": "简单任务，直接执行",
            "suggested_tools": suggested_tools,
            "suggested_agent": None
        }
    
    # 探索类任务：委托 Explore Agent
    if intent_type == "explore":
        return {
            "mode": ExecutionMode.SUBAGENT,
            "reason": "探索任务，委托给 Explore Agent",
            "suggested_tools": [],
            "suggested_agent": "explore"
        }
    
    # 审查类任务：委托 Review Agent
    if intent_type == "review":
        return {
            "mode": ExecutionMode.SUBAGENT,
            "reason": "审查任务，委托给 Review Agent",
            "suggested_tools": [],
            "suggested_agent": "review"
        }
    
    # 复杂开发任务：进入规划模式
    if complexity == "complex" and intent_type in ["develop", "refactor", "debug"]:
        return {
            "mode": ExecutionMode.PLAN,
            "reason": "复杂开发任务，建议进入规划模式",
            "suggested_tools": ["enter_plan_mode"],
            "suggested_agent": None
        }
    
    # 中等复杂度：让 Agent 自主决策
    return {
        "mode": ExecutionMode.DIRECT,
        "reason": "中等复杂度，Agent 自主决策是否需要规划",
        "suggested_tools": suggested_tools,
        "suggested_agent": None
    }


def evaluate_task_complexity(user_message: str) -> str:
    """
    评估任务复杂度
    
    Returns:
        simple, medium, complex
    """
    # 基于消息长度和内容评估复杂度
    message_length = len(user_message)
    
    # 简单任务特征
    simple_keywords = [
        "读取", "查看", "检查", "查询", "获取", "显示", "列出",
        "read", "view", "check", "query", "get", "show", "list"
    ]
    
    # 复杂任务特征
    complex_keywords = [
        "实现", "开发", "创建", "修改", "重构", "优化", "修复",
        "implement", "develop", "create", "modify", "refactor", "optimize", "fix"
    ]
    
    # 检查简单任务关键词
    for keyword in simple_keywords:
        if keyword in user_message.lower():
            return "simple"
    
    # 检查复杂任务关键词
    for keyword in complex_keywords:
        if keyword in user_message.lower():
            return "complex"
    
    # 基于长度判断
    if message_length < 50:
        return "simple"
    elif message_length > 200:
        return "complex"
    else:
        return "medium"
