from typing import List, Optional

from data.user_info_dao import User
from data.conversation_dao import Session


class UserService:
    """用户业务服务层。"""

    def __init__(self):
        # 延迟导入以避免与 singleton 的循环引用
        from singleton import get_user_info_dao
        self._dao = get_user_info_dao()

    def create_user(self, name: str) -> int:
        """创建新用户，返回用户ID。"""
        return self._dao.create_user(name)

    def get_user(self, user_id: int) -> Optional[User]:
        """根据ID获取用户，不存在则返回 None。"""
        return self._dao.get_user_by_id(user_id)

    def rename_user(self, user_id: int, new_name: str) -> None:
        """重命名用户。"""
        self._dao.update_user_name(user_id, new_name)

    def delete_user(self, user_id: int) -> None:
        """删除用户及其所有关联数据。"""
        self._dao.delete_user(user_id)

    def list_sessions(self, user_id: int) -> List[Session]:
        """获取用户的所有会话，按更新时间倒序排列。"""
        return self._dao.list_sessions(user_id)
