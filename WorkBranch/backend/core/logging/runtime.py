from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from data.file_storage_system import FileStorageSystem
from service.settings_service.settings_service import SettingsService

from core.logging.logger import Logger
from core.logging.types import LOG_LEVEL_PRIORITY, LOG_MODULES, LogLevel, LogModule
from core.logging.writer import LogWriter, WriterConfig


class LoggingRuntime:
    def __init__(self, settings_service: SettingsService):
        self._settings_service = settings_service
        self._file_storage = FileStorageSystem()
        self._started = False
        self._writer: LogWriter | None = None
        self._loggers: dict[LogModule, Logger] = {}
        self._run_id: str | None = None
        self._startup_ts_display: str | None = None
        self._startup_iso: str | None = None
        self._log_dir: Path | None = None
        self._run_meta_path: Path | None = None
        self._level: LogLevel = "INFO"
        self._config_snapshot: dict[str, Any] = {}

    def start(self) -> None:
        if self._started:
            return

        logging_cfg = self._settings_service.get("logging")
        self._config_snapshot = json.loads(json.dumps(logging_cfg))
        enabled = bool(logging_cfg.get("enabled", True))
        self._level = logging_cfg.get("level", "INFO")
        if self._level not in LOG_LEVEL_PRIORITY:
            self._level = "INFO"

        now = datetime.now().astimezone()
        self._startup_iso = now.isoformat()
        self._run_id = now.strftime("%Y%m%d_%H%M%S")
        self._startup_ts_display = self._run_id

        base_dir = logging_cfg.get("base_dir", "logs")
        root = Path(self._file_storage.get_storage_root())
        log_root = root / base_dir
        self._log_dir = log_root / self._run_id
        self._log_dir.mkdir(parents=True, exist_ok=True)
        (self._log_dir / "conversation-content").mkdir(parents=True, exist_ok=True)

        self._run_meta_path = self._log_dir / "run_meta.json"
        self._run_meta_path.write_text(
            json.dumps(
                {
                    "run_id": self._run_id,
                    "startup_ts": self._startup_iso,
                    "log_dir": str(self._log_dir),
                    "split_size_mb": logging_cfg.get("max_file_size_mb", 10),
                    "modules": list(LOG_MODULES),
                    "files": {module: [] for module in LOG_MODULES},
                    "config_snapshot": self._config_snapshot,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        if enabled:
            writer_cfg = WriterConfig(
                log_dir=self._log_dir,
                startup_ts=self._startup_ts_display,
                max_file_size_mb=int(logging_cfg.get("max_file_size_mb", 10)),
                conversation_content_enabled=bool(
                    logging_cfg.get("conversation_content", {}).get("enabled", True)
                ),
                sensitive_fields=list(logging_cfg.get("sensitive_fields", [])),
            )
            self._writer = LogWriter(writer_cfg, self._run_meta_path)
            self._writer.start()

        self._started = True

    def shutdown(self, timeout_seconds: float = 3.0) -> bool:
        if not self._started:
            return True
        flushed = True
        if self._writer:
            flushed = self._writer.flush(timeout_seconds=timeout_seconds)
            self._writer.stop(timeout_seconds=timeout_seconds)
        self._started = False
        return flushed

    def get_logger(self, module: LogModule) -> Logger:
        if module not in LOG_MODULES:
            raise ValueError(f"Unsupported log module: {module}")
        if module not in self._loggers:
            self._loggers[module] = Logger(self, module)
        return self._loggers[module]

    def write_record(self, record: dict[str, Any]) -> None:
        if not self._writer:
            return
        self._writer.enqueue_record(record)

    def is_enabled_for(self, level: LogLevel) -> bool:
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[self._level]

    @property
    def run_id(self) -> str | None:
        return self._run_id

    @property
    def log_dir(self) -> Path | None:
        return self._log_dir
