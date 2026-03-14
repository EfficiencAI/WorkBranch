import json
from data.file_storage_system import FileStorageSystem, SETTING_FILE_PATH


class SettingsParseService:
    """解析并管理应用设置。

    初始化时若设置文件不存在会自动创建并写入默认值；
    其他服务通过 get() 读取配置，无需直接操作文件。
    """

    def __init__(self):
        FileStorageSystem().ensure_setting_file({})
        self._reload()

    # ── 私有工具 ────────────────────────────────────────────────────────────────

    def _reload(self):
        with open(SETTING_FILE_PATH, "r", encoding="utf-8") as f:
            self._data: dict = json.load(f)

    def _persist(self):
        with open(SETTING_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=4, ensure_ascii=False)

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

    # ── 修改设置 ────────────────────────────────────────────────────────────────

    def update_setting(self, key: str, value) -> bool:
        """修改单个顶层设置项并持久化到文件。"""
        self._data[key] = value
        self._persist()
        return True

    def update_settings(self, updates: dict) -> bool:
        """批量修改顶层设置项并持久化到文件。"""
        self._data.update(updates)
        self._persist()
        return True

    def reload(self):
        """从文件重新加载设置（外部修改文件后调用）。"""
        self._reload()

    def get_all(self) -> dict:
        """返回所有设置项的副本。"""
        return dict(self._data)
    
if __name__ == "__main__":
    service = SettingsParseService()
    print(service.get_all())
