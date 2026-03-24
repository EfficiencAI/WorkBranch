import sys
import os
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

print("=" * 60)
print("SessionService 单元测试")
print("=" * 60)


async def test_session_service():
    try:
        print("\n[1/6] 测试模块导入...")
        from singleton import clear_all_singletons
        clear_all_singletons()
        
        from service.session_service.session import SessionService
        print("   ✓ 模块导入成功")
        
        print("\n[2/6] 测试 SessionService 单例获取...")
        from singleton import get_session_service
        service = get_session_service()
        print("   ✓ SessionService 单例获取成功")
        
        print("\n[3/6] 测试 create_session...")
        session = service.create_session("测试会话 - SessionService")
        print(f"   ✓ create_session 成功: id={session.id}, title='{session.title}'")
        
        print("\n[4/6] 测试 list_sessions 和 get_session...")
        sessions = service.list_sessions()
        print(f"   ✓ list_sessions: {len(sessions)} 个会话")
        
        session_detail = service.get_session(session.id)
        print(f"   ✓ get_session: id={session_detail.id}, title='{session_detail.title}'")
        
        print("\n[5/6] 测试 get_nodes...")
        nodes = service.get_nodes(session.id)
        print(f"   ✓ get_nodes: {len(nodes)} 个节点")
        
        print("\n[6/6] 测试 delete_session...")
        service.delete_session(session.id)
        print(f"   ✓ delete_session: id={session.id}")
        
        deleted_session = service.get_session(session.id)
        if deleted_session is None:
            print("   ✓ 会话已成功删除")
        
        print("\n[7/7] 测试辅助方法...")
        has_active = service.has_active_conversation(999)
        print(f"   ✓ has_active_conversation(999): {has_active}")
        
        conv_id = service.get_active_conversation_id(999)
        print(f"   ✓ get_active_conversation_id(999): {conv_id}")
        
        state = service.get_conversation_state(999)
        print(f"   ✓ get_conversation_state(999): {state}")
        
        print("\n" + "=" * 60)
        print("SessionService 所有测试通过！ ✓")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test_session_service())
