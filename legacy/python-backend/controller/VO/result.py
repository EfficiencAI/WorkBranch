from typing import Any, Optional
from pydantic import BaseModel


class Result(BaseModel):
    code: int = 200
    message: str = "Success"
    data: Optional[Any] = None

    @classmethod
    def success(cls, data: Any = None, message: str = "Success") -> "Result":
        return cls(code=200, message=message, data=data)

    @classmethod
    def error(cls, message: str = "Error", code: int = 500, data: Any = None) -> "Result":
        return cls(code=code, message=message, data=data)