import sys
sys.path.insert(0, '.')

import asyncio
from service.agent_service import AgentService
from service.agent_service.service import WorkspaceService

async def test():
    ws = WorkspaceService()
    agent = AgentService(ws, None)
    
    conv_id = await agent.create_conversation()
    print(f'创建对话成功: {conv_id[:8]}...')
    
    status = agent.get_status(conv_id)
    print(f'对话状态: {status["status"]}')
    
    conversations = agent.list_conversations()
    print(f'对话数量: {len(conversations)}')
    
    deleted = agent.delete_conversation(conv_id)
    print(f'删除对话: {deleted}')
    
    print('\n所有测试通过!')

if __name__ == "__main__":
    asyncio.run(test())
