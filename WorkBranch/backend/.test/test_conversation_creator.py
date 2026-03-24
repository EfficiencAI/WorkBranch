import sys
import os
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

print("=" * 60)
print("ConversationCreator 单元测试")
print("=" * 60)


async def test_conversation_creator():
    try:
        print("\n[1/5] 测试模块导入...")
        from singleton import clear_all_singletons
        clear_all_singletons()
        
        from service.session_service.conversation_creator import (
            ConversationCreator,
            ConversationState,
            ConversationInfo
        )
        print("   ✓ 模块导入成功")
        
        print("\n[2/5] 测试 ConversationState 枚举...")
        for state in ConversationState:
            print(f"   ✓ ConversationState.{state.name} = '{state.value}'")
        
        print("\n[3/5] 测试 ConversationInfo 数据类...")
        info = ConversationInfo(
            conversation_id="test-conv-001",
            session_id=1,
            workspace_id="ws-001"
        )
        print(f"   ✓ ConversationInfo 创建成功: conversation_id={info.conversation_id}")
        print(f"     - session_id: {info.session_id}")
        print(f"     - workspace_id: {info.workspace_id}")
        print(f"     - state: {info.state}")
        
        print("\n[4/5] 测试 ConversationCreator 单例获取...")
        from singleton import get_conversation_creator
        creator = get_conversation_creator()
        print("   ✓ ConversationCreator 单例获取成功")
        
        print("\n[5/5] 测试 get_state 和 list_conversations...")
        state = creator.get_state("non-existent-conv")
        if state is None:
            print("   ✓ get_state 对不存在的对话返回 None")
        
        conversations = await creator.list_conversations()
        print(f"   ✓ list_conversations: {len(conversations)} 个对话")
        
        is_running = creator.is_conversation_running("non-existent-conv")
        print(f"   ✓ is_conversation_running: {is_running}")
        
        print("\n" + "=" * 60)
        print("ConversationCreator 所有测试通过！ ✓")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test_conversation_creator())
