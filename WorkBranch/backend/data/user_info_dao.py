from typing import List, Optional
from dataclasses import dataclass

from singleton import get_database
from db.sqlite import Database
from data.conversation_dao import Session


@dataclass
class User:
    id: int
    name: str


class UserInfoDAO:
    """用户信息数据访问对象。"""

    def __init__(self):
        self._db: Database = get_database()

    def create_user(self, name: str) -> int:
        """创建新用户，返回用户ID。"""
        sql = 'INSERT INTO users (name) VALUES (?)'
        return self._db.execute(sql, (name,))

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """根据ID获取用户。"""
        sql = 'SELECT id, name FROM users WHERE id = ?'
        row = self._db.fetch_one(sql, (user_id,))
        if row:
            return User(**dict(row))
        return None

    def list_sessions(self, user_id: int) -> List[Session]:
        """获取用户的所有会话，按更新时间倒序排列。"""
        sql = '''
            SELECT id, user_id, title, created_at, updated_at
            FROM sessions
            WHERE user_id = ?
            ORDER BY updated_at DESC
        '''
        rows = self._db.fetch_all(sql, (user_id,))
        return [Session(**dict(row)) for row in rows]

    def delete_user(self, user_id: int) -> None:
        """删除用户。"""
        sql = 'DELETE FROM users WHERE id = ?'
        self._db.execute(sql, (user_id,))

    def update_user_name(self, user_id: int, new_name: str) -> None:
        """更新用户名称。"""
        sql = 'UPDATE users SET name = ? WHERE id = ?'
        self._db.execute(sql, (new_name, user_id))

    def get_or_create_default_user(self) -> User:
        """获取或创建默认本地用户（唯一用户）。"""
        sql = 'SELECT id, name FROM users LIMIT 1'
        row = self._db.fetch_one(sql)
        if row:
            return User(**dict(row))
        user_id = self.create_user("Local User")
        return User(id=user_id, name="Local User")
