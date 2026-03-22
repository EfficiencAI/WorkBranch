import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

print("=" * 60)
print("用户线完整功能测试")
print("=" * 60)

try:
    print("\n[1/6] 测试 singleton 模块导入...")
    from singleton import (
        get_settings_service,
        get_database,
        get_user_service,
        get_session_history,
        get_user_info_dao
    )
    print("   ✓ singleton 模块导入成功")
    
    print("\n[2/6] 测试 SettingsService...")
    settings = get_settings_service()
    print("   ✓ get_settings_service() 调用成功")
    db_path = settings.get("database:path")
    print(f"   ✓ 数据库路径配置: {db_path}")
    
    print("\n[3/6] 测试 Database...")
    db = get_database()
    print("   ✓ get_database() 调用成功")
    
    print("\n[4/6] 测试 UserInfoDAO...")
    from data.user_info_dao import UserInfoDAO
    dao = UserInfoDAO()
    print("   ✓ UserInfoDAO 实例化成功")
    
    user = dao.get_or_create_default_user()
    print(f"   ✓ get_or_create_default_user(): id={user.id}, name='{user.name}'")
    
    print("\n[5/6] 测试 UserService...")
    user_service = get_user_service()
    print("   ✓ UserService 实例化成功")
    
    current_user = user_service.get_current_user()
    print(f"   ✓ get_current_user(): id={current_user.id}, name='{current_user.name}'")
    
    updated_user = user_service.update_user_name("测试用户")
    print(f"   ✓ update_user_name(): id={updated_user.id}, name='{updated_user.name}'")
    
    user_service.update_user_name("Local User")
    print(f"   ✓ 恢复用户名: 'Local User'")
    
    print("\n[6/6] 测试 SessionHistory...")
    session_service = get_session_history()
    print("   ✓ SessionHistory 实例化成功")
    
    sessions = session_service.list_sessions()
    print(f"   ✓ list_sessions(): {len(sessions)} 个会话")
    
    new_session = session_service.create_session("测试会话 - 1")
    print(f"   ✓ create_session(): id={new_session.id}, title='{new_session.title}'")
    
    new_session2 = session_service.create_session("测试会话 - 2")
    print(f"   ✓ create_session(): id={new_session2.id}, title='{new_session2.title}'")
    
    session_detail = session_service.get_session(new_session.id)
    print(f"   ✓ get_session(): id={session_detail.id}, title='{session_detail.title}'")
    
    updated_sessions = session_service.list_sessions()
    print(f"   ✓ 会话列表已更新: {len(updated_sessions)} 个会话")
    
    print("\n   会话列表:")
    for s in updated_sessions:
        print(f"     - [{s.id}] {s.title} (更新于: {s.updated_at})")
    
    session_service.delete_session(new_session.id)
    print(f"   ✓ delete_session(): id={new_session.id}")
    
    session_service.delete_session(new_session2.id)
    print(f"   ✓ delete_session(): id={new_session2.id}")
    
    final_sessions = session_service.list_sessions()
    print(f"   ✓ 会话列表已恢复: {len(final_sessions)} 个会话")
    
    print("\n" + "=" * 60)
    print("用户线所有功能测试通过！ ✓")
    print("=" * 60)
    
except Exception as e:
    print(f"\n✗ 错误: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
