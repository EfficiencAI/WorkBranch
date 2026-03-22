from fastapi import FastAPI
from controller.settings_api import router as settings_router
from controller.user_api import router as user_router

app = FastAPI()
app.include_router(settings_router)
app.include_router(user_router)