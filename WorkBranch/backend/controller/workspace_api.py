from fastapi import APIRouter, Depends, HTTPException

from singleton import get_conversation_dao, get_workspace_service
from data.conversation_dao import ConversationDAO
from service.agent_service.service import WorkspaceService
from controller.VO.result import Result

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("")
def list_workspaces(
    service: WorkspaceService = Depends(get_workspace_service),
) -> Result:
    workspace_ids = sorted(service.list_all())
    data = []

    for workspace_id in workspace_ids:
        info = service.get_workspace_info(workspace_id)
        if not info:
            continue
        data.append({
            **info,
            "dir": service.get_workspace_dir(workspace_id)
        })

    return Result.success(data=data)


@router.get("/{workspace_id}")
def get_workspace(
    workspace_id: str,
    service: WorkspaceService = Depends(get_workspace_service),
    dao: ConversationDAO = Depends(get_conversation_dao),
) -> Result:
    info = service.get_workspace_info(workspace_id)
    if not info:
        conversation = dao.get_conversation_by_id(workspace_id)
        if conversation:
            service.register(workspace_id=workspace_id, session_id=str(conversation.session_id))
            info = service.get_workspace_info(workspace_id)

    if not info:
        raise HTTPException(status_code=404, detail="Workspace not found")

    return Result.success(data={
        **info,
        "dir": service.get_workspace_dir(workspace_id)
    })
