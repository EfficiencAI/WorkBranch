"""
TODO 工具 - 任务列表管理
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import json
import os


class TodoTask(BaseModel):
    """任务项"""
    id: int = Field(description="任务ID")
    description: str = Field(description="任务描述")
    status: str = Field(default="pending", description="任务状态: pending, in_progress, completed, failed")
    priority: str = Field(default="medium", description="任务优先级: high, medium, low")
    tool: Optional[str] = Field(default=None, description="要使用的工具名称")
    args: Optional[dict] = Field(default=None, description="工具参数")
    result: Optional[str] = Field(default=None, description="执行结果")


class TodoList:
    """任务列表管理器"""
    
    def __init__(self, workspace_id: str, base_dir: str = "workspaces"):
        self.workspace_id = workspace_id
        self.base_dir = base_dir
        self.todo_file = os.path.join(base_dir, workspace_id, "todo.json")
        self.tasks: List[TodoTask] = []
        self._load()
    
    def _load(self):
        """加载任务列表"""
        if os.path.exists(self.todo_file):
            try:
                with open(self.todo_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.tasks = [TodoTask(**task) for task in data.get("tasks", [])]
            except Exception as e:
                print(f"[Todo] 加载任务列表失败: {e}")
                self.tasks = []
    
    def _save(self):
        """保存任务列表"""
        os.makedirs(os.path.dirname(self.todo_file), exist_ok=True)
        try:
            with open(self.todo_file, 'w', encoding='utf-8') as f:
                data = {
                    "tasks": [task.model_dump() for task in self.tasks]
                }
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Todo] 保存任务列表失败: {e}")
    
    def add_task(self, description: str, priority: str = "medium", tool: str = None, args: dict = None) -> TodoTask:
        """添加任务"""
        task_id = max([t.id for t in self.tasks], default=0) + 1
        task = TodoTask(
            id=task_id,
            description=description,
            status="pending",
            priority=priority,
            tool=tool,
            args=args
        )
        self.tasks.append(task)
        self._save()
        return task
    
    def update_task(self, task_id: int, status: str = None, result: str = None) -> Optional[TodoTask]:
        """更新任务"""
        for task in self.tasks:
            if task.id == task_id:
                if status:
                    task.status = status
                if result:
                    task.result = result
                self._save()
                return task
        return None
    
    def delete_task(self, task_id: int) -> bool:
        """删除任务"""
        for i, task in enumerate(self.tasks):
            if task.id == task_id:
                self.tasks.pop(i)
                self._save()
                return True
        return False
    
    def get_task(self, task_id: int) -> Optional[TodoTask]:
        """获取任务"""
        for task in self.tasks:
            if task.id == task_id:
                return task
        return None
    
    def get_all_tasks(self) -> List[TodoTask]:
        """获取所有任务"""
        return self.tasks
    
    def get_pending_tasks(self) -> List[TodoTask]:
        """获取待执行任务"""
        return [t for t in self.tasks if t.status == "pending"]
    
    def get_in_progress_tasks(self) -> List[TodoTask]:
        """获取执行中任务"""
        return [t for t in self.tasks if t.status == "in_progress"]
    
    def get_completed_tasks(self) -> List[TodoTask]:
        """获取已完成任务"""
        return [t for t in self.tasks if t.status == "completed"]
    
    def clear_completed(self):
        """清除已完成任务"""
        self.tasks = [t for t in self.tasks if t.status != "completed"]
        self._save()
    
    def clear_all(self):
        """清除所有任务"""
        self.tasks = []
        self._save()


def todo_add(workspace_id: str, description: str, priority: str = "medium", tool: str = None, args: dict = None) -> dict:
    """
    添加任务到TODO列表
    
    Args:
        workspace_id: 工作区ID
        description: 任务描述
        priority: 任务优先级 (high, medium, low)
        tool: 要使用的工具名称
        args: 工具参数
    
    Returns:
        添加的任务信息
    """
    todo = TodoList(workspace_id)
    task = todo.add_task(description, priority, tool, args)
    return {
        "success": True,
        "task": task.model_dump(),
        "message": f"已添加任务 #{task.id}: {description}"
    }


def todo_update(workspace_id: str, task_id: int, status: str = None, result: str = None) -> dict:
    """
    更新TODO任务状态
    
    Args:
        workspace_id: 工作区ID
        task_id: 任务ID
        status: 任务状态 (pending, in_progress, completed, failed)
        result: 执行结果
    
    Returns:
        更新结果
    """
    todo = TodoList(workspace_id)
    task = todo.update_task(task_id, status, result)
    if task:
        return {
            "success": True,
            "task": task.model_dump(),
            "message": f"已更新任务 #{task_id}"
        }
    else:
        return {
            "success": False,
            "message": f"未找到任务 #{task_id}"
        }


def todo_delete(workspace_id: str, task_id: int) -> dict:
    """
    删除TODO任务
    
    Args:
        workspace_id: 工作区ID
        task_id: 任务ID
    
    Returns:
        删除结果
    """
    todo = TodoList(workspace_id)
    success = todo.delete_task(task_id)
    if success:
        return {
            "success": True,
            "message": f"已删除任务 #{task_id}"
        }
    else:
        return {
            "success": False,
            "message": f"未找到任务 #{task_id}"
        }


def todo_list(workspace_id: str, status: str = None) -> dict:
    """
    列出TODO任务
    
    Args:
        workspace_id: 工作区ID
        status: 任务状态过滤 (可选)
    
    Returns:
        任务列表
    """
    todo = TodoList(workspace_id)
    if status:
        if status == "pending":
            tasks = todo.get_pending_tasks()
        elif status == "in_progress":
            tasks = todo.get_in_progress_tasks()
        elif status == "completed":
            tasks = todo.get_completed_tasks()
        else:
            tasks = todo.get_all_tasks()
    else:
        tasks = todo.get_all_tasks()
    
    return {
        "success": True,
        "tasks": [t.model_dump() for t in tasks],
        "count": len(tasks),
        "message": f"共 {len(tasks)} 个任务"
    }


def todo_clear(workspace_id: str, completed_only: bool = True) -> dict:
    """
    清除TODO任务
    
    Args:
        workspace_id: 工作区ID
        completed_only: 是否只清除已完成任务
    
    Returns:
        清除结果
    """
    todo = TodoList(workspace_id)
    if completed_only:
        todo.clear_completed()
        return {
            "success": True,
            "message": "已清除所有已完成任务"
        }
    else:
        todo.clear_all()
        return {
            "success": True,
            "message": "已清除所有任务"
        }


TOOL_DEFINITIONS = [
    {
        "name": "todo_add",
        "description": "添加任务到TODO列表",
        "parameters": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "任务描述"
                },
                "priority": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "任务优先级，默认为medium"
                },
                "tool": {
                    "type": "string",
                    "description": "要使用的工具名称（可选）"
                },
                "args": {
                    "type": "object",
                    "description": "工具参数（可选）"
                }
            },
            "required": ["description"]
        }
    },
    {
        "name": "todo_update",
        "description": "更新TODO任务状态",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "任务ID"
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "failed"],
                    "description": "任务状态"
                },
                "result": {
                    "type": "string",
                    "description": "执行结果（可选）"
                }
            },
            "required": ["task_id"]
        }
    },
    {
        "name": "todo_delete",
        "description": "删除TODO任务",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "任务ID"
                }
            },
            "required": ["task_id"]
        }
    },
    {
        "name": "todo_list",
        "description": "列出TODO任务",
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "all"],
                    "description": "任务状态过滤（可选，默认为all）"
                }
            }
        }
    },
    {
        "name": "todo_clear",
        "description": "清除TODO任务",
        "parameters": {
            "type": "object",
            "properties": {
                "completed_only": {
                    "type": "boolean",
                    "description": "是否只清除已完成任务，默认为true"
                }
            }
        }
    }
]
