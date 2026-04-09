import os
import json

# 以本文件为基准向上三级，定位到 WorkBranch 根目录（setting.json 所在处）
_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SETTING_FILE_PATH = os.path.join(_BASE_DIR, "setting.json")


class FileStorageSystem:
    """文件存储层：负责存储目录管理与 JSON 配置文件的原始读写。"""

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
            self.write_settings(default_content)
            return True
        return False

    def read_settings(self) -> dict:
        """从文件读取并返回全部设置数据。"""
        with open(SETTING_FILE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def write_settings(self, data: dict) -> None:
        """将设置数据写入文件（覆盖）。"""
        with open(SETTING_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
