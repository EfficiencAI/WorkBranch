from fastapi import FastAPI
from controller.settings_api import router as settings_router
from controller.user_api import router as user_router
from controller.chat_api import router as chat_router
from controller.conversation_api import router as conversation_router
from controller.workspace_api import router as workspace_router

app = FastAPI()


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}


app.include_router(settings_router)
app.include_router(user_router)
app.include_router(chat_router)
app.include_router(conversation_router)
app.include_router(workspace_router)
