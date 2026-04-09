import asyncio
from typing import Dict, Any, Optional
from .registry import ToolRegistry
from ..agents.registry import AgentRegistry
from ..agents.runner import AgentRunner


class ToolExecutor:
    """工具执行器 - 支持模式切换和子 Agent"""
    
    def __init__(self, llm_service=None, agent_service=None):
        self.llm_service = llm_service
        self.agent_service = agent_service
        self.agent_registry = AgentRegistry()
        self.active_agents: Dict[str, AgentRunner] = {}
        self.current_mode = "normal"  # normal, plan
        self.current_plan = []
    
    async def execute(self, tool_name: str, args: dict, context: dict) -> dict:
        """执行工具"""
        
        # 模式切换工具
        if tool_name == "enter_plan_mode":
            return await self._enter_plan_mode(args, context)
        
        if tool_name == "exit_plan_mode":
            return await self._exit_plan_mode(context)
        
        if tool_name == "update_plan":
            return await self._update_plan(args, context)
        
        if tool_name == "execute_plan":
            return await self._execute_plan(context)
        
        # Agent 工具
        if tool_name == "spawn_agent":
            return await self._spawn_agent(args, context)
        
        if tool_name == "send_message_to_agent":
            return await self._send_message(args, context)
        
        if tool_name == "stop_agent":
            return await self._stop_agent(args, context)
        
        if tool_name == "list_agents":
            return await self._list_agents(context)
        
        # TODO 工具
        if tool_name.startswith("todo_"):
            return await self._execute_todo_tool(tool_name, args, context)
        
        # 普通工具
        tool = ToolRegistry().get(tool_name)
        if tool and tool.executor:
            return await tool.executor(**args)
        
        return {"error": f"Unknown tool: {tool_name}"}
    
    async def _enter_plan_mode(self, args: dict, context: dict) -> dict:
        """进入规划模式"""
        task_description = args.get("task_description", "")
        max_steps = args.get("max_steps", 5)
        
        self.current_mode = "plan"
        
        # 生成初始规划
        from ..graph.subgraphs.plan_graph import generate_plan
        
        plan = await generate_plan(
            task_description,
            llm_service=self.llm_service,
            max_steps=max_steps
        )
        
        self.current_plan = plan
        
        return {
            "status": "entered_plan_mode",
            "plan": plan,
            "message": f"已进入规划模式，生成了 {len(plan)} 个步骤"
        }
    
    async def _exit_plan_mode(self, context: dict) -> dict:
        """退出规划模式"""
        self.current_mode = "normal"
        self.current_plan = []
        
        return {
            "status": "exited_plan_mode",
            "message": "已退出规划模式"
        }
    
    async def _update_plan(self, args: dict, context: dict) -> dict:
        """更新规划"""
        tasks = args.get("tasks", [])
        self.current_plan = tasks
        
        return {
            "status": "plan_updated",
            "plan": tasks,
            "message": f"规划已更新，包含 {len(tasks)} 个任务"
        }
    
    async def _execute_plan(self, context: dict) -> dict:
        """执行规划"""
        results = []
        
        for i, task in enumerate(self.current_plan, 1):
            print(f"执行任务 {i}/{len(self.current_plan)}: {task['description']}")
            
            # 执行任务
            if task.get("tool"):
                tool_result = await self.execute(
                    task["tool"],
                    task.get("args", {}),
                    context
                )
                results.append({
                    "task": task,
                    "result": tool_result
                })
            else:
                # 思考任务
                results.append({
                    "task": task,
                    "result": {"status": "completed", "message": "思考完成"}
                })
        
        return {
            "status": "plan_executed",
            "results": results,
            "message": f"规划执行完成，共 {len(results)} 个任务"
        }
    
    async def _spawn_agent(self, args: dict, context: dict) -> dict:
        """启动子 Agent"""
        agent_type = args.get("agent_type", "general-purpose")
        task = args.get("task_description", "")
        background = args.get("background", False)
        
        agent_def = self.agent_registry.get(agent_type)
        if not agent_def:
            return {"error": f"Unknown agent type: {agent_type}"}
        
        # 创建 Agent 实例
        agent = AgentRunner(
            definition=agent_def,
            llm_service=self.llm_service
        )
        
        self.active_agents[agent.agent_id] = agent
        
        if background:
            # 后台执行
            asyncio.create_task(agent.run(task, context))
            return {
                "status": "async_launched",
                "agent_id": agent.agent_id,
                "message": f"Agent {agent_type} 已在后台启动"
            }
        else:
            # 同步执行
            result = await agent.run(task, context)
            del self.active_agents[agent.agent_id]
            return result
    
    async def _send_message(self, args: dict, context: dict) -> dict:
        """向子 Agent 发送消息"""
        agent_id = args.get("agent_id")
        message = args.get("message", "")
        
        agent = self.active_agents.get(agent_id)
        if not agent:
            return {"error": f"Agent not found: {agent_id}"}
        
        # 继续执行
        result = await agent.run(message, context)
        return result
    
    async def _stop_agent(self, args: dict, context: dict) -> dict:
        """停止子 Agent"""
        agent_id = args.get("agent_id")
        
        if agent_id in self.active_agents:
            del self.active_agents[agent_id]
            return {
                "status": "agent_stopped",
                "message": f"Agent {agent_id} 已停止"
            }
        
        return {"error": f"Agent not found: {agent_id}"}
    
    async def _list_agents(self, context: dict) -> dict:
        """列出子 Agent"""
        agents = []
        for agent_id, agent in self.active_agents.items():
            agents.append({
                "agent_id": agent_id,
                "agent_type": agent.definition.agent_type,
                "status": agent.status
            })
        
        return {
            "status": "agents_listed",
            "agents": agents,
            "count": len(agents)
        }
    
    async def _execute_todo_tool(self, tool_name: str, args: dict, context: dict) -> dict:
        """执行TODO工具"""
        from .todo_tools import todo_add, todo_update, todo_delete, todo_list, todo_clear
        
        workspace_id = context.get("workspace_id", "default")
        
        if tool_name == "todo_add":
            return todo_add(
                workspace_id=workspace_id,
                description=args.get("description", ""),
                priority=args.get("priority", "medium"),
                tool=args.get("tool"),
                args=args.get("args")
            )
        
        elif tool_name == "todo_update":
            return todo_update(
                workspace_id=workspace_id,
                task_id=args.get("task_id"),
                status=args.get("status"),
                result=args.get("result")
            )
        
        elif tool_name == "todo_delete":
            return todo_delete(
                workspace_id=workspace_id,
                task_id=args.get("task_id")
            )
        
        elif tool_name == "todo_list":
            return todo_list(
                workspace_id=workspace_id,
                status=args.get("status")
            )
        
        elif tool_name == "todo_clear":
            return todo_clear(
                workspace_id=workspace_id,
                completed_only=args.get("completed_only", True)
            )
        
        else:
            return {
                "success": False,
                "message": f"未知的TODO工具: {tool_name}"
            }
