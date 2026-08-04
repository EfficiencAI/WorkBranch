from .base import BaseSubAgent
from .explore_agent import ExploreAgent
from .review_agent import ReviewAgent


SUBAGENTS = {
    "explore_agent": ExploreAgent,
    "review_agent": ReviewAgent,
}


def get_subagent(name: str, llm_service=None, token_callback=None) -> BaseSubAgent:
    """获取 SubAgent 实例"""
    if name not in SUBAGENTS:
        raise ValueError(f"未知的 SubAgent: {name}")
    return SUBAGENTS[name](llm_service, token_callback)


__all__ = [
    "BaseSubAgent",
    "ExploreAgent",
    "ReviewAgent",
    "SUBAGENTS",
    "get_subagent",
]
