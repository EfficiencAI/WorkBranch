import sys
import asyncio
sys.path.insert(0, '.')

from service.session_service.mq import MessageQueue, StreamMessage, MessageType
from service.settings_service.settings_service import SettingsService
from service.agent_service.agent_service import AgentService
from service.agent_service.workspace import WorkspaceService
from service.agent_service.llm_service import LLMService


async def test_agent_mq_integration():
    print("=" * 60)
    print("测试 Agent 与消息队列集成")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)
    llm = LLMService(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm, mq)

    await mq.start_consumer()
    print("[测试] 消息队列消费者已启动")

    conv_id = await agent.create_conversation()
    print(f"[测试] 创建对话: {conv_id}")

    print("[测试] 发送消息并等待执行...")
    try:
        result = await agent.send_message_and_wait(conv_id, "写一个简单的 hello world 函数")
        print(f"[测试] 执行完成，结果类型: {type(result)}")
    except Exception as e:
        print(f"[测试] 执行出错: {e}")

    await asyncio.sleep(1.0)

    print(f"[测试] 当前队列大小: {mq.size}")

    await mq.stop_consumer()
    print("[测试] 测试完成")


async def test_streaming_tokens():
    print("\n" + "=" * 60)
    print("测试流式 token 转发")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)

    await mq.start_consumer()

    from service.session_service.mq import StreamMessage, MessageType

    def simulate_token_stream():
        tokens = ["Hello", ", ", "this", " is", " a", " test", "."]
        for token in tokens:
            msg = StreamMessage(
                session_id="test-session",
                conversation_id="test-conv",
                workspace_id="test-ws",
                content=token,
                message_type=MessageType.TEXT
            )
            mq.publish_sync(msg)
            print(f"[模拟] 发布 token: '{token}'")

    simulate_token_stream()

    done_msg = StreamMessage(
        session_id="test-session",
        conversation_id="test-conv",
        workspace_id="test-ws",
        content="",
        message_type=MessageType.DONE
    )
    mq.publish_sync(done_msg)
    print("[模拟] 发布 DONE 消息")

    await asyncio.sleep(1.0)

    await mq.stop_consumer()
    print("[测试] 测试完成")


async def test_concurrent_agents():
    print("\n" + "=" * 60)
    print("测试并发 Agent 消息转发")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)
    llm = LLMService(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm, mq)

    await mq.start_consumer()

    conv1 = await agent.create_conversation()
    conv2 = await agent.create_conversation()

    print(f"[测试] 创建对话1: {conv1}")
    print(f"[测试] 创建对话2: {conv2}")

    task1 = await agent.send_message(conv1, "写一个加法函数")
    task2 = await agent.send_message(conv2, "写一个减法函数")

    print("[测试] 等待所有任务完成...")
    results = await asyncio.gather(task1, task2, return_exceptions=True)

    await asyncio.sleep(1.0)

    await mq.stop_consumer()
    print("[测试] 测试完成")


async def main():
    print("\n" + "=" * 60)
    print("Agent 与消息队列集成测试套件")
    print("=" * 60 + "\n")

    await test_streaming_tokens()
    await test_agent_mq_integration()

    print("\n" + "=" * 60)
    print("所有测试完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
