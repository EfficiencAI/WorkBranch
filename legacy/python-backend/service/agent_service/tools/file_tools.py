import os
import shutil
from typing import Optional, Callable

from .registry import ToolDefinition, ToolRegistry


def execute_read_file(tool_args: dict) -> dict:
    """执行 read_file 工具"""
    file_path = tool_args.get("file_path") or tool_args.get("path")
    if not file_path:
        return {"result": None, "error": "缺少 file_path 参数"}
    
    encoding = tool_args.get("encoding", "utf-8")
    start_line = tool_args.get("start_line", 1)
    end_line = tool_args.get("end_line")
    
    print(f"[Tool] read_file: {file_path}")
    
    try:
        if not os.path.exists(file_path):
            return {"result": None, "error": f"文件不存在: {file_path}"}
        
        if not os.path.isfile(file_path):
            return {"result": None, "error": f"路径不是文件: {file_path}"}
        
        with open(file_path, "r", encoding=encoding) as f:
            lines = f.readlines()
        
        start_idx = max(0, start_line - 1)
        end_idx = end_line if end_line else len(lines)
        
        selected_lines = lines[start_idx:end_idx]
        result = "".join(selected_lines)
        
        print(f"[Tool] read_file 成功: {len(selected_lines)} 行")
        return {"result": result, "error": None}
    
    except Exception as e:
        print(f"[Tool] read_file 失败: {e}")
        return {"result": None, "error": str(e)}


def execute_write_file(tool_args: dict) -> dict:
    """执行 write_file 工具"""
    file_path = tool_args.get("file_path") or tool_args.get("path")
    if not file_path:
        return {"result": None, "error": "缺少 file_path 参数"}
    
    content = tool_args.get("content", "")
    mode = tool_args.get("mode", "write")
    encoding = tool_args.get("encoding", "utf-8")
    
    print(f"[Tool] write_file: {file_path}, mode: {mode}")
    
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        write_mode = "a" if mode == "append" else "w"
        
        with open(file_path, write_mode, encoding=encoding) as f:
            f.write(content)
        
        print(f"[Tool] write_file 成功")
        return {"result": f"文件写入成功: {file_path}", "error": None}
    
    except Exception as e:
        print(f"[Tool] write_file 失败: {e}")
        return {"result": None, "error": str(e)}


def execute_delete_file(tool_args: dict) -> dict:
    """执行 delete_file 工具"""
    file_path = tool_args.get("file_path") or tool_args.get("path")
    if not file_path:
        return {"result": None, "error": "缺少 file_path 参数"}
    
    print(f"[Tool] delete_file: {file_path}")
    
    try:
        if not os.path.exists(file_path):
            return {"result": None, "error": f"路径不存在: {file_path}"}
        
        if os.path.isfile(file_path):
            os.remove(file_path)
            print(f"[Tool] delete_file 成功: 删除文件")
            return {"result": f"文件删除成功: {file_path}", "error": None}
        elif os.path.isdir(file_path):
            shutil.rmtree(file_path)
            print(f"[Tool] delete_file 成功: 删除目录")
            return {"result": f"目录删除成功: {file_path}", "error": None}
        else:
            return {"result": None, "error": f"未知类型: {file_path}"}
    
    except Exception as e:
        print(f"[Tool] delete_file 失败: {e}")
        return {"result": None, "error": str(e)}


def execute_list_dir(tool_args: dict) -> dict:
    """执行 list_dir 工具"""
    directory = tool_args.get("directory") or tool_args.get("path", ".")
    recursive = tool_args.get("recursive", False)
    
    print(f"[Tool] list_dir: {directory}, recursive: {recursive}")
    
    try:
        if not os.path.exists(directory):
            return {"result": None, "error": f"目录不存在: {directory}"}
        
        if not os.path.isdir(directory):
            return {"result": None, "error": f"路径不是目录: {directory}"}
        
        result_lines = []
        
        if recursive:
            for root, dirs, files in os.walk(directory):
                level = root.replace(directory, "").count(os.sep)
                indent = " " * 2 * level
                result_lines.append(f"{indent}{os.path.basename(root)}/")
                sub_indent = " " * 2 * (level + 1)
                for file in files:
                    result_lines.append(f"{sub_indent}{file}")
        else:
            items = os.listdir(directory)
            for item in sorted(items):
                item_path = os.path.join(directory, item)
                if os.path.isdir(item_path):
                    result_lines.append(f"{item}/")
                else:
                    result_lines.append(item)
        
        result = "\n".join(result_lines)
        print(f"[Tool] list_dir 成功: {len(result_lines)} 项")
        return {"result": result, "error": None}
    
    except Exception as e:
        print(f"[Tool] list_dir 失败: {e}")
        return {"result": None, "error": str(e)}


def execute_create_dir(tool_args: dict) -> dict:
    """执行 create_dir 工具"""
    directory = tool_args.get("directory") or tool_args.get("path")
    if not directory:
        return {"result": None, "error": "缺少 directory 参数"}
    
    print(f"[Tool] create_dir: {directory}")
    
    try:
        os.makedirs(directory, exist_ok=True)
        print(f"[Tool] create_dir 成功")
        return {"result": f"目录创建成功: {directory}", "error": None}
    
    except Exception as e:
        print(f"[Tool] create_dir 失败: {e}")
        return {"result": None, "error": str(e)}


def register_file_tools():
    """注册文件工具"""
    tools = [
        ToolDefinition(
            name="read_file",
            description="读取文件内容",
            params="file_path, start_line, end_line",
            category="file",
            executor=execute_read_file
        ),
        ToolDefinition(
            name="write_file",
            description="写入文件",
            params="file_path, content, mode(write/append)",
            category="file",
            executor=execute_write_file
        ),
        ToolDefinition(
            name="delete_file",
            description="删除文件或目录",
            params="file_path",
            category="file",
            executor=execute_delete_file
        ),
        ToolDefinition(
            name="list_dir",
            description="列出目录内容",
            params="directory, recursive",
            category="file",
            executor=execute_list_dir
        ),
        ToolDefinition(
            name="create_dir",
            description="创建目录",
            params="directory",
            category="file",
            executor=execute_create_dir
        ),
    ]
    
    for tool in tools:
        ToolRegistry.register(tool)
