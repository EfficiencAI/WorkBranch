from __future__ import annotations

import dataclasses
from typing import Any


def sanitize_json(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if dataclasses.is_dataclass(value):
        return sanitize_json(dataclasses.asdict(value))

    if isinstance(value, dict):
        return {str(k): sanitize_json(v) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [sanitize_json(v) for v in value]

    # Best-effort fallback for non-JSON-serializable objects
    return str(value)


def mask_sensitive_fields(value: Any, sensitive_fields: list[str]) -> Any:
    if not sensitive_fields:
        return value

    lower_sensitive = {f.lower() for f in sensitive_fields}

    def _mask(v: Any) -> Any:
        if isinstance(v, dict):
            masked: dict[str, Any] = {}
            for k, vv in v.items():
                ks = str(k)
                if ks.lower() in lower_sensitive:
                    masked[ks] = "***"
                else:
                    masked[ks] = _mask(vv)
            return masked
        if isinstance(v, list):
            return [_mask(x) for x in v]
        return v

    return _mask(value)
