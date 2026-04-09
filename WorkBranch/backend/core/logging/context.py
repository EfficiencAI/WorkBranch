from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Iterator

from core.logging.types import LogContext

_DEFAULT_CTX: LogContext = {
    "client_id": None,
    "conversation_id": None,
    "workspace_id": None,
    "user_id": None,
    "request_id": None,
}

_CTX: ContextVar[LogContext] = ContextVar("logging_ctx", default=_DEFAULT_CTX.copy())


def get_ctx() -> LogContext:
    return dict(_CTX.get())


def set_ctx(**kwargs) -> LogContext:
    current = get_ctx()
    for key, value in kwargs.items():
        if key in current:
            current[key] = value
    _CTX.set(current)
    return current


def clear_ctx() -> None:
    _CTX.set(_DEFAULT_CTX.copy())


@contextmanager
def bind_ctx(**kwargs) -> Iterator[LogContext]:
    current = get_ctx()
    next_ctx = dict(current)
    for key, value in kwargs.items():
        if key in next_ctx:
            next_ctx[key] = value
    token: Token[LogContext] = _CTX.set(next_ctx)
    try:
        yield next_ctx
    finally:
        try:
            _CTX.reset(token)
        except ValueError:
            # Token was created in a different context (e.g., async generator cleanup)
            # This is expected when the context manager spans across different asyncio tasks
            pass
