from typing import Optional, Callable

from .registry import ToolDefinition, ToolRegistry


def execute_explore_code(tool_args: dict) -> dict:
    """执行 explore_code 工具"""
    query = tool_args.get("query")
    if not query:
        return {"result": None, "error": "缺少 query 参数"}
    
    search_type = tool_args.get("search_type", "code")
    file_pattern = tool_args.get("file_pattern", "*")
    max_results = tool_args.get("max_results", 10)
    
    print(f"[Tool] explore_code: {query}, type: {search_type}")
    
    try:
        from service.codebase_service.codebase_service import CodebaseService
        
        codebase_service = CodebaseService()
        
        if search_type == "file":
            results = codebase_service.search_files(query, file_pattern, max_results)
        elif search_type == "structure":
            results = codebase_service.search_structure(query, max_results)
        else:
            results = codebase_service.search_code(query, file_pattern, max_results)
        
        if not results:
            return {"result": "未找到相关结果", "error": None}
        
        result_lines = [f"代码库搜索结果 (查询: {query}, 共 {len(results)} 项):\n"]
        
        for i, item in enumerate(results[:max_results], 1):
            if isinstance(item, dict):
                file_path = item.get("file_path", item.get("path", "未知"))
                line_num = item.get("line_number", item.get("line", ""))
                content = item.get("content", item.get("snippet", ""))
                
                result_lines.append(f"{i}. {file_path}")
                if line_num:
                    result_lines.append(f"   行: {line_num}")
                if content:
                    truncated = content[:200] + "..." if len(content) > 200 else content
                    result_lines.append(f"   内容: {truncated}")
                result_lines.append("")
            else:
                result_lines.append(f"{i}. {item}")
        
        result = "\n".join(result_lines)
        print(f"[Tool] explore_code 成功: {len(results)} 项结果")
        return {"result": result, "error": None}
    
    except ImportError:
        error_msg = "CodebaseService 未配置"
        print(f"[Tool] explore_code 失败: {error_msg}")
        return {"result": None, "error": error_msg}
    
    except Exception as e:
        print(f"[Tool] explore_code 失败: {e}")
        return {"result": None, "error": str(e)}


def execute_explore_internet(tool_args: dict) -> dict:
    """执行 explore_internet 工具 - 使用 DuckDuckGo 搜索互联网"""
    query = tool_args.get("query")
    if not query:
        return {"result": None, "error": "缺少 query 参数"}
    
    max_results = tool_args.get("max_results", 5)
    
    print(f"[Tool] explore_internet: {query}, max_results: {max_results}")
    
    try:
        from duckduckgo_search import DDGS
        
        results = []
        with DDGS() as ddgs:
            search_results = list(ddgs.text(query, max_results=max_results))
        
        if not search_results:
            return {"result": "未找到相关结果", "error": None}
        
        result_lines = [f"互联网搜索结果 (查询: {query}, 共 {len(search_results)} 项):\n"]
        
        for i, item in enumerate(search_results, 1):
            title = item.get("title", "无标题")
            href = item.get("href", "")
            body = item.get("body", "")
            
            result_lines.append(f"{i}. {title}")
            if href:
                result_lines.append(f"   链接: {href}")
            if body:
                truncated_body = body[:300] + "..." if len(body) > 300 else body
                result_lines.append(f"   摘要: {truncated_body}")
            result_lines.append("")
        
        result = "\n".join(result_lines)
        print(f"[Tool] explore_internet 成功: {len(search_results)} 项结果")
        return {"result": result, "error": None}
    
    except ImportError:
        error_msg = "duckduckgo-search 库未安装，请运行: pip install duckduckgo-search"
        print(f"[Tool] explore_internet 失败: {error_msg}")
        return {"result": None, "error": error_msg}
    
    except Exception as e:
        print(f"[Tool] explore_internet 失败: {e}")
        return {"result": None, "error": f"搜索失败: {str(e)}"}


def register_explore_tools():
    """注册探索工具"""
    tools = [
        ToolDefinition(
            name="explore_code",
            description="探索代码库",
            params="query, search_type(file/code/structure), file_pattern, max_results",
            category="explore",
            executor=execute_explore_code
        ),
        ToolDefinition(
            name="explore_internet",
            description="搜索互联网获取信息",
            params="query, max_results",
            category="explore",
            executor=execute_explore_internet
        ),
    ]
    
    for tool in tools:
        ToolRegistry.register(tool)
