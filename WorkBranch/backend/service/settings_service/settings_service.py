from data.file_storage_system import FileStorageSystem


DEFAULT_SETTINGS = {
    "database": {
        "path": "workbranch.db"
    },
    "llm": {
        "api_key": "",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "max_tokens": 4096
    }
}


class SettingsService:
    """设置服务层：解析配置文件并对外提供读取与修改接口。"""

    def __init__(self):
        self._fs = FileStorageSystem()
        self._fs.ensure_setting_file(DEFAULT_SETTINGS)
        self._reload()

    # ── 私有工具 ────────────────────────────────────────────────────────────────

    def _reload(self):
        self._data: dict = self._fs.read_settings()

    def _persist(self):
        self._fs.write_settings(self._data)

    # ── 读取设置 ────────────────────────────────────────────────────────────────

    def get(self, key: str) -> str:
        """读取设置项，支持用 ':' 访问嵌套层级。

        Examples:
            get("apikey")           -> "your_api_key_here"
            get("groupA:settingA")  -> "valueA"

        Raises:
            KeyError: 键路径不存在时抛出。
        """
        parts = key.split(":")
        node = self._data
        for part in parts:
            if not isinstance(node, dict) or part not in node:
                raise KeyError(f"Setting key not found: '{key}'")
            node = node[part]
        return node

    def get_all(self) -> dict:
        """返回所有设置项的副本。"""
        return dict(self._data)

    # ── 修改设置 ────────────────────────────────────────────────────────────────

    def update_setting(self, key: str, value) -> bool:
        """修改单个顶层设置项并持久化。"""
        self._data[key] = value
        self._persist()
        return True

    def update_settings(self, updates: dict) -> bool:
        """批量修改顶层设置项并持久化。"""
        self._data.update(updates)
        self._persist()
        return True

    def reload(self):
        """从文件重新加载设置。"""
        self._reload()
