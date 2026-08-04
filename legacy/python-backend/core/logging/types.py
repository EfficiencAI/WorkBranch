from __future__ import annotations

from typing import Any, Literal, TypedDict


LogModule = Literal["api", "agent", "mq", "frontend", "app"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]
ConversationContentType = Literal[
    "user_message",
    "assistant_message",
    "system_event",
    "tool_event",
]

LOG_MODULES: tuple[LogModule, ...] = ("api", "agent", "mq", "frontend", "app")
LOG_LEVELS: tuple[LogLevel, ...] = ("DEBUG", "INFO", "WARNING", "ERROR")
LOG_LEVEL_PRIORITY: dict[LogLevel, int] = {
    "DEBUG": 10,
    "INFO": 20,
    "WARNING": 30,
    "ERROR": 40,
}


class LogContext(TypedDict):
    client_id: str | None
    conversation_id: str | None
    workspace_id: str | None
    user_id: str | None
    request_id: str | None


class LogRecord(TypedDict):
    ts: str
    level: LogLevel
    module: LogModule
    event: str
    msg: str | None
    ctx: LogContext
    extra: Any
    exception: str | None


class ConversationContentRecord(TypedDict):
    seq: int
    ts: str
    conversation_id: str
    type: ConversationContentType
    payload: dict[str, Any]
