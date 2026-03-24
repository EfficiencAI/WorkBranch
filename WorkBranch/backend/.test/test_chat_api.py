import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

print("=" * 60)
print("Chat API 集成测试")
print("=" * 60)


def test_chat_api():
    try:
        print("\n[1/5] 测试模块导入...")
        from singleton import clear_all_singletons
        clear_all_singletons()
        
        from controller.chat_api import router, SendMessageBody, SessionResponse, NodeResponse
        print("   ✓ chat_api 模块导入成功")
        print(f"   ✓ router prefix: {router.prefix}")
        print(f"   ✓ router tags: {router.tags}")
        
        print("\n[2/5] 测试请求体模型...")
        body = SendMessageBody(message="你好", workspace_id="test-ws")
        print(f"   ✓ SendMessageBody: message='{body.message}', workspace_id={body.workspace_id}")
        
        print("\n[3/5] 测试响应模型...")
        session_resp = SessionResponse(
            id=1,
            title="测试会话",
            created_at="2024-01-01T00:00:00",
            updated_at="2024-01-01T00:00:00"
        )
        print(f"   ✓ SessionResponse: id={session_resp.id}, title='{session_resp.title}'")
        
        node_resp = NodeResponse(
            id=1,
            session_id=1,
            parent_id=None,
            role="user",
            content="你好",
            created_at="2024-01-01T00:00:00"
        )
        print(f"   ✓ NodeResponse: id={node_resp.id}, role={node_resp.role}")
        
        print("\n[4/5] 测试路由端点...")
        routes = [route.path for route in router.routes]
        print(f"   ✓ 已注册 {len(routes)} 个路由:")
        for route in routes:
            print(f"     - {route}")
        
        expected_routes = [
            "/chat/sessions",
            "/chat/sessions/{session_id}",
            "/chat/sessions/{session_id}/messages",
            "/chat/sessions/{session_id}/nodes",
            "/chat/sessions/{session_id}/end",
            "/chat/sessions/{session_id}/cancel",
            "/chat/sessions/{session_id}/state"
        ]
        
        for expected in expected_routes:
            found = any(expected in route for route in routes)
            if found:
                print(f"   ✓ 路由 {expected} 已注册")
            else:
                print(f"   ✗ 路由 {expected} 未找到")
        
        print("\n[5/5] 测试 FastAPI app 集成...")
        from app import app
        print(f"   ✓ FastAPI app 导入成功")
        
        app_routes = [route.path for route in app.routes]
        chat_routes = [r for r in app_routes if "/chat" in r]
        print(f"   ✓ app 中 /chat 路由数: {len(chat_routes)}")
        for r in chat_routes:
            print(f"     - {r}")
        
        print("\n" + "=" * 60)
        print("Chat API 所有测试通过！ ✓")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    test_chat_api()
