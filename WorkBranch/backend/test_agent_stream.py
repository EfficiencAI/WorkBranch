import sys
sys.path.insert(0, '.')

from service.agent_service.agent_service import AgentService
from service.agent_service.workspace import WorkspaceService
from service.agent_service.llm_service import get_llm_service
from service.settings_service.settings_service import SettingsService

if __name__ == "__main__":
    settings = SettingsService()
    llm = get_llm_service(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm)
    
    agent.new_agent('帮我写一个简单的 Python 函数，计算两个数的和', 'test_stream_002')
