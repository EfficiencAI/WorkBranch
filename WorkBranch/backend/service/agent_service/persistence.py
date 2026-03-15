import json
import os
from typing import Dict, Any, Optional
from datetime import datetime


class PersistenceService:
    """Agent 状态持久化服务"""
    
    def __init__(self, base_path: str = None):
        self.base_path = base_path or os.path.join(os.getcwd(), ".agent_states")
        os.makedirs(self.base_path, exist_ok=True)
    
    def _get_state_path(self, workspace_id: str) -> str:
        """获取状态文件路径"""
        return os.path.join(self.base_path, f"{workspace_id}.json")
    
    def save(self, workspace_id: str, state: Dict[str, Any]) -> bool:
        """
        保存 Agent 状态
        
        Args:
            workspace_id: 工作区ID
            state: Agent 状态
            
        Returns:
            是否保存成功
        """
        print(f"[Persistence] 保存状态: {workspace_id}")
        
        state_path = self._get_state_path(workspace_id)
        
        try:
            state_with_meta = {
                "workspace_id": workspace_id,
                "saved_at": datetime.now().isoformat(),
                "state": state
            }
            
            with open(state_path, "w", encoding="utf-8") as f:
                json.dump(state_with_meta, f, ensure_ascii=False, indent=2, default=str)
            
            print(f"[Persistence] 状态已保存到: {state_path}")
            return True
            
        except Exception as e:
            print(f"[Persistence] 保存失败: {e}")
            return False
    
    def load(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        """
        加载 Agent 状态
        
        Args:
            workspace_id: 工作区ID
            
        Returns:
            Agent 状态，不存在返回 None
        """
        print(f"[Persistence] 加载状态: {workspace_id}")
        
        state_path = self._get_state_path(workspace_id)
        
        if not os.path.exists(state_path):
            print(f"[Persistence] 状态文件不存在: {state_path}")
            return None
        
        try:
            with open(state_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            print(f"[Persistence] 状态已加载，保存时间: {data.get('saved_at')}")
            return data.get("state")
            
        except Exception as e:
            print(f"[Persistence] 加载失败: {e}")
            return None
    
    def delete(self, workspace_id: str) -> bool:
        """
        删除 Agent 状态
        
        Args:
            workspace_id: 工作区ID
            
        Returns:
            是否删除成功
        """
        print(f"[Persistence] 删除状态: {workspace_id}")
        
        state_path = self._get_state_path(workspace_id)
        
        if os.path.exists(state_path):
            os.remove(state_path)
            print(f"[Persistence] 状态已删除: {state_path}")
            return True
        
        return False
    
    def exists(self, workspace_id: str) -> bool:
        """检查状态是否存在"""
        return os.path.exists(self._get_state_path(workspace_id))
    
    def list_all(self) -> list:
        """列出所有保存的状态"""
        states = []
        for filename in os.listdir(self.base_path):
            if filename.endswith(".json"):
                workspace_id = filename[:-5]
                state_path = self._get_state_path(workspace_id)
                try:
                    with open(state_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    states.append({
                        "workspace_id": workspace_id,
                        "saved_at": data.get("saved_at")
                    })
                except:
                    pass
        return states
