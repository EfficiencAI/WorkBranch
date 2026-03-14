from fastapi import FastAPI
from controller.settings_api import router as settings_router

app = FastAPI()
app.include_router(settings_router)