from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from singleton import get_settings_service
from service.settings_service.settings_service import SettingsService
from controller.VO.result import Result

router = APIRouter(prefix="/settings", tags=["settings"])


class UpdateSettingBody(BaseModel):
    key: str
    value: str


@router.get("")
def get_settings(
    key: Optional[str] = None,
    service: SettingsService = Depends(get_settings_service),
) -> Result:
    """不传 key 返回全部设置；传 key 返回对应值，支持 'groupA:settingA' 格式。"""
    if key:
        try:
            return Result.success(data=service.get(key))
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return Result.success(data=service.get_all())


@router.get("/metadata")
def get_settings_metadata(
    service: SettingsService = Depends(get_settings_service),
) -> Result:
    """返回设置元数据。"""
    return Result.success(data=service.get_metadata())


@router.put("")
def update_setting(
    body: UpdateSettingBody,
    service: SettingsService = Depends(get_settings_service),
) -> Result:
    """修改单个顶层设置项。"""
    service.update_setting(body.key, body.value)
    return Result.success()


@router.patch("")
def update_settings(
    updates: dict,
    service: SettingsService = Depends(get_settings_service),
) -> Result:
    """批量修改设置项。"""
    service.update_settings(updates)
    return Result.success()


@router.post("/reload")
def reload_settings(
    service: SettingsService = Depends(get_settings_service),
) -> Result:
    """从文件重新加载设置。"""
    service.reload()
    return Result.success()