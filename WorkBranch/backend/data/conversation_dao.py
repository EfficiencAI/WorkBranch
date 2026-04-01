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
class Conversation:
    id: str
    session_id: int
    workspace_id: Optional[str]
    parent_conversation_id: Optional[str]
    title: Optional[str]
    state: Optional[str]
    created_at: str
    updated_at: str
    ended_at: Optional[str]
    message_count: int
    error: Optional[str]
    position_x: Optional[float]
    position_y: Optional[float]


@dataclass
class Node:
    id: int
    session_id: int
    conversation_id: Optional[str]
    parent_id: Optional[int]
    role: str
    content: str
    created_at: str


class ConversationDAO:
    """会话、对话和节点数据访问对象。"""

    def __init__(self):
        self._db: Database = get_database()

    def create_session(self, user_id: int, title: str) -> int:
        sql = '''
            INSERT INTO sessions (user_id, title)
            VALUES (?, ?)
        '''
        return self._db.execute(sql, (user_id, title))

    def delete_session(self, session_id: int) -> None:
        sql = 'DELETE FROM sessions WHERE id = ?'
        self._db.execute(sql, (session_id,))

    def create_conversation(
        self,
        conversation_id: str,
        session_id: int,
        workspace_id: Optional[str],
        state: str,
        parent_conversation_id: Optional[str] = None,
        title: Optional[str] = None,
    ) -> None:
        sql = '''
            INSERT OR IGNORE INTO conversations (
                id, session_id, workspace_id, parent_conversation_id, title, state, message_count
            ) VALUES (?, ?, ?, ?, ?, ?, 0)
        '''
        self._db.execute(sql, (conversation_id, session_id, workspace_id, parent_conversation_id, title, state))

    def update_conversation(
        self,
        conversation_id: str,
        *,
        workspace_id: Optional[str] = None,
        parent_conversation_id: Optional[str] = None,
        title: Optional[str] = None,
        state: Optional[str] = None,
        message_count: Optional[int] = None,
        error: Optional[str] = None,
        ended_at: Optional[str] = None,
        position_x: Optional[float] = None,
        position_y: Optional[float] = None,
    ) -> None:
        updates = ['updated_at = CURRENT_TIMESTAMP']
        params = []

        if workspace_id is not None:
            updates.append('workspace_id = ?')
            params.append(workspace_id)
        if parent_conversation_id is not None:
            updates.append('parent_conversation_id = ?')
            params.append(parent_conversation_id)
        if title is not None:
            updates.append('title = ?')
            params.append(title)
        if state is not None:
            updates.append('state = ?')
            params.append(state)
        if message_count is not None:
            updates.append('message_count = ?')
            params.append(message_count)
        if error is not None:
            updates.append('error = ?')
            params.append(error)
        if ended_at is not None:
            updates.append('ended_at = ?')
            params.append(ended_at)
        if position_x is not None:
            updates.append('position_x = ?')
            params.append(position_x)
        if position_y is not None:
            updates.append('position_y = ?')
            params.append(position_y)

        params.append(conversation_id)
        sql = f"UPDATE conversations SET {', '.join(updates)} WHERE id = ?"
        self._db.execute(sql, tuple(params))

    def get_conversation_by_id(self, conversation_id: str) -> Optional[Conversation]:
        sql = '''
            SELECT id, session_id, workspace_id, parent_conversation_id, title, state, created_at, updated_at, ended_at, message_count, error, position_x, position_y
            FROM conversations
            WHERE id = ?
        '''
        row = self._db.fetch_one(sql, (conversation_id,))
        if row:
            return Conversation(**dict(row))
        return None

    def list_conversations_by_session(self, session_id: int) -> List[Conversation]:
        sql = '''
            SELECT id, session_id, workspace_id, parent_conversation_id, title, state, created_at, updated_at, ended_at, message_count, error, position_x, position_y
            FROM conversations
            WHERE session_id = ?
            ORDER BY created_at ASC, id ASC
        '''
        rows = self._db.fetch_all(sql, (session_id,))
        return [Conversation(**dict(row)) for row in rows]

    def update_conversation_positions(self, session_id: int, positions: List[dict]) -> None:
        conversation_ids = [item["conversation_id"] for item in positions]
        if not conversation_ids:
            return

        placeholders = ','.join('?' for _ in conversation_ids)
        rows = self._db.fetch_all(
            f'SELECT id FROM conversations WHERE session_id = ? AND id IN ({placeholders})',
            (session_id, *conversation_ids),
        )
        found_ids = {row['id'] for row in rows}
        missing_ids = [conversation_id for conversation_id in conversation_ids if conversation_id not in found_ids]
        if missing_ids:
            raise ValueError(f"Conversations do not belong to session {session_id}: {', '.join(missing_ids)}")

        with self._db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.executemany(
                '''
                    UPDATE conversations
                    SET position_x = ?, position_y = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND session_id = ?
                ''',
                [
                    (
                        item["x"],
                        item["y"],
                        item["conversation_id"],
                        session_id,
                    )
                    for item in positions
                ],
            )
            conn.commit()

        self._update_session_updated_at(session_id)

    def delete_conversation(self, conversation_id: str) -> None:
        row = self._db.fetch_one('SELECT session_id FROM conversations WHERE id = ?', (conversation_id,))
        self._db.execute('DELETE FROM conversations WHERE id = ?', (conversation_id,))

        if row:
            self._update_session_updated_at(row['session_id'])

    def add_node(
        self,
        session_id: int,
        conversation_id: str,
        role: str,
        content: str,
        parent_id: Optional[int] = None,
    ) -> int:
        sql = '''
            INSERT INTO nodes (session_id, conversation_id, parent_id, role, content)
            VALUES (?, ?, ?, ?, ?)
        '''
        node_id = self._db.execute(sql, (session_id, conversation_id, parent_id, role, content))
        self._update_session_updated_at(session_id)
        self._sync_conversation_message_count(conversation_id)
        return node_id

    def get_nodes_by_conversation(self, conversation_id: str) -> List[Node]:
        sql = '''
            SELECT id, session_id, conversation_id, parent_id, role, content, created_at
            FROM nodes
            WHERE conversation_id = ?
            ORDER BY created_at ASC, id ASC
        '''
        rows = self._db.fetch_all(sql, (conversation_id,))
        return [Node(**dict(row)) for row in rows]

    def get_nodes_by_session(self, session_id: int) -> List[Node]:
        sql = '''
            SELECT id, session_id, conversation_id, parent_id, role, content, created_at
            FROM nodes
            WHERE session_id = ?
            ORDER BY created_at ASC
        '''
        rows = self._db.fetch_all(sql, (session_id,))
        return [Node(**dict(row)) for row in rows]

    def update_node_parent(self, node_id: int, new_parent_id: Optional[int]) -> None:
        sql = 'UPDATE nodes SET parent_id = ? WHERE id = ?'
        self._db.execute(sql, (new_parent_id, node_id))

        row = self._db.fetch_one('SELECT session_id, conversation_id FROM nodes WHERE id = ?', (node_id,))
        if row:
            self._update_session_updated_at(row['session_id'])
            if row['conversation_id']:
                self._sync_conversation_message_count(row['conversation_id'])

    def delete_node(self, node_id: int) -> None:
        row = self._db.fetch_one('SELECT session_id, conversation_id FROM nodes WHERE id = ?', (node_id,))

        sql = 'DELETE FROM nodes WHERE id = ?'
        self._db.execute(sql, (node_id,))

        if row:
            self._update_session_updated_at(row['session_id'])
            if row['conversation_id']:
                self._sync_conversation_message_count(row['conversation_id'])

    def _sync_conversation_message_count(self, conversation_id: str) -> None:
        sql = '''
            UPDATE conversations
            SET message_count = (
                SELECT COUNT(*) FROM nodes WHERE conversation_id = ?
            ), updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        '''
        self._db.execute(sql, (conversation_id, conversation_id))

    def _update_session_updated_at(self, session_id: int) -> None:
        sql = 'UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        self._db.execute(sql, (session_id,))

    def get_session_by_id(self, session_id: int) -> Optional[Session]:
        sql = '''
            SELECT id, user_id, title, created_at, updated_at
            FROM sessions
            WHERE id = ?
        '''
        row = self._db.fetch_one(sql, (session_id,))
        if row:
            return Session(**dict(row))
        return None
