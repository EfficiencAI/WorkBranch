import sys
import os
import tempfile
import shutil
sys.path.insert(0, '.')

from service.agent_service.service import WorkspaceService
from service.agent_service.graph.subgraphs.tool_execution_graph import (
    run_tool_execution,
    _execute_read_file,
    _execute_write_file,
    _execute_delete_file,
    _execute_list_dir,
    _execute_create_dir
)


def test_file_tools_with_workspace():
    print("=" * 60)
    print("测试文件操作工具 - 带工作区权限验证")
    print("=" * 60)
    
    ws = WorkspaceService(base_dir=tempfile.mkdtemp())
    
    workspace_id = ws.register("test_ws", "test_session")
    workspace_dir = ws.get_workspace_dir(workspace_id)
    print(f"[测试] 工作区ID: {workspace_id}")
    print(f"[测试] 工作区路径: {workspace_dir}")
    
    print("\n--- 测试 create_dir ---")
    result = run_tool_execution(
        tool_name="create_dir",
        tool_args={"directory": "test_subdir"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    assert result["error"] is None, "create_dir 应该成功"
    assert os.path.exists(os.path.join(workspace_dir, "test_subdir")), "目录应该存在"
    
    print("\n--- 测试 write_file ---")
    result = run_tool_execution(
        tool_name="write_file",
        tool_args={"file_path": "test_subdir/test.txt", "content": "Hello, World!\n这是测试内容。"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    assert result["error"] is None, "write_file 应该成功"
    
    print("\n--- 测试 read_file ---")
    result = run_tool_execution(
        tool_name="read_file",
        tool_args={"file_path": "test_subdir/test.txt"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    assert result["error"] is None, "read_file 应该成功"
    assert "Hello, World!" in result["result"], "内容应该包含测试文本"
    
    print("\n--- 测试 list_dir ---")
    result = run_tool_execution(
        tool_name="list_dir",
        tool_args={"directory": "test_subdir"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    assert result["error"] is None, "list_dir 应该成功"
    assert "test.txt" in result["result"], "应该列出 test.txt"
    
    print("\n--- 测试 delete_file ---")
    result = run_tool_execution(
        tool_name="delete_file",
        tool_args={"file_path": "test_subdir/test.txt"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    assert result["error"] is None, "delete_file 应该成功"
    assert not os.path.exists(os.path.join(workspace_dir, "test_subdir/test.txt")), "文件应该被删除"
    
    print("\n" + "=" * 60)
    print("测试权限验证 - 尝试越界访问")
    print("=" * 60)
    
    print("\n--- 测试越界读取 ---")
    result = run_tool_execution(
        tool_name="read_file",
        tool_args={"file_path": "../outside_workspace.txt"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    assert result["error"] is not None, "越界访问应该被拒绝"
    
    print("\n--- 测试绝对路径越界 ---")
    result = run_tool_execution(
        tool_name="read_file",
        tool_args={"file_path": "/etc/passwd"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    assert result["error"] is not None, "绝对路径越界应该被拒绝"
    
    print("\n" + "=" * 60)
    print("测试高级功能")
    print("=" * 60)
    
    print("\n--- 测试 write_file 追加模式 ---")
    run_tool_execution(
        tool_name="write_file",
        tool_args={"file_path": "append_test.txt", "content": "第一行\n"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    result = run_tool_execution(
        tool_name="write_file",
        tool_args={"file_path": "append_test.txt", "content": "第二行\n", "mode": "append"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"结果: {result}")
    
    result = run_tool_execution(
        tool_name="read_file",
        tool_args={"file_path": "append_test.txt"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"追加后内容:\n{result['result']}")
    assert "第一行" in result["result"] and "第二行" in result["result"]
    
    print("\n--- 测试 read_file 行范围 ---")
    run_tool_execution(
        tool_name="write_file",
        tool_args={"file_path": "lines_test.txt", "content": "\n".join([f"Line {i}" for i in range(1, 11)])},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    result = run_tool_execution(
        tool_name="read_file",
        tool_args={"file_path": "lines_test.txt", "start_line": 3, "end_line": 5},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"读取第3-5行:\n{result['result']}")
    assert "Line 3" in result["result"] and "Line 5" in result["result"]
    assert "Line 1" not in result["result"] and "Line 6" not in result["result"]
    
    print("\n--- 测试 list_dir 递归 ---")
    run_tool_execution(
        tool_name="create_dir",
        tool_args={"directory": "deep/nested/dir"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    run_tool_execution(
        tool_name="write_file",
        tool_args={"file_path": "deep/nested/dir/file.txt", "content": "deep file"},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    result = run_tool_execution(
        tool_name="list_dir",
        tool_args={"directory": "deep", "recursive": True},
        workspace_id=workspace_id,
        workspace_service=ws
    )
    print(f"递归列出目录:\n{result['result']}")
    
    shutil.rmtree(ws.base_dir)
    
    print("\n" + "=" * 60)
    print("所有测试通过!")
    print("=" * 60)


if __name__ == "__main__":
    test_file_tools_with_workspace()
