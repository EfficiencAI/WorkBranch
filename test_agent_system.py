#!/usr/bin/env python3
"""
测试新的Agent系统
"""

import asyncio
from WorkBranch.backend.service.agent_service import AgentService

async def test_agent_system():
    """测试Agent系统"""
    print("=" * 60)
    print("测试新的Agent系统")
    print("=" * 60)
    
    # 创建Agent服务
    agent_service = AgentService()
    
    # 测试1: 创建对话
    print("\n1. 测试创建对话")
    conv_id = await agent_service.create_conversation()
    print(f"创建对话成功，ID: {conv_id}")
    
    # 测试2: 发送简单任务
    print("\n2. 测试发送简单任务")
    simple_task = "读取当前目录下的文件列表"
    task = await agent_service.send_message(conv_id, simple_task)
    result = await task
    print(f"简单任务执行完成: {result}")
    
    # 测试3: 发送复杂任务
    print("\n3. 测试发送复杂任务")
    complex_task = "实现一个简单的计算器函数，支持加减乘除运算"
    task = await agent_service.send_message(conv_id, complex_task)
    result = await task
    print(f"复杂任务执行完成: {result}")
    
    # 测试4: 获取对话状态
    print("\n4. 测试获取对话状态")
    status = agent_service.get_status(conv_id)
    print(f"对话状态: {status}")
    
    # 测试5: 列出所有对话
    print("\n5. 测试列出所有对话")
    conversations = agent_service.list_conversations()
    print(f"对话数量: {len(conversations)}")
    
    print("\n" + "=" * 60)
    print("Agent系统测试完成！")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_agent_system())
