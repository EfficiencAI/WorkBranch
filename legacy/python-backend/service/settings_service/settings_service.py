from data.file_storage_system import FileStorageSystem


def _merge_missing_defaults(defaults, current):
    """Deep-merge defaults into current, only filling missing keys.

    Returns: (merged, changed)
    """
    if not isinstance(defaults, dict):
        return current, False

    if not isinstance(current, dict):
        return defaults, True

    merged = dict(current)
    changed = False

    for key, default_value in defaults.items():
        if key not in merged:
            merged[key] = default_value
            changed = True
            continue

        current_value = merged[key]
        if isinstance(default_value, dict):
            next_value, nested_changed = _merge_missing_defaults(default_value, current_value)
            if nested_changed:
                merged[key] = next_value
                changed = True

    return merged, changed


DEFAULT_SETTINGS = {
    "ui": {
        "theme_mode": "system",
        "scale": 1.0,
        "show_debug_overlay": False,
        "show_workspace_hud": False,
        "diagram_double_click_delay_ms": 300,
        "message_send_shortcuts_reversed": False
    },
    "database": {
        "path": "workbranch.db"
    },
    "llm": {
        "api_key": "",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "max_tokens": 4096
    },
    "workspace": {
        "base_dir": "workspaces"
    },
    "mq": {
        "max_size": 1000
    },
    "agent": {
        "memory_mode": "accumulate",
        "memory_window_size": 3
    },
    "conversation": {
        "single_message_per_node": True
    },
    "context": {
        "max_tokens": 32000,
        "warning_threshold": 0.5,
        "include_parent_context_by_default": False
    },
    "logging": {
        "enabled": True,
        "level": "INFO",
        "base_dir": "logs",
        "max_file_size_mb": 10,
        "frontend": {
            "enabled": True
        },
        "conversation_content": {
            "enabled": True
        },
        "sensitive_fields": ["api_key", "token", "password", "secret", "key"],
        "api_log_enabled": True,
        "retention": {
            "enabled": False,
            "max_runs": None,
            "max_days": None
        }
    },
    "tool_permissions": {
        "build_agent": {
            "allowed": ["read_file", "write_file", "list_dir", "create_dir", "explore_code", "thinking", "call_explore_agent", "call_review_agent"],
            "forbidden": ["delete_file", "explore_internet"]
        },
        "plan_agent": {
            "allowed": ["read_file", "list_dir", "explore_code", "thinking", "call_explore_agent", "call_review_agent"],
            "forbidden": ["write_file", "delete_file", "create_dir", "explore_internet"]
        },
        "review_agent": {
            "allowed": ["read_file", "list_dir", "explore_code", "thinking"],
            "forbidden": ["write_file", "delete_file", "create_dir", "explore_internet", "call_explore_agent", "call_review_agent"]
        },
        "explore_agent": {
            "allowed": ["read_file", "list_dir", "thinking", "explore_internet"],
            "forbidden": ["write_file", "delete_file", "create_dir", "explore_code", "call_explore_agent", "call_review_agent"]
        },
        "admin_agent": {
            "allowed": ["read_file", "write_file", "delete_file", "list_dir", "create_dir", "explore_code", "explore_internet", "thinking", "call_explore_agent", "call_review_agent"],
            "forbidden": []
        }
    },
    "debug": {
        "consistency_check": False
    }
}
DEFAULT_SETTINGS_METADATA = {
    "ui": {
        "scale": {
            "type": "number",
            "control": "slider",
            "min": 0.7,
            "max": 1.3,
            "step": 0.1,
        },
        "diagram_double_click_delay_ms": {
            "type": "number",
            "control": "slider",
            "min": 150,
            "max": 600,
            "step": 10,
        }
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
        data = self._fs.read_settings()
        merged, changed = _merge_missing_defaults(DEFAULT_SETTINGS, data)
        self._data = merged
        if changed:
            self._persist()

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

    def get_metadata(self) -> dict:
        """返回设置元数据。"""
        return dict(DEFAULT_SETTINGS_METADATA)

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
