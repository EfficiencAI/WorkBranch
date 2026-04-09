from typing import Optional, Callable, Dict, Any

from .base import BaseSubAgent


class ReviewAgent(BaseSubAgent):
    """审查子代理"""
    
    name = "review_agent"
    description = "审查子代理 - 执行代码审查任务"
    
    system_prompt = """你是一个专业的代码审查代理。你的任务是审查代码质量、发现潜在问题并提供改进建议。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_code: 探索代码库结构
- thinking: 思考工具

请根据任务描述，仔细审查代码并给出专业的审查意见。

审查要点：
1. 代码质量和可读性
2. 潜在的 bug 和错误
3. 性能问题
4. 安全隐患
5. 最佳实践建议"""
    
    allowed_tools = ["read_file", "list_dir", "explore_code", "thinking"]
    
    def execute(self, task_description: str, context: Optional[Dict[str, Any]] = None) -> dict:
        """执行审查任务"""
        print(f"[ReviewAgent] 执行任务: {task_description[:50]}...")
        
        try:
            messages = [{"role": "user", "content": task_description}]
            result = self._call_llm(messages)
            
            print(f"[ReviewAgent] 任务完成: {len(result)} 字符")
            return {"result": result, "error": None}
        
        except Exception as e:
            print(f"[ReviewAgent] 任务失败: {e}")
            return {"result": None, "error": str(e)}
