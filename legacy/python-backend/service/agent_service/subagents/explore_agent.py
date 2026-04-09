from typing import Optional, Callable, Dict, Any

from .base import BaseSubAgent


class ExploreAgent(BaseSubAgent):
    """探索子代理"""
    
    name = "explore_agent"
    description = "探索子代理 - 执行代码探索和互联网搜索任务"
    
    system_prompt = """你是一个专业的代码探索代理。你的任务是帮助用户探索和分析代码库或搜索互联网信息。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_internet: 搜索互联网获取信息
- thinking: 思考工具

请根据任务描述，使用合适的工具完成任务，并给出清晰的分析结果。"""
    
    allowed_tools = ["read_file", "list_dir", "explore_internet", "thinking"]
    
    def execute(self, task_description: str, context: Optional[Dict[str, Any]] = None) -> dict:
        """执行探索任务"""
        print(f"[ExploreAgent] 执行任务: {task_description[:50]}...")
        
        try:
            messages = [{"role": "user", "content": task_description}]
            result = self._call_llm(messages)
            
            print(f"[ExploreAgent] 任务完成: {len(result)} 字符")
            return {"result": result, "error": None}
        
        except Exception as e:
            print(f"[ExploreAgent] 任务失败: {e}")
            return {"result": None, "error": str(e)}
