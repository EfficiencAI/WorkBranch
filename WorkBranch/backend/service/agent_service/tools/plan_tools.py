from dataclasses import dataclass
from typing import Dict, Any, Optional
from .registry import ToolDefinition, ToolRegistry


@dataclass
class PlanModeConfig:
    """Plan 模式配置"""
    max_steps: int = 5
    require_approval: bool = True
    auto_execute: bool = False


PLAN_TOOLS = {
    "enter_plan_mode": ToolDefinition(
        name="enter_plan_mode",
        description="进入规划模式，用于复杂任务的多步骤规划。当任务需要多个步骤、涉及多个文件修改、或需要仔细设计时使用。",
        params="task_description, max_steps, require_approval",
        category="mode",
    ),
    "exit_plan_mode": ToolDefinition(
        name="exit_plan_mode", 
        description="退出规划模式，返回正常执行模式。",
        params="",
        category="mode",
    ),
    "update_plan": ToolDefinition(
        name="update_plan",
        description="更新当前规划，添加、修改或删除任务。",
        params="tasks",
        category="plan",
    ),
    "execute_plan": ToolDefinition(
        name="execute_plan",
        description="执行当前规划的所有任务。",
        params="",
        category="plan",
    ),
}


def register_plan_tools():
    """注册规划工具"""
    registry = ToolRegistry()
    for tool_name, tool_def in PLAN_TOOLS.items():
        registry.register(tool_def)
