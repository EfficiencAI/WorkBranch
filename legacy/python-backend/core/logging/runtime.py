from __future__ import annotations

import json
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from data.file_storage_system import FileStorageSystem
from service.settings_service.settings_service import SettingsService

from core.logging.logger import Logger
from core.logging.types import (
    LOG_LEVEL_PRIORITY,
    LOG_MODULES,
    ConversationContentRecord,
    LogLevel,
    LogModule,
)
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
        self._logging_enabled = True

    def _load_run_meta(self, run_dir: Path) -> dict[str, Any]:
        run_meta_path = run_dir / "run_meta.json"
        if not run_meta_path.exists():
            return {}
        try:
            return json.loads(run_meta_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _resolve_run_startup(self, run_dir: Path) -> datetime:
        run_meta = self._load_run_meta(run_dir)
        startup_ts = run_meta.get("startup_ts")
        if isinstance(startup_ts, str):
            try:
                return datetime.fromisoformat(startup_ts)
            except ValueError:
                pass

        try:
            return datetime.strptime(run_dir.name, "%Y%m%d_%H%M%S").replace(tzinfo=datetime.now().astimezone().tzinfo)
        except ValueError:
            return datetime.fromtimestamp(run_dir.stat().st_mtime, tz=timezone.utc).astimezone()

    def _list_run_dirs(self, log_root: Path) -> list[Path]:
        if not log_root.exists():
            return []
        return [path for path in log_root.iterdir() if path.is_dir()]

    def _cleanup_expired_runs(
        self,
        *,
        log_root: Path,
        current_run_dir: Path,
        retention_cfg: dict[str, Any],
    ) -> None:
        if not bool(retention_cfg.get("enabled", False)):
            return

        run_dirs = [path for path in self._list_run_dirs(log_root) if path != current_run_dir]
        if not run_dirs:
            return

        max_days = retention_cfg.get("max_days")
        if isinstance(max_days, (int, float)) and max_days >= 0:
            cutoff = datetime.now().astimezone() - timedelta(days=float(max_days))
            retained: list[Path] = []
            for run_dir in run_dirs:
                startup_at = self._resolve_run_startup(run_dir)
                if startup_at < cutoff:
                    shutil.rmtree(run_dir, ignore_errors=True)
                else:
                    retained.append(run_dir)
            run_dirs = retained

        max_runs = retention_cfg.get("max_runs")
        if isinstance(max_runs, int) and max_runs >= 0 and len(run_dirs) > max_runs:
            ordered = sorted(run_dirs, key=self._resolve_run_startup, reverse=True)
            for run_dir in ordered[max_runs:]:
                shutil.rmtree(run_dir, ignore_errors=True)

    def _finalize_run_meta(self, *, flushed: bool, writer_started: bool) -> None:
        if self._run_meta_path is None:
            return

        run_meta = self._load_run_meta(self._run_meta_path.parent)
        now_iso = datetime.now(timezone.utc).isoformat()
        run_meta.update(
            {
                "shutdown_ts": now_iso,
                "flush_succeeded": flushed,
                "status": "completed" if writer_started and flushed else "flush_timeout" if writer_started else "writer_not_started",
                "logging_enabled": self._logging_enabled,
                "writer_started": writer_started,
                "updated_at": now_iso,
            }
        )
        self._run_meta_path.write_text(
            json.dumps(run_meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def start(self) -> None:
        if self._started:
            return

        logging_cfg = self._settings_service.get("logging")
        self._config_snapshot = json.loads(json.dumps(logging_cfg))
        enabled = bool(logging_cfg.get("enabled", True))
        self._logging_enabled = enabled
        self._level = logging_cfg.get("level", "INFO")
        if self._level not in LOG_LEVEL_PRIORITY:
            self._level = "INFO"

        now = datetime.now().astimezone()
        self._startup_iso = now.isoformat()
        self._run_id = now.strftime("%Y%m%d_%H%M%S")
        self._startup_ts_display = self._run_id

        base_dir = logging_cfg.get("base_dir", "logs")
        root = Path(self._file_storage.get_setting_file_path()).parent
        base_path = Path(base_dir)
        log_root = base_path if base_path.is_absolute() else root / base_path
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

        retention_cfg = logging_cfg.get("retention", {}) if isinstance(logging_cfg.get("retention", {}), dict) else {}
        self._cleanup_expired_runs(
            log_root=log_root,
            current_run_dir=self._log_dir,
            retention_cfg=retention_cfg,
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
        writer_started = self._writer is not None
        if self._writer:
            flushed = self._writer.flush(timeout_seconds=timeout_seconds)
            self._writer.stop(timeout_seconds=timeout_seconds)
        self._finalize_run_meta(flushed=flushed, writer_started=writer_started)
        self._writer = None
        self._started = False
        return flushed

    def get_logger(self, module: LogModule) -> Logger:
        if module not in LOG_MODULES:
            raise ValueError(f"Unsupported log module: {module}")
        if not self._started:
            self.start()
        if module not in self._loggers:
            self._loggers[module] = Logger(self, module)
        return self._loggers[module]

    def write_record(self, record: dict[str, Any]) -> None:
        if not self._writer:
            return
        self._writer.enqueue_record(record)

    def write_conversation_content(self, record: ConversationContentRecord) -> None:
        if not self._writer:
            return
        self._writer.enqueue_conversation_content(record)

    def is_enabled_for(self, level: LogLevel) -> bool:
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[self._level]

    @property
    def run_id(self) -> str | None:
        return self._run_id

    @property
    def log_dir(self) -> Path | None:
        return self._log_dir
