import sys
import asyncio
sys.path.insert(0, '.')

from service.session_service.mq import MessageQueue, StreamMessage, MessageType
from service.settings_service.settings_service import SettingsService


async def test_basic_publish_consume():
    print("=" * 60)
    print("测试基本发布和消费")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)

    await mq.start_consumer()

    message = StreamMessage(
        session_id="session-001",
        conversation_id="conv-001",
        workspace_id="ws-001",
        content="Hello, World!",
        message_type=MessageType.TEXT
    )

    success = await mq.publish(message)
    print(f"[测试] 发布消息: {'成功' if success else '失败'}")
    print(f"[测试] 当前队列大小: {mq.size}")

    await asyncio.sleep(0.5)

    print(f"[测试] 消费后队列大小: {mq.size}")

    await mq.stop_consumer()
    print("[测试] 测试完成\n")


async def test_multiple_messages():
    print("=" * 60)
    print("测试批量消息")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)

    await mq.start_consumer()

    messages = []
    for i in range(5):
        msg = StreamMessage(
            session_id=f"session-{i}",
            conversation_id=f"conv-{i}",
            workspace_id=f"ws-{i}",
            content=f"Message {i}",
            message_type=MessageType.TEXT
        )
        messages.append(msg)

    count = await mq.publish_batch(messages)
    print(f"[测试] 批量发布 {count} 条消息")

    await mq.wait_until_empty(timeout=5.0)
    print(f"[测试] 队列已清空")

    await mq.stop_consumer()
    print("[测试] 测试完成\n")


async def test_different_message_types():
    print("=" * 60)
    print("测试不同消息类型")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)

    await mq.start_consumer()

    test_messages = [
        StreamMessage(
            session_id="s1", conversation_id="c1", workspace_id="w1",
            content="Thinking...", message_type=MessageType.THINKING
        ),
        StreamMessage(
            session_id="s1", conversation_id="c1", workspace_id="w1",
            content="Response text", message_type=MessageType.TEXT
        ),
        StreamMessage(
            session_id="s1", conversation_id="c1", workspace_id="w1",
            content="Error occurred", message_type=MessageType.ERROR
        ),
        StreamMessage(
            session_id="s1", conversation_id="c1", workspace_id="w1",
            content="", message_type=MessageType.DONE
        ),
    ]

    for msg in test_messages:
        await mq.publish(msg)

    await mq.wait_until_empty(timeout=5.0)
    await mq.stop_consumer()
    print("[测试] 测试完成\n")


async def test_queue_full():
    print("=" * 60)
    print("测试队列满场景")
    print("=" * 60)

    settings = SettingsService()
    small_mq = MessageQueue(settings)
    small_mq._max_size = 3
    small_mq._queue = asyncio.Queue(maxsize=3)

    print(f"[测试] 队列容量: {small_mq._max_size}")

    for i in range(5):
        msg = StreamMessage(
            session_id="s1", conversation_id="c1", workspace_id="w1",
            content=f"Message {i}"
        )
        success = await small_mq.publish(msg)
        print(f"[测试] 发布消息 {i}: {'成功' if success else '失败 (队列满)'}")

    print("[测试] 测试完成\n")


async def test_concurrent_publish():
    print("=" * 60)
    print("测试并发发布")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)

    await mq.start_consumer()

    async def publish_task(task_id: int, count: int):
        for i in range(count):
            msg = StreamMessage(
                session_id=f"session-{task_id}",
                conversation_id=f"conv-{task_id}",
                workspace_id=f"ws-{task_id}",
                content=f"Task {task_id} - Message {i}"
            )
            await mq.publish(msg)
            await asyncio.sleep(0.01)

    tasks = [
        asyncio.create_task(publish_task(1, 3)),
        asyncio.create_task(publish_task(2, 3)),
        asyncio.create_task(publish_task(3, 3)),
    ]

    await asyncio.gather(*tasks)
    print(f"[测试] 所有发布任务完成，队列大小: {mq.size}")

    await mq.wait_until_empty(timeout=5.0)
    await mq.stop_consumer()
    print("[测试] 测试完成\n")


async def test_message_to_dict():
    print("=" * 60)
    print("测试消息序列化")
    print("=" * 60)

    msg = StreamMessage(
        session_id="session-001",
        conversation_id="conv-001",
        workspace_id="ws-001",
        content="Test content",
        message_type=MessageType.TEXT,
        metadata={"key": "value", "count": 123}
    )

    msg_dict = msg.to_dict()
    print(f"[测试] 序列化结果:")
    for key, value in msg_dict.items():
        print(f"  {key}: {value}")

    print("[测试] 测试完成\n")


async def test_config_max_size():
    print("=" * 60)
    print("测试配置读取")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)

    print(f"[测试] 从配置读取的队列容量: {mq._max_size}")

    print("[测试] 测试完成\n")


async def main():
    print("\n" + "=" * 60)
    print("消息队列服务测试套件")
    print("=" * 60 + "\n")

    await test_message_to_dict()
    await test_config_max_size()
    await test_basic_publish_consume()
    await test_multiple_messages()
    await test_different_message_types()
    await test_queue_full()
    await test_concurrent_publish()

    print("\n" + "=" * 60)
    print("所有测试完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
