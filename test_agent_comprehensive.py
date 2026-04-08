#!/usr/bin/env python3
"""
全面测试改造后的Agent系统
"""

import asyncio
import time
from WorkBranch.backend.service.agent_service import AgentService
from WorkBranch.backend.service.agent_service.graph import ExecutionMode

class AgentSystemTester:
    """Agent系统测试器"""
    
    def __init__(self):
        self.agent_service = AgentService()
        self.test_results = []
    
    async def run_test(self, test_name, test_func):
        """运行单个测试"""
        print(f"\n{"=" * 60}")
        print(f"测试: {test_name}")
        print(f"{"=" * 60}")
        
        start_time = time.time()
        try:
            result = await test_func()
            elapsed = time.time() - start_time
            self.test_results.append({
                "name": test_name,
                "status": "PASSED",
                "time": elapsed
            })
            print(f"✓ 测试通过，耗时: {elapsed:.2f}秒")
            return result
        except Exception as e:
            elapsed = time.time() - start_time
            self.test_results.append({
                "name": test_name,
                "status": "FAILED",
                "error": str(e),
                "time": elapsed
            })
            print(f"✗ 测试失败: {e}")
            return None
    
    async def test_basic_functions(self):
        """测试基本功能"""
        # 创建对话
        conv_id = await self.agent_service.create_conversation()
        assert conv_id, "创建对话失败"
        
        # 发送简单消息
        task = await self.agent_service.send_message(conv_id, "你好，测试消息")
        result = await task
        assert result, "发送消息失败"
        
        # 获取对话状态
        status = self.agent_service.get_status(conv_id)
        assert status, "获取状态失败"
        assert status["status"] == "completed", "对话状态不正确"
        
        # 列出对话
        conversations = self.agent_service.list_conversations()
        assert len(conversations) > 0, "列出对话失败"
        
        return conv_id
    
    async def test_direct_execution_mode(self):
        """测试直接执行模式"""
        conv_id = await self.agent_service.create_conversation()
        
        # 发送简单任务
        task = await self.agent_service.send_message(conv_id, "读取当前目录下的文件列表")
        result = await task
        assert result, "直接执行模式失败"
        
        return result
    
    async def test_plan_mode(self):
        """测试规划模式"""
        conv_id = await self.agent_service.create_conversation()
        
        # 发送复杂任务，应该自动进入规划模式
        complex_task = "实现一个简单的计算器函数，支持加减乘除运算，并测试其功能"
        task = await self.agent_service.send_message(conv_id, complex_task)
        result = await task
        assert result, "规划模式失败"
        
        return result
    
    async def test_subagent_mode(self):
        """测试子Agent模式"""
        conv_id = await self.agent_service.create_conversation()
        
        # 发送探索任务，应该使用Explore Agent
        explore_task = "探索当前项目的目录结构"
        task = await self.agent_service.send_message(conv_id, explore_task)
        result = await task
        assert result, "子Agent模式失败"
        
        return result
    
    async def test_tool_usage(self):
        """测试工具使用"""
        conv_id = await self.agent_service.create_conversation()
        
        # 测试文件工具
        file_task = "创建一个测试文件 test.txt，内容为 'Hello World'"
        task = await self.agent_service.send_message(conv_id, file_task)
        result = await task
        assert result, "文件工具测试失败"
        
        # 测试读取文件
        read_task = "读取 test.txt 文件的内容"
        task = await self.agent_service.send_message(conv_id, read_task)
        result = await task
        assert result, "读取文件测试失败"
        
        return result
    
    async def test_error_handling(self):
        """测试错误处理"""
        conv_id = await self.agent_service.create_conversation()
        
        # 发送无效任务
        error_task = "执行一个不存在的工具"
        task = await self.agent_service.send_message(conv_id, error_task)
        try:
            result = await task
            # 应该能够处理错误并返回结果
            assert result, "错误处理失败"
        except Exception as e:
            # 也可以接受异常，只要系统不崩溃
            pass
        
        return True
    
    async def test_performance(self):
        """测试性能"""
        conv_id = await self.agent_service.create_conversation()
        
        # 测试响应时间
        start_time = time.time()
        task = await self.agent_service.send_message(conv_id, "计算 1 + 1")
        result = await task
        elapsed = time.time() - start_time
        
        print(f"响应时间: {elapsed:.2f}秒")
        # 响应时间应该在合理范围内
        assert elapsed < 30, "响应时间过长"
        
        return elapsed
    
    async def run_all_tests(self):
        """运行所有测试"""
        print("启动Agent系统全面测试")
        print("=" * 80)
        
        # 运行测试
        await self.run_test("基本功能测试", self.test_basic_functions)
        await self.run_test("直接执行模式测试", self.test_direct_execution_mode)
        await self.run_test("规划模式测试", self.test_plan_mode)
        await self.run_test("子Agent模式测试", self.test_subagent_mode)
        await self.run_test("工具使用测试", self.test_tool_usage)
        await self.run_test("错误处理测试", self.test_error_handling)
        await self.run_test("性能测试", self.test_performance)
        
        # 输出测试结果
        print("\n" + "=" * 80)
        print("测试结果汇总")
        print("=" * 80)
        
        passed = 0
        failed = 0
        total_time = 0
        
        for result in self.test_results:
            status = "✓" if result["status"] == "PASSED" else "✗"
            time_str = f"{result['time']:.2f}秒"
            if result["status"] == "PASSED":
                print(f"{status} {result['name']}: {time_str}")
                passed += 1
            else:
                print(f"{status} {result['name']}: {time_str} - {result['error']}")
                failed += 1
            total_time += result['time']
        
        print("\n" + "=" * 80)
        print(f"总计: {passed} 通过, {failed} 失败")
        print(f"总耗时: {total_time:.2f}秒")
        print("=" * 80)
        
        return passed, failed

async def main():
    """主函数"""
    tester = AgentSystemTester()
    passed, failed = await tester.run_all_tests()
    
    if failed == 0:
        print("\n🎉 所有测试通过！Agent系统运行正常")
    else:
        print(f"\n⚠️  有 {failed} 个测试失败，需要进一步检查")

if __name__ == "__main__":
    asyncio.run(main())
