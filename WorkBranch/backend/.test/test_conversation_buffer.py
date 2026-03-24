import sys
import os
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

print("=" * 60)
print("ConversationBuffer 单元测试")
print("=" * 60)


async def test_conversation_buffer():
    try:
        print("\n[1/7] 测试模块导入...")
        from singleton import clear_all_singletons
        clear_all_singletons()
        
        from service.session_service.conversation_buffer import (
            ConversationBuffer,
            BufferNode,
            BufferData
        )
        print("   ✓ 模块导入成功")
        
        print("\n[2/7] 测试 BufferNode 数据类...")
        node = BufferNode(
            role="user",
            content="Hello",
            parent_id=None
        )
        print(f"   ✓ BufferNode 创建成功: role={node.role}, content={node.content}")
        
        print("\n[3/7] 测试 BufferData 数据类...")
        data = BufferData(session_id=1)
        data.nodes.append(node)
        print(f"   ✓ BufferData 创建成功: session_id={data.session_id}, nodes={len(data.nodes)}")
        
        print("\n[4/7] 测试 ConversationBuffer 单例...")
        from singleton import get_conversation_buffer
        buffer = get_conversation_buffer()
        print("   ✓ ConversationBuffer 单例获取成功")
        
        print("\n[5/7] 测试 start_buffer 和 add_node...")
        conversation_id = "test-conv-001"
        await buffer.start_buffer(conversation_id, session_id=1)
        print(f"   ✓ start_buffer 成功: {conversation_id}")
        
        node1 = await buffer.add_node(conversation_id, "user", "你好")
        print(f"   ✓ add_node 成功: role={node1.role}")
        
        node2 = await buffer.add_node(conversation_id, "assistant", "你好！有什么可以帮助你的？", parent_id=0)
        print(f"   ✓ add_node 成功: role={node2.role}, parent_id={node2.parent_id}")
        
        print("\n[6/7] 测试 get_buffered_nodes...")
        nodes = await buffer.get_buffered_nodes(conversation_id)
        print(f"   ✓ get_buffered_nodes: {len(nodes)} 个节点")
        for i, n in enumerate(nodes):
            print(f"     [{i}] {n.role}: {n.content[:30]}...")
        
        print("\n[7/7] 测试 clear 和 get_active_conversations...")
        active = await buffer.get_active_conversations()
        print(f"   ✓ get_active_conversations: {len(active)} 个活跃对话")
        
        cleared = await buffer.clear(conversation_id)
        print(f"   ✓ clear: {cleared}")
        
        nodes_after_clear = await buffer.get_buffered_nodes(conversation_id)
        print(f"   ✓ clear 后节点数: {len(nodes_after_clear)}")
        
        print("\n" + "=" * 60)
        print("ConversationBuffer 所有测试通过！ ✓")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test_conversation_buffer())
