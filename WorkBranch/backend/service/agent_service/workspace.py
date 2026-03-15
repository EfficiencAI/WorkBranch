import uuid
from typing import Optional, Dict, Set


class WorkspaceService:
    """工作区服务：管理工作区的注册与状态"""

    def __init__(self):
        self._workspaces: Dict[str, dict] = {}

    def register(self, workspace_id: Optional[str] = None) -> str:
        """
        注册工作区
        
        Args:
            workspace_id: 可选的工作区ID，不提供则自动生成
            
        Returns:
            注册的工作区ID
        """
        if not workspace_id:
            workspace_id = str(uuid.uuid4())

        if workspace_id in self._workspaces:
            print(f"[Workspace] 工作区已存在: {workspace_id}")
            return workspace_id

        self._workspaces[workspace_id] = {
            "id": workspace_id,
            "status": "active",
            "created_at": None
        }
        print(f"[Workspace] 工作区已注册: {workspace_id}")
        return workspace_id

    def get(self, workspace_id: str) -> Optional[dict]:
        """获取工作区信息"""
        return self._workspaces.get(workspace_id)

    def exists(self, workspace_id: str) -> bool:
        """检查工作区是否存在"""
        return workspace_id in self._workspaces

    def list_all(self) -> Set[str]:
        """列出所有工作区ID"""
        return set(self._workspaces.keys())
