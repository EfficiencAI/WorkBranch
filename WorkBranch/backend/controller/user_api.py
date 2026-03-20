from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from singleton import get_user_service
from service.user_service.user import UserService
from controller.VO.result import Result

router = APIRouter(prefix="/users", tags=["users"])


class CreateUserBody(BaseModel):
    name: str


class RenameUserBody(BaseModel):
    name: str


@router.post("")
def create_user(
    body: CreateUserBody,
    service: UserService = Depends(get_user_service),
) -> Result:
    """创建新用户。"""
    user_id = service.create_user(body.name)
    return Result.success(data={"id": user_id})


@router.get("/{user_id}")
def get_user(
    user_id: int,
    service: UserService = Depends(get_user_service),
) -> Result:
    """根据 ID 获取用户。"""
    user = service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return Result.success(data={"id": user.id, "name": user.name})


@router.patch("/{user_id}")
def rename_user(
    user_id: int,
    body: RenameUserBody,
    service: UserService = Depends(get_user_service),
) -> Result:
    """修改用户名。"""
    user = service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    service.rename_user(user_id, body.name)
    return Result.success()


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    service: UserService = Depends(get_user_service),
) -> Result:
    """删除用户。"""
    user = service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    service.delete_user(user_id)
    return Result.success()


@router.get("/{user_id}/sessions")
def list_sessions(
    user_id: int,
    service: UserService = Depends(get_user_service),
) -> Result:
    """获取用户的全部会话列表。"""
    user = service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    sessions = service.list_sessions(user_id)
    return Result.success(data=[
        {
            "id": s.id,
            "user_id": s.user_id,
            "title": s.title,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }
        for s in sessions
    ])
