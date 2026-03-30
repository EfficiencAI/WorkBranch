from contextlib import asynccontextmanager

from fastapi import FastAPI
from controller.settings_api import router as settings_router
from controller.user_api import router as user_router
from controller.session_api import router as session_router
from controller.conversation_api import router as conversation_router
from controller.workspace_api import router as workspace_router
from singleton import get_logging_runtime


@asynccontextmanager
async def lifespan(app: FastAPI):
    runtime = get_logging_runtime()
    runtime.start()
    runtime.get_logger("app").info(
        event="app.started",
        msg="logging runtime started",
        extra={
            "run_id": runtime.run_id,
            "log_dir": str(runtime.log_dir) if runtime.log_dir else None,
        },
    )
    try:
        yield
    finally:
        runtime.get_logger("app").info(
            event="app.stopping",
            msg="application stopping",
            extra={"run_id": runtime.run_id},
        )
        runtime.shutdown()


app = FastAPI(lifespan=lifespan)


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}


app.include_router(settings_router)
app.include_router(user_router)
app.include_router(session_router)
app.include_router(conversation_router)
app.include_router(workspace_router)
