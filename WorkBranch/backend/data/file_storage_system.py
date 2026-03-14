import os
import json

# 以本文件为基准向上三级，定位到 WorkBranch 根目录（setting.json 所在处）
_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SETTING_FILE_PATH = os.path.join(_BASE_DIR, "setting.json")


class FileStorageSystem:
    """管理文件存储目录，负责确保必要的目录与文件存在。"""

    def __init__(self):
        os.makedirs(_BASE_DIR, exist_ok=True)

    def get_storage_root(self) -> str:
        """返回存储根目录的绝对路径。"""
        return _BASE_DIR

    def get_setting_file_path(self) -> str:
        """返回设置文件的绝对路径。"""
        return SETTING_FILE_PATH

    def ensure_setting_file(self, default_content: dict) -> bool:
        """若设置文件不存在，则创建并写入默认内容。
        
        Returns:
            True  — 文件不存在，已新建并写入默认值。
            False — 文件已存在，未做改动。
        """
        if not os.path.exists(SETTING_FILE_PATH):
            with open(SETTING_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(default_content, f, indent=4, ensure_ascii=False)
            return True
        return False
