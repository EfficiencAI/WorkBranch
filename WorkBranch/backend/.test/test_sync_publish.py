import sys
import asyncio
sys.path.insert(0, '.')

from service.session_service.mq import MessageQueue, StreamMessage, MessageType
from service.settings_service.settings_service import SettingsService


async def test_sync_publish():
    print("=" * 60)
    print("测试同步发布功能")
    print("=" * 60)

    settings = SettingsService()
    mq = MessageQueue(settings)

    await mq.start_consumer()
    print("[测试] 消息队列消费者已启动")

    tokens = ["Hello", ", ", "World", "!"]
    for token in tokens:
        msg = StreamMessage(
            session_id="test-session",
            conversation_id="test-conv",
            workspace_id="test-ws",
            content=token,
            message_type=MessageType.TEXT
        )
        result = mq.publish_sync(msg)
        print(f"[测试] 同步发布 token '{token}': {'成功' if result else '失败'}")

    done_msg = StreamMessage(
        session_id="test-session",
        conversation_id="test-conv",
        workspace_id="test-ws",
        content="",
        message_type=MessageType.DONE
    )
    mq.publish_sync(done_msg)
    print("[测试] 发布 DONE 消息")

    await asyncio.sleep(1.0)

    print(f"[测试] 当前队列大小: {mq.size}")

    await mq.stop_consumer()
    print("[测试] 测试完成")


if __name__ == "__main__":
    asyncio.run(test_sync_publish())
