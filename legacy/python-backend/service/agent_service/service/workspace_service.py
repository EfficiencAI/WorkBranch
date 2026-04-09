import os
import uuid
from typing import Optional, Dict, Set, List, Tuple
from pathlib import Path


class WorkspaceService:
    """工作区服务：管理工作区的创建、路径验证与权限控制"""

    def __init__(self, base_dir: str = None):
        self._base_dir = base_dir or "workspaces"
        self._workspaces: Dict[str, dict] = {}
        os.makedirs(self._base_dir, exist_ok=True)

    @property
    def base_dir(self) -> str:
        """返回工作区基础目录的绝对路径"""
        return os.path.abspath(self._base_dir)

    def register(
        self,
        workspace_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> str:
        """
        注册并创建工作区
        
        Args:
            workspace_id: 可选的工作区ID，不提供则自动生成
            session_id: 可选的会话ID，不提供则自动生成
            
        Returns:
            注册的工作区ID
        """
        if not workspace_id:
            workspace_id = str(uuid.uuid4())[:8]
        if not session_id:
            session_id = str(uuid.uuid4())[:8]

        if workspace_id in self._workspaces:
            existing = self._workspaces[workspace_id]
            if existing.get("session_id") == session_id:
                print(f"[Workspace] 工作区已存在: {workspace_id}")
                return workspace_id

        self._workspaces[workspace_id] = {
            "id": workspace_id,
            "session_id": session_id,
            "status": "active",
            "created_at": None
        }

        workspace_path = self.get_workspace_path(session_id, workspace_id)
        is_new = not os.path.exists(workspace_path)
        os.makedirs(workspace_path, exist_ok=True)
        
        if is_new:
            print(f"[Workspace] 工作区已创建: {workspace_id}")
        else:
            print(f"[Workspace] 工作区信息已载入: {workspace_id}")
        print(f"[Workspace] 会话ID: {session_id}")
        print(f"[Workspace] 路径: {workspace_path}")
        return workspace_id

    def get_workspace_path(self, session_id: str, workspace_id: str) -> str:
        """
        获取工作区的完整路径
        
        Args:
            session_id: 会话ID
            workspace_id: 工作区ID
            
        Returns:
            工作区的绝对路径
        """
        return os.path.join(self.base_dir, session_id, workspace_id)

    def get_workspace_info(self, workspace_id: str) -> Optional[dict]:
        """获取工作区信息"""
        return self._workspaces.get(workspace_id)

    def get_workspace_dir(self, workspace_id: str) -> Optional[str]:
        """
        获取工作区目录路径
        
        Args:
            workspace_id: 工作区ID
            
        Returns:
            工作区目录的绝对路径，不存在返回 None
        """
        info = self._workspaces.get(workspace_id)
        if not info:
            return None
        return self.get_workspace_path(info["session_id"], workspace_id)

    def exists(self, workspace_id: str) -> bool:
        """检查工作区是否已注册"""
        return workspace_id in self._workspaces

    def list_all(self) -> Set[str]:
        """列出所有工作区ID"""
        return set(self._workspaces.keys())

    def validate_path(self, workspace_id: str, target_path: str) -> tuple[bool, str]:
        """
        验证目标路径是否在工作区范围内
        
        Args:
            workspace_id: 工作区ID
            target_path: 目标文件/目录路径
            
        Returns:
            (是否合法, 规范化后的绝对路径或错误信息)
        """
        workspace_dir = self.get_workspace_dir(workspace_id)
        if not workspace_dir:
            return False, f"工作区不存在: {workspace_id}"

        try:
            abs_target = os.path.abspath(target_path)
            abs_workspace = os.path.abspath(workspace_dir)
            
            if not abs_target.startswith(abs_workspace + os.sep) and abs_target != abs_workspace:
                return False, f"路径越界: {target_path} 不在工作区 {workspace_dir} 范围内"
            
            return True, abs_target
        except Exception as e:
            return False, f"路径验证失败: {str(e)}"

    def is_path_allowed(self, workspace_id: str, target_path: str) -> bool:
        """
        快速检查路径是否被允许访问
        
        Args:
            workspace_id: 工作区ID
            target_path: 目标路径
            
        Returns:
            是否允许访问
        """
        allowed, _ = self.validate_path(workspace_id, target_path)
        return allowed

    def resolve_path(self, workspace_id: str, relative_path: str) -> tuple[bool, str]:
        """
        将相对路径解析为工作区内的绝对路径并验证
        
        Args:
            workspace_id: 工作区ID
            relative_path: 相对于工作区的路径
            
        Returns:
            (是否合法, 绝对路径或错误信息)
        """
        workspace_dir = self.get_workspace_dir(workspace_id)
        if not workspace_dir:
            return False, f"工作区不存在: {workspace_id}"

        if os.path.isabs(relative_path):
            return self.validate_path(workspace_id, relative_path)

        full_path = os.path.join(workspace_dir, relative_path)
        return self.validate_path(workspace_id, full_path)

    def delete_workspace(self, workspace_id: str) -> bool:
        """
        删除工作区（包括目录和注册信息）
        
        Args:
            workspace_id: 工作区ID
            
        Returns:
            是否删除成功
        """
        info = self._workspaces.get(workspace_id)
        if not info:
            return False

        workspace_path = self.get_workspace_path(info["session_id"], workspace_id)
        
        try:
            if os.path.exists(workspace_path):
                import shutil
                shutil.rmtree(workspace_path)
            
            del self._workspaces[workspace_id]
            print(f"[Workspace] 工作区已删除: {workspace_id}")
            return True
        except Exception as e:
            print(f"[Workspace] 删除工作区失败: {e}")
            return False

    def list_sessions(self) -> Dict[str, list]:
        """
        列出所有会话及其工作区
        
        Returns:
            {session_id: [workspace_id1, workspace_id2, ...]}
        """
        sessions: Dict[str, list] = {}
        for ws_id, info in self._workspaces.items():
            session_id = info.get("session_id", "unknown")
            if session_id not in sessions:
                sessions[session_id] = []
            sessions[session_id].append(ws_id)
        return sessions

    def _get_unique_filename(self, directory: str, filename: str) -> str:
        """
        获取唯一的文件名，如果文件已存在则自动重命名
        
        Args:
            directory: 目标目录
            filename: 原始文件名
            
        Returns:
            唯一的文件名
        """
        name, ext = os.path.splitext(filename)
        counter = 1
        new_filename = filename
        
        while os.path.exists(os.path.join(directory, new_filename)):
            new_filename = f"{name}_{counter}{ext}"
            counter += 1
        
        return new_filename

    async def save_uploaded_files(
        self,
        workspace_id: str,
        files: List,
        sub_dir: Optional[str] = None
    ) -> Tuple[bool, List[Dict], str]:
        """
        保存上传的文件到工作区
        
        Args:
            workspace_id: 工作区ID
            files: UploadFile 对象列表
            sub_dir: 可选的子目录路径
            
        Returns:
            (是否成功, 文件信息列表, 错误信息)
        """
        workspace_dir = self.get_workspace_dir(workspace_id)
        if not workspace_dir:
            return False, [], f"工作区不存在: {workspace_id}"

        target_dir = workspace_dir
        if sub_dir:
            valid, resolved_path = self.resolve_path(workspace_id, sub_dir)
            if not valid:
                return False, [], f"无效的子目录路径: {sub_dir}"
            target_dir = resolved_path
            os.makedirs(target_dir, exist_ok=True)

        saved_files = []
        try:
            for file in files:
                original_filename = file.filename
                unique_filename = self._get_unique_filename(target_dir, original_filename)
                file_path = os.path.join(target_dir, unique_filename)
                
                content = await file.read()
                with open(file_path, "wb") as f:
                    f.write(content)
                
                saved_files.append({
                    "original_filename": original_filename,
                    "saved_as": unique_filename,
                    "path": file_path,
                    "size": len(content)
                })
                await file.seek(0)
            
            return True, saved_files, ""
        except Exception as e:
            return False, saved_files, f"文件保存失败: {str(e)}"
