import sys
import asyncio
sys.path.insert(0, '.')

from service.agent_service import AgentService
from service.agent_service.service import WorkspaceService, LLMService
from service.settings_service.settings_service import SettingsService
from service.session_service.mq import MessageQueue


async def test_agent_service_hello():
    print("=" * 60)
    print("测试 AgentService - 提示词: 你好")
    print("=" * 60)

    settings = SettingsService()
    llm = LLMService(settings)
    ws = WorkspaceService()
    mq = MessageQueue(settings)
    
    print("[测试] 启动 MQ 消费者...")
    await mq.start_consumer()
    print(f"[测试] MQ 消费者已启动，队列容量: {mq._max_size}")
    
    agent = AgentService(ws, llm, mq, settings)

    conv_id = await agent.create_conversation()
    print(f"[测试] 创建对话: {conv_id}")

    print("[测试] 发送消息: 你好")
    try:
        result = await agent.send_message_and_wait(conv_id, "你好")
        print(f"[测试] 执行完成")
        print(f"[测试] 结果类型: {type(result)}")
        print(f"[测试] 结果键: {result.keys() if isinstance(result, dict) else 'N/A'}")
    except Exception as e:
        print(f"[测试] 执行出错: {e}")
        import traceback
        traceback.print_exc()

    status = agent.get_status(conv_id)
    print(f"[测试] 对话状态: {status}")
    
    print("[测试] 等待 MQ 队列清空...")
    await asyncio.sleep(1)
    
    print(f"[测试] MQ 队列当前大小: {mq.size}")
    
    print("[测试] 停止 MQ 消费者...")
    await mq.stop_consumer()

    print("[测试] 测试完成")


if __name__ == "__main__":
    asyncio.run(test_agent_service_hello())
