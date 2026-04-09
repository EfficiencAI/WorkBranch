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
                    parent_conversation_id TEXT,
                    title TEXT,
                    state TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ended_at TIMESTAMP,
                    message_count INTEGER DEFAULT 0,
                    error TEXT,
                    position_x REAL,
                    position_y REAL,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY(parent_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    session_id INTEGER NOT NULL,
                    user_content TEXT NOT NULL,
                    assistant_content TEXT,
                    thinking_content TEXT,  -- 新增thinking内容字段
                    status TEXT DEFAULT 'streaming',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            ''')

            if not self._column_exists(cursor, "conversations", "parent_conversation_id"):
                cursor.execute('ALTER TABLE conversations ADD COLUMN parent_conversation_id TEXT')

            if not self._column_exists(cursor, "conversations", "title"):
                cursor.execute('ALTER TABLE conversations ADD COLUMN title TEXT')

            if not self._column_exists(cursor, "conversations", "position_x"):
                cursor.execute('ALTER TABLE conversations ADD COLUMN position_x REAL')

            if not self._column_exists(cursor, "conversations", "position_y"):
                cursor.execute('ALTER TABLE conversations ADD COLUMN position_y REAL')

            if not self._column_exists(cursor, "messages", "thinking_content"):
                cursor.execute('ALTER TABLE messages ADD COLUMN thinking_content TEXT')

            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_conversations_parent_conversation_id ON conversations(parent_conversation_id)
            ''')

            self._drop_legacy_tables(cursor)
            conn.commit()

    def _column_exists(self, cursor: sqlite3.Cursor, table_name: str, column_name: str) -> bool:
        rows = cursor.execute(f"PRAGMA table_info({table_name})").fetchall()
        return any(row[1] == column_name for row in rows)

    def _drop_legacy_tables(self, cursor: sqlite3.Cursor) -> None:
        cursor.execute('DROP TABLE IF EXISTS nodes')

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
