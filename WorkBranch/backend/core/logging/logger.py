from __future__ import annotations

import traceback
from datetime import datetime, timezone
from typing import Any

from core.logging.context import get_ctx
from core.logging.types import LOG_LEVELS, LOG_MODULES, LogLevel, LogModule, LogRecord


class Logger:
    def __init__(self, runtime: "LoggingRuntime", module: LogModule):
        if module not in LOG_MODULES:
            raise ValueError(f"Unsupported log module: {module}")
        self._runtime = runtime
        self._module = module

    def debug(self, *, event: str, msg: str | None = None, extra: Any = None) -> None:
        self._log("DEBUG", event=event, msg=msg, extra=extra)

    def info(self, *, event: str, msg: str | None = None, extra: Any = None) -> None:
        self._log("INFO", event=event, msg=msg, extra=extra)

    def warning(self, *, event: str, msg: str | None = None, extra: Any = None) -> None:
        self._log("WARNING", event=event, msg=msg, extra=extra)

    def error(
        self,
        *,
        event: str,
        msg: str | None = None,
        extra: Any = None,
        exception: str | None = None,
    ) -> None:
        self._log("ERROR", event=event, msg=msg, extra=extra, exception=exception)

    def exception(self, *, event: str, msg: str | None = None, extra: Any = None) -> None:
        self._log(
            "ERROR",
            event=event,
            msg=msg,
            extra=extra,
            exception=traceback.format_exc(),
        )

    def _log(
        self,
        level: LogLevel,
        *,
        event: str,
        msg: str | None = None,
        extra: Any = None,
        exception: str | None = None,
    ) -> None:
        if level not in LOG_LEVELS:
            raise ValueError(f"Unsupported log level: {level}")
        if not event:
            raise ValueError("Log event is required")
        if not self._runtime.is_enabled_for(level):
            return

        record: LogRecord = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "module": self._module,
            "event": event,
            "msg": msg,
            "ctx": get_ctx(),
            "extra": extra,
            "exception": exception,
        }
        self._runtime.write_record(record)
