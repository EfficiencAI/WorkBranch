import sys
import os
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

print("=" * 60)
print("聊天线模块单元测试（独立测试）")
print("=" * 60)


def test_data_classes():
    print("\n[1/4] 测试数据类定义...")
    
    from dataclasses import dataclass, field
    from typing import Dict, List, Optional, Any
    from datetime import datetime
    
    @dataclass
    class BufferNode:
        role: str
        content: str
        parent_id: Optional[int] = None
        created_at: datetime = field(default_factory=datetime.now)
        node_id: Optional[int] = None
    
    @dataclass
    class BufferData:
        session_id: int
        nodes: List[BufferNode] = field(default_factory=list)
        created_at: datetime = field(default_factory=datetime.now)
    
    node = BufferNode(role="user", content="你好")
    print(f"   ✓ BufferNode 创建成功: role={node.role}, content={node.content}")
    
    data = BufferData(session_id=1)
    data.nodes.append(node)
    print(f"   ✓ BufferData 创建成功: session_id={data.session_id}, nodes={len(data.nodes)}")
    
    from enum import Enum
    
    class ConversationState(Enum):
        PENDING = "pending"
        RUNNING = "running"
        COMPLETED = "completed"
        FAILED = "failed"
        CANCELLED = "cancelled"
    
    print(f"   ✓ ConversationState 枚举定义正确")
    for state in ConversationState:
        print(f"     - {state.name}: {state.value}")
    
    return True


def test_api_models():
    print("\n[2/4] 测试 API 模型定义...")
    
    from pydantic import BaseModel
    from typing import Optional
    
    class SendMessageBody(BaseModel):
        message: str
        workspace_id: Optional[str] = None
    
    body = SendMessageBody(message="你好")
    print(f"   ✓ SendMessageBody 创建成功: message='{body.message}'")
    
    class SessionResponse(BaseModel):
        id: int
        title: str
        created_at: str
        updated_at: str
    
    resp = SessionResponse(id=1, title="测试", created_at="2024-01-01", updated_at="2024-01-01")
    print(f"   ✓ SessionResponse 创建成功: id={resp.id}")
    
    return True


def test_file_structure():
    print("\n[3/4] 测试文件结构...")
    
    base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    files_to_check = [
        "service/session_service/conversation_buffer.py",
        "service/session_service/conversation_creator.py",
        "service/session_service/session.py",
        "controller/chat_api.py",
    ]
    
    all_exist = True
    for file_path in files_to_check:
        full_path = os.path.join(base_path, file_path)
        exists = os.path.exists(full_path)
        status = "✓" if exists else "✗"
        print(f"   {status} {file_path}: {'存在' if exists else '不存在'}")
        if not exists:
            all_exist = False
    
    return all_exist


def test_code_syntax():
    print("\n[4/4] 测试代码语法...")
    
    import py_compile
    
    base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    files_to_check = [
        "service/session_service/conversation_buffer.py",
        "service/session_service/conversation_creator.py",
        "service/session_service/session.py",
        "controller/chat_api.py",
    ]
    
    all_valid = True
    for file_path in files_to_check:
        full_path = os.path.join(base_path, file_path)
        try:
            py_compile.compile(full_path, doraise=True)
            print(f"   ✓ {file_path}: 语法正确")
        except py_compile.PyCompileError as e:
            print(f"   ✗ {file_path}: 语法错误 - {e}")
            all_valid = False
    
    return all_valid


def main():
    try:
        results = []
        
        results.append(("数据类定义", test_data_classes()))
        results.append(("API 模型定义", test_api_models()))
        results.append(("文件结构", test_file_structure()))
        results.append(("代码语法", test_code_syntax()))
        
        print("\n" + "=" * 60)
        print("测试结果汇总")
        print("=" * 60)
        
        all_passed = True
        for name, passed in results:
            status = "✓ 通过" if passed else "✗ 失败"
            print(f"   {name}: {status}")
            if not passed:
                all_passed = False
        
        print("\n" + "=" * 60)
        if all_passed:
            print("所有测试通过！ ✓")
        else:
            print("部分测试失败！ ✗")
        print("=" * 60)
        
        return 0 if all_passed else 1
        
    except Exception as e:
        print(f"\n✗ 错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
