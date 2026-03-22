from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from singleton import get_user_service, get_session_history
from service.user_service.user import UserService
from service.user_service.session_history import SessionHistory
from controller.VO.result import Result

router = APIRouter(prefix="/user", tags=["user"])


class UpdateUserNameBody(BaseModel):
    """更新用户名的请求体"""
    name: str


class CreateSessionBody(BaseModel):
    """创建会话的请求体"""
    title: str


@router.get("/profile")
def get_user_profile(
    service: UserService = Depends(get_user_service),
) -> Result:
    """
    获取当前用户信息。
    """
    user = service.get_current_user()
    return Result.success(data={
        "id": user.id,
        "name": user.name
    })


@router.put("/profile/name")
def update_user_name(
    body: UpdateUserNameBody,
    service: UserService = Depends(get_user_service),
) -> Result:
    """
    更新当前用户的名称。
    """
    user = service.update_user_name(body.name)
    return Result.success(data={
        "id": user.id,
        "name": user.name
    })


@router.get("/sessions")
def list_sessions(
    service: SessionHistory = Depends(get_session_history),
) -> Result:
    """
    获取当前用户的所有会话列表。
    按更新时间倒序排列。
    """
    sessions = service.list_sessions()
    return Result.success(data=[
        {
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at,
            "updated_at": s.updated_at
        }
        for s in sessions
    ])


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int,
    service: SessionHistory = Depends(get_session_history),
) -> Result:
    """
    获取指定会话的详情。
    """
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return Result.success(data={
        "id": session.id,
        "user_id": session.user_id,
        "title": session.title,
        "created_at": session.created_at,
        "updated_at": session.updated_at
    })


@router.post("/sessions")
def create_session(
    body: CreateSessionBody,
    service: SessionHistory = Depends(get_session_history),
) -> Result:
    """
    创建新会话。
    """
    session = service.create_session(body.title)
    return Result.success(data={
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at,
        "updated_at": session.updated_at
    })


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    service: SessionHistory = Depends(get_session_history),
) -> Result:
    """
    删除指定会话。
    会级联删除会话下的所有节点。
    """
    service.delete_session(session_id)
    return Result.success()
