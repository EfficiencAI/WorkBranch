from data.settings_parse import SettingsParse


class SettingsService:
    """设置服务层：对外提供设置的读取与修改接口。"""

    def __init__(self):
        self._dao = SettingsParse()

    def get(self, key: str) -> str:
        """读取设置项，支持 ':' 访问嵌套层级。

        Examples:
            get("apikey")           -> "your_api_key_here"
            get("groupA:settingA")  -> "valueA"

        Raises:
            KeyError: 键路径不存在时抛出。
        """
        return self._dao.get(key)

    def get_all(self) -> dict:
        """返回所有设置项的副本。"""
        return self._dao.get_all()

    def update_setting(self, key: str, value) -> bool:
        """修改单个顶层设置项并持久化。"""
        return self._dao.update(key, value)

    def update_settings(self, updates: dict) -> bool:
        """批量修改顶层设置项并持久化。"""
        return self._dao.update_batch(updates)

    def reload(self):
        """从文件重新加载设置。"""
        self._dao.reload()
