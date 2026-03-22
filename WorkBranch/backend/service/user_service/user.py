from singleton import get_user_info_dao
from data.user_info_dao import UserInfoDAO, User


class UserService:
    """用户服务层：管理唯一本地用户的信息。"""

    def __init__(self):
        self._dao: UserInfoDAO = get_user_info_dao()

    def get_current_user(self) -> User:
        """
        获取当前本地用户（唯一用户）。
        如果用户不存在会自动创建。
        """
        return self._dao.get_or_create_default_user()

    def update_user_name(self, new_name: str) -> User:
        """
        更新当前用户的名称。
        返回更新后的用户信息。
        """
        user = self.get_current_user()
        self._dao.update_user_name(user.id, new_name)
        return self._dao.get_user_by_id(user.id)
