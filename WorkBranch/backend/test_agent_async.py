import sys
import asyncio
sys.path.insert(0, '.')

from service.agent_service import AgentService, ConversationStatus
from service.agent_service.service import WorkspaceService, get_llm_service
from service.settings_service.settings_service import SettingsService


async def test_concurrent_conversations():
    print("="*60)
    print("测试异步并发对话")
    print("="*60)
    
    settings = SettingsService()
    llm = get_llm_service(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm)
    
    print("\n[测试] 创建 3 个对话...")
    conv1 = await agent.create_conversation()
    conv2 = await agent.create_conversation()
    conv3 = await agent.create_conversation()
    
    print(f"[测试] 对话1: {conv1}")
    print(f"[测试] 对话2: {conv2}")
    print(f"[测试] 对话3: {conv3}")
    
    print("\n[测试] 同时发送 3 个消息（并发执行）...")
    
    task1 = await agent.send_message(conv1, "写一个计算两数之和的 Python 函数")
    task2 = await agent.send_message(conv2, "写一个计算阶乘的 Python 函数")
    task3 = await agent.send_message(conv3, "写一个判断素数的 Python 函数")
    
    print("\n[测试] 所有对话已启动，正在并发执行...")
    print(f"[测试] 对话1 状态: {agent.get_status(conv1)['status']}")
    print(f"[测试] 对话2 状态: {agent.get_status(conv2)['status']}")
    print(f"[测试] 对话3 状态: {agent.get_status(conv3)['status']}")
    
    print("\n[测试] 等待所有对话完成...")
    results = await asyncio.gather(task1, task2, task3, return_exceptions=True)
    
    print("\n[测试] 所有对话执行完成！")
    print(f"[测试] 对话1 状态: {agent.get_status(conv1)['status']}")
    print(f"[测试] 对话2 状态: {agent.get_status(conv2)['status']}")
    print(f"[测试] 对话3 状态: {agent.get_status(conv3)['status']}")
    
    print("\n[测试] 列出所有对话:")
    for conv in agent.list_conversations():
        print(f"  - {conv['id'][:8]}... | 状态: {conv['status']} | 消息数: {conv['message_count']}")
    
    return results


async def test_new_agent_async():
    print("\n" + "="*60)
    print("测试 new_agent_async 快捷方法")
    print("="*60)
    
    settings = SettingsService()
    llm = get_llm_service(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm)
    
    print("\n[测试] 使用 new_agent_async 创建并执行对话...")
    task = await agent.new_agent_async("写一个冒泡排序算法")
    
    print("[测试] 对话已启动，等待完成...")
    result = await task
    
    print(f"[测试] 执行完成，结果类型: {type(result)}")
    return result


async def test_cancel_conversation():
    print("\n" + "="*60)
    print("测试取消对话")
    print("="*60)
    
    settings = SettingsService()
    llm = get_llm_service(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm)
    
    conv_id = await agent.create_conversation()
    print(f"[测试] 创建对话: {conv_id}")
    
    task = await agent.send_message(conv_id, "写一个非常复杂的算法，需要很长时间")
    print(f"[测试] 对话状态: {agent.get_status(conv_id)['status']}")
    
    print("[测试] 尝试取消对话...")
    cancelled = agent.cancel_conversation(conv_id)
    print(f"[测试] 取消结果: {cancelled}")
    
    await asyncio.sleep(0.1)
    print(f"[测试] 取消后状态: {agent.get_status(conv_id)['status']}")


async def test_send_message_and_wait():
    print("\n" + "="*60)
    print("测试 send_message_and_wait 阻塞方法")
    print("="*60)
    
    settings = SettingsService()
    llm = get_llm_service(settings)
    ws = WorkspaceService()
    agent = AgentService(ws, llm)
    
    conv_id = await agent.create_conversation()
    print(f"[测试] 创建对话: {conv_id}")
    
    print("[测试] 发送消息并等待完成...")
    result = await agent.send_message_and_wait(conv_id, "写一个斐波那契数列函数")
    
    print(f"[测试] 完成，状态: {agent.get_status(conv_id)['status']}")
    return result


async def main():
    print("\n" + "#"*60)
    print("# Agent 异步并发测试")
    print("#"*60)
    
    try:
        await test_concurrent_conversations()
        await test_new_agent_async()
        await test_cancel_conversation()
        await test_send_message_and_wait()
        
        print("\n" + "#"*60)
        print("# 所有测试完成！")
        print("#"*60)
    except Exception as e:
        print(f"\n[错误] 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
