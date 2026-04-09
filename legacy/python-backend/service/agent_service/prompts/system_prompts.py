"""系统提示管理"""
from .agent_prompts import (
    GENERAL_PURPOSE_PROMPT,
    EXPLORE_AGENT_PROMPT,
    PLAN_AGENT_PROMPT,
    REVIEW_AGENT_PROMPT
)


AGENT_PROMPTS = {
    "general-purpose": GENERAL_PURPOSE_PROMPT,
    "explore": EXPLORE_AGENT_PROMPT,
    "plan": PLAN_AGENT_PROMPT,
    "review": REVIEW_AGENT_PROMPT
}


def get_agent_prompt(agent_type: str) -> str:
    """获取 Agent 提示词"""
    return AGENT_PROMPTS.get(agent_type, GENERAL_PURPOSE_PROMPT)


def enhance_prompt_with_context(prompt: str, context: dict) -> str:
    """增强提示词上下文"""
    # 添加环境信息
    if context.get("cwd"):
        prompt += f"\n\n当前工作目录: {context['cwd']}"
    
    if context.get("project_structure"):
        prompt += f"\n\n项目结构:\n{context['project_structure']}"
    
    return prompt
