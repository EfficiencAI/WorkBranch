from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass


@dataclass
class ToolDefinition:
    """工具定义"""
    name: str
    description: str
    params: str
    category: str = "general"
    executor: Optional[Callable] = None


class ToolRegistry:
    """工具注册表"""
    
    _instance = None
    _tools: Dict[str, ToolDefinition] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @classmethod
    def register(cls, tool: ToolDefinition) -> None:
        """注册工具"""
        cls._tools[tool.name] = tool
    
    @classmethod
    def get(cls, name: str) -> Optional[ToolDefinition]:
        """获取工具定义"""
        return cls._tools.get(name)
    
    @classmethod
    def get_all(cls) -> Dict[str, ToolDefinition]:
        """获取所有工具"""
        return cls._tools.copy()
    
    @classmethod
    def get_by_category(cls, category: str) -> List[ToolDefinition]:
        """按类别获取工具"""
        return [t for t in cls._tools.values() if t.category == category]
    
    @classmethod
    def get_tool_prompt(cls, allowed_tools: List[str]) -> str:
        """生成工具提示词"""
        if not allowed_tools:
            return "当前没有可用工具。"
        
        lines = ["## 可用工具列表\n"]
        for name in allowed_tools:
            tool = cls._tools.get(name)
            if tool:
                lines.append(f"- **{tool.name}**: {tool.description}")
                if tool.params:
                    lines.append(f"  - 参数: {tool.params}")
        
        return "\n".join(lines)


ALL_TOOLS = {
    "read_file": {
        "name": "read_file",
        "description": "读取文件内容",
        "params": "file_path, start_line, end_line"
    },
    "write_file": {
        "name": "write_file",
        "description": "写入文件",
        "params": "file_path, content, mode(write/append)"
    },
    "delete_file": {
        "name": "delete_file",
        "description": "删除文件或目录",
        "params": "file_path"
    },
    "list_dir": {
        "name": "list_dir",
        "description": "列出目录内容",
        "params": "directory, recursive"
    },
    "create_dir": {
        "name": "create_dir",
        "description": "创建目录",
        "params": "directory"
    },
    "explore_code": {
        "name": "explore_code",
        "description": "探索代码库",
        "params": "query, search_type(file/code/structure), file_pattern, max_results"
    },
    "explore_internet": {
        "name": "explore_internet",
        "description": "搜索互联网获取信息",
        "params": "query, max_results"
    },
    "thinking": {
        "name": "thinking",
        "description": "思考工具（用于分析、设计等需要思考的任务）",
        "params": ""
    },
    "call_explore_agent": {
        "name": "call_explore_agent",
        "description": "调用探索子代理执行代码探索和互联网搜索任务",
        "params": "task_description"
    },
    "call_review_agent": {
        "name": "call_review_agent",
        "description": "调用审查子代理执行代码审查任务",
        "params": "task_description"
    },
    "todo_add": {
        "name": "todo_add",
        "description": "添加任务到TODO列表",
        "params": "description, priority(high/medium/low), tool, args"
    },
    "todo_update": {
        "name": "todo_update",
        "description": "更新TODO任务状态",
        "params": "task_id, status(pending/in_progress/completed/failed), result"
    },
    "todo_delete": {
        "name": "todo_delete",
        "description": "删除TODO任务",
        "params": "task_id"
    },
    "todo_list": {
        "name": "todo_list",
        "description": "列出TODO任务",
        "params": "status(pending/in_progress/completed/all)"
    },
    "todo_clear": {
        "name": "todo_clear",
        "description": "清除TODO任务",
        "params": "completed_only(true/false)"
    }
}


FILE_TOOLS = {"read_file", "write_file", "delete_file", "list_dir", "create_dir"}
EXPLORE_TOOLS = {"explore_code", "explore_internet"}
SUBAGENT_TOOLS = {"call_explore_agent", "call_review_agent"}
TODO_TOOLS = {"todo_add", "todo_update", "todo_delete", "todo_list", "todo_clear"}
