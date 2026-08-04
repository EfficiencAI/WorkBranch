from dataclasses import dataclass
from typing import Dict, Any, Optional
from .registry import ToolDefinition, ToolRegistry


AGENT_TOOLS = {
    "spawn_agent": ToolDefinition(
        name="spawn_agent",
        description="启动一个子 Agent 执行特定任务。支持 explore(代码探索)、plan(规划)、review(代码审查) 等类型。",
        params="agent_type, task_description, tools, background",
        category="agent",
    ),
    "send_message_to_agent": ToolDefinition(
        name="send_message_to_agent",
        description="向正在运行的子 Agent 发送消息，继续或修正其任务。",
        params="agent_id, message",
        category="agent",
    ),
    "stop_agent": ToolDefinition(
        name="stop_agent",
        description="停止正在运行的子 Agent。",
        params="agent_id",
        category="agent",
    ),
    "list_agents": ToolDefinition(
        name="list_agents",
        description="列出当前正在运行的所有子 Agent。",
        params="",
        category="agent",
    ),
}


def register_agent_tools():
    """注册 Agent 工具"""
    registry = ToolRegistry()
    for tool_name, tool_def in AGENT_TOOLS.items():
        registry.register(tool_def)
