from typing import List, Optional
from dataclasses import dataclass

from singleton import get_database
from db.sqlite import Database


@dataclass
class Session:
    id: int
    user_id: int
    title: str
    created_at: str
    updated_at: str


@dataclass
class Node:
    id: int
    session_id: int
    parent_id: Optional[int]
    role: str
    content: str
    created_at: str


class ConversationDAO:
    """会话和节点数据访问对象。"""

    def __init__(self):
        self._db: Database = get_database()

    def create_session(self, user_id: int, title: str) -> int:
        """创建新会话，返回会话ID。"""
        sql = '''
            INSERT INTO sessions (user_id, title)
            VALUES (?, ?)
        '''
        return self._db.execute(sql, (user_id, title))

    def delete_session(self, session_id: int) -> None:
        """删除会话，数据库级联删除所有关联节点。"""
        sql = 'DELETE FROM sessions WHERE id = ?'
        self._db.execute(sql, (session_id,))

    def add_node(self, session_id: int, role: str, content: str, parent_id: Optional[int] = None) -> int:
        """添加对话节点，返回节点ID。"""
        sql = '''
            INSERT INTO nodes (session_id, parent_id, role, content)
            VALUES (?, ?, ?, ?)
        '''
        node_id = self._db.execute(sql, (session_id, parent_id, role, content))
        
        self._update_session_updated_at(session_id)
        
        return node_id

    def get_nodes_by_session(self, session_id: int) -> List[Node]:
        """获取会话的所有节点，返回扁平化列表。"""
        sql = '''
            SELECT id, session_id, parent_id, role, content, created_at
            FROM nodes
            WHERE session_id = ?
            ORDER BY created_at ASC
        '''
        rows = self._db.fetch_all(sql, (session_id,))
        return [Node(**dict(row)) for row in rows]

    def update_node_parent(self, node_id: int, new_parent_id: Optional[int]) -> None:
        """修改节点的父节点。"""
        sql = 'UPDATE nodes SET parent_id = ? WHERE id = ?'
        self._db.execute(sql, (new_parent_id, node_id))
        
        row = self._db.fetch_one('SELECT session_id FROM nodes WHERE id = ?', (node_id,))
        if row:
            self._update_session_updated_at(row['session_id'])

    def delete_node(self, node_id: int) -> None:
        """删除节点，级联删除子树。"""
        row = self._db.fetch_one('SELECT session_id FROM nodes WHERE id = ?', (node_id,))
        
        sql = 'DELETE FROM nodes WHERE id = ?'
        self._db.execute(sql, (node_id,))
        
        if row:
            self._update_session_updated_at(row['session_id'])

    def _update_session_updated_at(self, session_id: int) -> None:
        """更新会话的更新时间。"""
        sql = 'UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        self._db.execute(sql, (session_id,))

    def get_session_by_id(self, session_id: int) -> Optional[Session]:
        """根据ID获取会话。"""
        sql = '''
            SELECT id, user_id, title, created_at, updated_at
            FROM sessions
            WHERE id = ?
        '''
        row = self._db.fetch_one(sql, (session_id,))
        if row:
            return Session(**dict(row))
        return None
