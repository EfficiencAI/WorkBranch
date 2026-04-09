from __future__ import annotations

import json
import os
import queue
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.logging.sanitizer import mask_sensitive_fields, sanitize_json
from core.logging.types import (
    ConversationContentRecord,
    LogLevel,
    LogModule,
    LogRecord,
    LOG_LEVEL_PRIORITY,
)


@dataclass(frozen=True)
class WriterConfig:
    log_dir: Path
    startup_ts: str
    max_file_size_mb: int
    conversation_content_enabled: bool
    sensitive_fields: list[str]
    queue_maxsize: int = 5000


class LogWriter:
    def __init__(self, cfg: WriterConfig, run_meta_path: Path):
        self._cfg = cfg
        self._run_meta_path = run_meta_path

        self._queue: queue.Queue[tuple[str, Any]] = queue.Queue(maxsize=cfg.queue_maxsize)
        self._running = False
        self._thread: threading.Thread | None = None

        self._lock = threading.Lock()
        self._files: dict[LogModule, list[str]] = {m: [] for m in ("api", "agent", "mq", "frontend", "app")}
        self._current_file: dict[LogModule, Path] = {}

        self._dropped: dict[LogLevel, int] = {"DEBUG": 0, "INFO": 0, "WARNING": 0, "ERROR": 0}
        self._last_drop_alert_at = 0.0
        self._last_drop_alert_total = 0

        # conversation-content seq per conversation_id (in-memory for Phase 1)
        self._content_seq: dict[str, int] = {}
        self._conversation_content_dir = cfg.log_dir / "conversation-content"

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, name="log-writer", daemon=True)
        self._thread.start()

    def stop(self, timeout_seconds: float = 3.0) -> None:
        if not self._running:
            return
        self._running = False
        try:
            self._queue.put_nowait(("_stop", None))
        except queue.Full:
            pass
        if self._thread:
            self._thread.join(timeout=timeout_seconds)

    def flush(self, timeout_seconds: float = 3.0) -> bool:
        """Best-effort bounded flush. Returns True if likely drained."""
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if self._queue.empty():
                return True
            time.sleep(0.02)
        return False

    def enqueue_record(self, record: LogRecord) -> None:
        # Queue full policy: prefer ERROR; drop DEBUG/INFO/WARNING first
        try:
            self._queue.put_nowait(("log", record))
        except queue.Full:
            level: LogLevel = record["level"]
            if level == "ERROR":
                # Try to make room by dropping one lower-priority item (best-effort)
                try:
                    item_type, item = self._queue.get_nowait()
                    if item_type == "log" and isinstance(item, dict):
                        dropped_level = item.get("level")
                        if dropped_level in self._dropped:
                            self._dropped[dropped_level] += 1
                    self._queue.put_nowait(("log", record))
                except Exception:
                    self._dropped["ERROR"] += 1
            else:
                self._dropped[level] += 1
            self._emit_queue_dropped_alert_if_needed()

    def enqueue_conversation_content(self, record: ConversationContentRecord) -> None:
        try:
            self._queue.put_nowait(("content", record))
        except queue.Full:
            # content is treated like INFO
            self._dropped["INFO"] += 1
            self._emit_queue_dropped_alert_if_needed()

    def _emit_queue_dropped_alert_if_needed(self) -> None:
        dropped_total = sum(self._dropped.values())
        if dropped_total <= 0:
            return

        now = time.time()
        dropped_since_last_alert = dropped_total - self._last_drop_alert_total
        if dropped_since_last_alert <= 0:
            return
        if self._last_drop_alert_at and dropped_since_last_alert < 10 and (now - self._last_drop_alert_at) < 5.0:
            return

        record: LogRecord = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": "WARNING",
            "module": "app",
            "event": "app.queue_dropped",
            "msg": "log writer dropped queued records",
            "ctx": {
                "client_id": None,
                "conversation_id": None,
                "workspace_id": None,
                "user_id": None,
                "request_id": None,
            },
            "extra": {
                "dropped_total": dropped_total,
                "dropped_since_last_alert": dropped_since_last_alert,
                "dropped_by_level": dict(self._dropped),
                "queue_size": self._queue.qsize(),
                "queue_maxsize": self._cfg.queue_maxsize,
            },
            "exception": None,
        }
        self._handle_log(record)
        self._last_drop_alert_at = now
        self._last_drop_alert_total = dropped_total

    def _ensure_module_file(self, module: LogModule) -> Path:
        with self._lock:
            current = self._current_file.get(module)
            if current is None:
                name = f"{module}_{self._cfg.startup_ts}.log"
                current = self._cfg.log_dir / name
                self._current_file[module] = current
                self._files[module].append(name)
                self._persist_run_meta_locked()
                return current

            max_bytes = int(self._cfg.max_file_size_mb) * 1024 * 1024
            try:
                if current.exists() and current.stat().st_size >= max_bytes:
                    # rotate
                    idx = len(self._files[module])
                    name = f"{module}_{self._cfg.startup_ts}_{idx}.log"
                    current = self._cfg.log_dir / name
                    self._current_file[module] = current
                    self._files[module].append(name)
                    self._persist_run_meta_locked()
            except Exception:
                # Ignore rotation errors; fall back to current file
                pass

            return current

    def _persist_run_meta_locked(self) -> None:
        # Called under self._lock
        try:
            data = json.loads(self._run_meta_path.read_text(encoding="utf-8"))
        except Exception:
            data = {}

        data["files"] = {k: list(v) for k, v in self._files.items()}
        data["updated_at"] = datetime.now(timezone.utc).isoformat()

        try:
            self._run_meta_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass

    def _write_jsonl(self, path: Path, obj: Any) -> None:
        # Ensure parent
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False))
            f.write("\n")

    def _loop(self) -> None:
        while self._running:
            try:
                item_type, item = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue

            if item_type == "_stop":
                break

            try:
                if item_type == "log":
                    self._handle_log(item)
                elif item_type == "content":
                    self._handle_content(item)
            except Exception as e:
                print(f"[logging] writer error: {e}", file=sys.stderr)
            finally:
                try:
                    self._queue.task_done()
                except Exception:
                    pass

        # Drain best-effort after stop
        drain_deadline = time.time() + 0.5
        while time.time() < drain_deadline:
            try:
                item_type, item = self._queue.get_nowait()
            except queue.Empty:
                break
            try:
                if item_type == "log":
                    self._handle_log(item)
                elif item_type == "content":
                    self._handle_content(item)
            except Exception:
                pass
            finally:
                try:
                    self._queue.task_done()
                except Exception:
                    pass

    def _handle_log(self, record: LogRecord) -> None:
        # sanitize & mask at writer
        extra = sanitize_json(record.get("extra"))
        extra = mask_sensitive_fields(extra, self._cfg.sensitive_fields)

        out = dict(record)
        out["extra"] = extra

        module: LogModule = record["module"]
        path = self._ensure_module_file(module)
        self._write_jsonl(path, out)

    def _handle_content(self, record: ConversationContentRecord) -> None:
        # conversation-content is a semantic audit timeline. It may reference message events,
        # but the canonical user/assistant bodies live in SQLite nodes instead of this log.
        if not self._cfg.conversation_content_enabled:
            return
        conversation_id = record["conversation_id"]

        # Assign seq if not provided
        seq = record.get("seq")
        if not isinstance(seq, int):
            seq = self._content_seq.get(conversation_id, 0) + 1
        self._content_seq[conversation_id] = seq

        out = dict(record)
        out["seq"] = seq
        out["payload"] = mask_sensitive_fields(
            sanitize_json(out.get("payload", {})),
            self._cfg.sensitive_fields,
        )

        path = self._conversation_content_dir / f"{conversation_id}.jsonl"
        self._write_jsonl(path, out)
