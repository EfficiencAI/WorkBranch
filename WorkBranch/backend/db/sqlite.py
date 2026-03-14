import os
import sqlite3
from typing import Any, List, Tuple, Optional
from contextlib import contextmanager

from singleton import get_settings_service
from data.file_storage_system import FileStorageSystem


class Database:
    """SQLite 数据库封装类，提供连接管理和基础操作方法。"""

    def __init__(self):
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
                CREATE TABLE IF NOT EXISTS nodes (
                    id INTEGER PRIMARY KEY,
                    session_id INTEGER NOT NULL,
                    parent_id INTEGER,
                    role TEXT,
                    content TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY(parent_id) REFERENCES nodes(id) ON DELETE CASCADE
                )
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_nodes_session_id ON nodes(session_id)
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id)
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
            ''')
            
            conn.commit()

    @contextmanager
    def get_connection(self):
        """获取数据库连接的上下文管理器。"""
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
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
