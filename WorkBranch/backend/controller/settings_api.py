from typing import Annotated
from fastapi import Depends
from backend.app import app
from backend.data.settings import Settings
from backend.singleton import get_settings
from backend.controller.VO import Result


class SettingsController:
    @app.get("/setting")
    def get_setting(settings: Annotated[Settings, Depends(get_settings)]) -> Result:
        return Result.success(settings.load_all_data())

    @app.post("/setting")
    def save_setting(key: str, value: str, settings: Annotated[Settings, Depends(get_settings)]) -> Result:
        return Result.success(settings.save_data(key, value))

    @app.delete("/setting")
    def delete_setting(key: str, settings: Annotated[Settings, Depends(get_settings)]) -> Result:
        return Result.success(settings.delete_data(key))

    @app.put("/setting")
    def update_setting(key: str, value: str, settings: Annotated[Settings, Depends(get_settings)]) -> Result:
        return Result.success(settings.update_data(key, value))

    @app.post("/setting/reload")
    def reload_setting(settings: Annotated[Settings, Depends(get_settings)]) -> Result:
        settings.relaod_data()
        return Result.success()