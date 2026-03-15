import uuid
from typing import Optional
from .workspace import WorkspaceService
from .graph import run_graph


class AgentService:
    """Agent 服务：提供 new_agent 入口方法"""

    def __init__(self, workspace_service: WorkspaceService = None, llm_service=None):
        if workspace_service is None:
            workspace_service = WorkspaceService()
        self.ws = workspace_service
        self._llm_service = llm_service

    def _get_llm_service(self):
        """获取 LLM 服务"""
        if self._llm_service is None:
            from .llm_service import get_llm_service
            self._llm_service = get_llm_service()
        return self._llm_service

    def _generate_id(self) -> str:
        """生成唯一ID"""
        return str(uuid.uuid4())

    def new_agent(self, user_message: str, workspace_id: Optional[str] = None):
        """
        启动一个新的 Agent
        
        Args:
            user_message: 用户输入的消息
            workspace_id: 可选的工作区ID，如果不提供则自动生成
            
        Returns:
            执行结果
        """
        print("="*60)
        print("[Agent] 启动 Agent")
        print("="*60)

        if not workspace_id:
            workspace_id = self._generate_id()
            print(f"[Agent] 自动生成工作区ID: {workspace_id}")

        print(f"[Agent] 注册工作区...")
        self.ws.register(workspace_id)

        print(f"[Agent] 用户输入: {user_message}")
        print(f"[Agent] 工作区ID: {workspace_id}")

        llm_service = self._get_llm_service()
        result = run_graph(user_message, workspace_id, llm_service)

        print("\n[Agent] 任务完成！")
        print("="*60)
        return result
