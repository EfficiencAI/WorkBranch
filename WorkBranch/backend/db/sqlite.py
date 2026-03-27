import os
import sqlite3
from typing import Any, List, Tuple, Optional
from contextlib import contextmanager

from data.file_storage_system import FileStorageSystem


class Database:
    """SQLite 数据库封装类，提供连接管理和基础操作方法。"""

    def __init__(self):
        from singleton import get_settings_service
        self._settings_service = get_settings_service()
        self._file_storage = FileStorageSystem()
        self._db_path = self._get_db_path()
        self._init_database()

    def _get_db_path(self) -> str:
        """获取数据库文件的完整路径。"""
        db_path_setting = self._settings_service.get("database:path")
        storage_root = self._file_storage.get_storage_root()
        return os.path.join(storage_root, db_path_setting)

    def _init_database(self):
        """初始化数据库，创建所需的表。"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    name TEXT
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    title TEXT,
                    active_conversation_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    session_id INTEGER NOT NULL,
                    workspace_id TEXT,
                    state TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ended_at TIMESTAMP,
                    message_count INTEGER DEFAULT 0,
                    error TEXT,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS nodes (
                    id INTEGER PRIMARY KEY,
                    session_id INTEGER NOT NULL,
                    conversation_id TEXT,
                    parent_id INTEGER,
                    role TEXT,
                    content TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY(parent_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')

            if not self._column_exists(cursor, "sessions", "active_conversation_id"):
                cursor.execute('ALTER TABLE sessions ADD COLUMN active_conversation_id TEXT')

            if not self._column_exists(cursor, "nodes", "conversation_id"):
                cursor.execute('ALTER TABLE nodes ADD COLUMN conversation_id TEXT')

            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_nodes_session_id ON nodes(session_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_nodes_conversation_id ON nodes(conversation_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)
            ''')

            self._backfill_legacy_conversations(cursor)
            conn.commit()

    def _column_exists(self, cursor: sqlite3.Cursor, table_name: str, column_name: str) -> bool:
        rows = cursor.execute(f"PRAGMA table_info({table_name})").fetchall()
        return any(row[1] == column_name for row in rows)

    def _backfill_legacy_conversations(self, cursor: sqlite3.Cursor) -> None:
        rows = cursor.execute('''
            SELECT s.id, s.created_at, s.updated_at, COUNT(n.id) AS node_count
            FROM sessions s
            JOIN nodes n ON n.session_id = s.id
            GROUP BY s.id, s.created_at, s.updated_at
        ''').fetchall()

        for row in rows:
            session_id = row[0]
            created_at = row[1]
            updated_at = row[2]
            node_count = row[3]

            conversation_row = cursor.execute(
                'SELECT id FROM conversations WHERE session_id = ? ORDER BY created_at ASC LIMIT 1',
                (session_id,)
            ).fetchone()

            if conversation_row:
                conversation_id = conversation_row[0]
            else:
                conversation_id = f"legacy-session-{session_id}"
                cursor.execute('''
                    INSERT OR IGNORE INTO conversations (
                        id, session_id, workspace_id, state, created_at, updated_at, ended_at, message_count, error
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    conversation_id,
                    session_id,
                    None,
                    'completed',
                    created_at,
                    updated_at,
                    updated_at,
                    node_count,
                    None,
                ))

            cursor.execute(
                'UPDATE nodes SET conversation_id = ? WHERE session_id = ? AND (conversation_id IS NULL OR conversation_id = "")',
                (conversation_id, session_id)
            )
            cursor.execute(
                'UPDATE conversations SET message_count = (SELECT COUNT(*) FROM nodes WHERE conversation_id = ?), updated_at = COALESCE(updated_at, ?) WHERE id = ?',
                (conversation_id, updated_at, conversation_id)
            )

    @contextmanager
    def get_connection(self):
        """获取数据库连接的上下文管理器。"""
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys = ON')
        try:
            yield conn
        finally:
            conn.close()

    def execute(self, sql: str, params: Optional[Tuple] = None) -> int:
        """执行 SQL 语句（INSERT, UPDATE, DELETE），返回最后插入的 ID 或受影响的行数。"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            conn.commit()
            return cursor.lastrowid

    def fetch_all(self, sql: str, params: Optional[Tuple] = None) -> List[sqlite3.Row]:
        """执行查询并返回所有结果。"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            return cursor.fetchall()

    def fetch_one(self, sql: str, params: Optional[Tuple] = None) -> Optional[sqlite3.Row]:
        """执行查询并返回单个结果。"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            return cursor.fetchone()
