import sys
import asyncio
sys.path.insert(0, '.')

from service.agent_service.agent_service import AgentService
from service.agent_service.workspace import WorkspaceService
from service.agent_service.llm_service import LLMService
from service.settings_service.settings_service import SettingsService


async def test_agent_service_hello():
    print("=" * 60)
    print("测试 AgentService - 提示词: 你好")
    print("=" * 60)

    settings = SettingsService()
    llm = LLMService(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm)

    conv_id = await agent.create_conversation()
    print(f"[测试] 创建对话: {conv_id}")

    print("[测试] 发送消息: 你好")
    try:
        result = await agent.send_message_and_wait(conv_id, "你好")
        print(f"[测试] 执行完成")
        print(f"[测试] 结果类型: {type(result)}")
        print(f"[测试] 结果: {result}")
    except Exception as e:
        print(f"[测试] 执行出错: {e}")
        import traceback
        traceback.print_exc()

    status = agent.get_status(conv_id)
    print(f"[测试] 对话状态: {status}")

    print("[测试] 测试完成")


if __name__ == "__main__":
    asyncio.run(test_agent_service_hello())
