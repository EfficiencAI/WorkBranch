import json
from data.file_storage_system import FileStorageSystem, SETTING_FILE_PATH

# 硬编码的默认设置内容，文件不存在时直接写入
DEFAULT_SETTINGS: dict = {
    "apikey": "",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "max_tokens": 150,
    "top_p": 1.0,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0,
}


class SettingsParseService:
    """解析并管理应用设置，对外暴露强类型属性。
    
    初始化时若设置文件不存在会自动创建并写入默认值；
    其他服务通过本类读取与修改设置，无需直接操作文件。
    """

    def __init__(self):
        # 1. 确保设置文件存在（不存在则创建并写入默认值）
        FileStorageSystem().ensure_setting_file(DEFAULT_SETTINGS)
        # 2. 读取设置
        self._reload()

    # ── 私有工具 ────────────────────────────────────────────────────────────────

    def _reload(self):
        with open(SETTING_FILE_PATH, "r", encoding="utf-8") as f:
            self._data: dict = json.load(f)

    def _get(self, key: str):
        return self._data.get(key, DEFAULT_SETTINGS.get(key))

    def _persist(self):
        with open(SETTING_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=4, ensure_ascii=False)

    # ── 读取设置（强类型属性）───────────────────────────────────────────────────

    @property
    def apikey(self) -> str:
        return str(self._get("apikey"))

    @property
    def base_url(self) -> str:
        return str(self._get("base_url"))

    @property
    def model(self) -> str:
        return str(self._get("model"))

    @property
    def temperature(self) -> float:
        return float(self._get("temperature"))

    @property
    def max_tokens(self) -> int:
        return int(self._get("max_tokens"))

    @property
    def top_p(self) -> float:
        return float(self._get("top_p"))

    @property
    def frequency_penalty(self) -> float:
        return float(self._get("frequency_penalty"))

    @property
    def presence_penalty(self) -> float:
        return float(self._get("presence_penalty"))

    # ── 修改设置 ────────────────────────────────────────────────────────────────

    def update_setting(self, key: str, value) -> bool:
        """修改单个设置项并持久化到文件。"""
        self._data[key] = value
        self._persist()
        return True

    def update_settings(self, updates: dict) -> bool:
        """批量修改设置项并持久化到文件。"""
        self._data.update(updates)
        self._persist()
        return True

    def reload(self):
        """从文件重新加载设置（外部修改文件后调用）。"""
        self._reload()

    def get_all(self) -> dict:
        """返回所有设置项的副本。"""
        return dict(self._data)
