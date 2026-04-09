from __future__ import annotations

from typing import Any, Optional


class ConsoleFormatter:
    """控制台格式化输出工具"""
    
    BOX_CHARS = {
        "horizontal": "─",
        "vertical": "│",
        "top_left": "┌",
        "top_right": "┐",
        "bottom_left": "└",
        "bottom_right": "┘",
        "left_tee": "├",
        "right_tee": "┤",
        "top_tee": "┬",
        "bottom_tee": "┴",
        "cross": "┼",
        "double_horizontal": "═",
        "double_vertical": "║",
        "double_top_left": "╔",
        "double_top_right": "╗",
        "double_bottom_left": "╚",
        "double_bottom_right": "╝",
        "double_left_tee": "╠",
        "double_right_tee": "╣",
    }
    
    COLORS = {
        "reset": "\033[0m",
        "bold": "\033[1m",
        "dim": "\033[2m",
        "red": "\033[91m",
        "green": "\033[92m",
        "yellow": "\033[93m",
        "blue": "\033[94m",
        "magenta": "\033[95m",
        "cyan": "\033[96m",
        "white": "\033[97m",
    }
    
    ICONS = {
        "info": "ℹ️",
        "success": "✅",
        "warning": "⚠️",
        "error": "❌",
        "debug": "🔍",
        "llm": "🤖",
        "tool": "🔧",
        "task": "📋",
        "agent": "🤖",
        "workspace": "📁",
        "message": "💬",
        "prompt": "📝",
        "response": "📤",
        "step": "➡️",
        "check": "✓",
        "cross": "✗",
        "arrow": "→",
        "bullet": "•",
    }
    
    @classmethod
    def _colorize(cls, text: str, color: str) -> str:
        if color not in cls.COLORS:
            return text
        return f"{cls.COLORS[color]}{text}{cls.COLORS['reset']}"
    
    @classmethod
    def _truncate(cls, text: str, max_width: int) -> str:
        if len(text) <= max_width:
            return text
        return text[:max_width - 3] + "..."
    
    @classmethod
    def _pad(cls, text: str, width: int, align: str = "left") -> str:
        text_len = len(text)
        if text_len >= width:
            return text
        padding = width - text_len
        if align == "center":
            left_pad = padding // 2
            right_pad = padding - left_pad
            return " " * left_pad + text + " " * right_pad
        elif align == "right":
            return " " * padding + text
        else:
            return text + " " * padding
    
    @classmethod
    def header(cls, title: str, width: int = 80, style: str = "double") -> None:
        chars = cls.BOX_CHARS if style == "single" else {
            "horizontal": cls.BOX_CHARS["double_horizontal"],
            "vertical": cls.BOX_CHARS["double_vertical"],
            "top_left": cls.BOX_CHARS["double_top_left"],
            "top_right": cls.BOX_CHARS["double_top_right"],
            "bottom_left": cls.BOX_CHARS["double_bottom_left"],
            "bottom_right": cls.BOX_CHARS["double_bottom_right"],
        }
        
        print()
        print(chars["top_left"] + chars["horizontal"] * (width - 2) + chars["top_right"])
        
        title_padded = cls._pad(title, width - 4, "center")
        print(chars["vertical"] + cls._colorize(title_padded, "cyan") + chars["vertical"])
        
        print(chars["bottom_left"] + chars["horizontal"] * (width - 2) + chars["bottom_right"])
    
    @classmethod
    def section(cls, title: str, width: int = 80) -> None:
        print()
        print(cls.BOX_CHARS["top_left"] + "─" + f" {title} " + "─" * (width - len(title) - 5) + cls.BOX_CHARS["top_right"])
    
    @classmethod
    def section_end(cls, width: int = 80) -> None:
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def box(cls, title: str, content: str | list[str] | dict[str, Any], width: int = 80, color: Optional[str] = None) -> None:
        print()
        title_display = f" {title} "
        title_line = cls.BOX_CHARS["top_left"] + "─" * (len(title_display)) + "─" * (width - len(title_display) - 2) + cls.BOX_CHARS["top_right"]
        print(title_line)
        
        print(cls.BOX_CHARS["vertical"])
        
        if isinstance(content, dict):
            for key, value in content.items():
                line = f"  [{key}]"
                if color:
                    line = cls._colorize(line, color)
                print(cls.BOX_CHARS["vertical"] + line)
                
                value_str = str(value)
                value_lines = value_str.split("\n")
                for vline in value_lines:
                    truncated = cls._truncate(vline, width - 4)
                    print(cls.BOX_CHARS["vertical"] + "  " + truncated)
                print(cls.BOX_CHARS["vertical"])
        elif isinstance(content, list):
            for item in content:
                item_str = str(item)
                truncated = cls._truncate(item_str, width - 4)
                line = f"  {cls.ICONS['bullet']} {truncated}"
                if color:
                    line = cls._colorize(line, color)
                print(cls.BOX_CHARS["vertical"] + line)
            print(cls.BOX_CHARS["vertical"])
        else:
            lines = str(content).split("\n")
            for line in lines:
                truncated = cls._truncate(line, width - 4)
                display_line = cls._colorize(truncated, color) if color else truncated
                print(cls.BOX_CHARS["vertical"] + "  " + display_line)
            print(cls.BOX_CHARS["vertical"])
        
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def prompt_box(cls, title: str, system_prompt: str, user_message: str, width: int = 80) -> None:
        print()
        print(cls.BOX_CHARS["top_left"] + "─" + f" {title} " + "─" * (width - len(title) - 5) + cls.BOX_CHARS["top_right"])
        print(cls.BOX_CHARS["vertical"])
        
        print(cls.BOX_CHARS["vertical"] + cls._colorize("  [系统提示词]", "magenta"))
        sys_lines = system_prompt.split("\n")
        for line in sys_lines[:10]:
            truncated = cls._truncate(line, width - 4)
            print(cls.BOX_CHARS["vertical"] + "  " + truncated)
        if len(sys_lines) > 10:
            print(cls.BOX_CHARS["vertical"] + "  ...")
        print(cls.BOX_CHARS["vertical"])
        
        print(cls.BOX_CHARS["vertical"] + cls._colorize("  [用户消息]", "cyan"))
        user_lines = user_message.split("\n")
        for line in user_lines[:5]:
            truncated = cls._truncate(line, width - 4)
            print(cls.BOX_CHARS["vertical"] + "  " + truncated)
        if len(user_lines) > 5:
            print(cls.BOX_CHARS["vertical"] + "  ...")
        print(cls.BOX_CHARS["vertical"])
        
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def response_box(cls, content: str, width: int = 80, char_count: Optional[int] = None) -> None:
        print()
        print(cls.BOX_CHARS["top_left"] + "─" + f" 大模型的回复 " + "─" * (width - 17) + cls.BOX_CHARS["top_right"])
        print(cls.BOX_CHARS["vertical"])
        
        if char_count:
            print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  响应长度: {char_count} 字符", "dim"))
            print(cls.BOX_CHARS["vertical"])
        
        lines = content.split("\n")
        for line in lines:
            truncated = cls._truncate(line, width - 4)
            print(cls.BOX_CHARS["vertical"] + "  " + truncated)
        
        print(cls.BOX_CHARS["vertical"])
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def task_list_box(cls, tasks: list[dict], width: int = 80) -> None:
        print()
        print(cls.BOX_CHARS["top_left"] + "─" + f" 生成的任务计划 " + "─" * (width - 19) + cls.BOX_CHARS["top_right"])
        print(cls.BOX_CHARS["vertical"])
        
        phase_names = {
            'research': '研究阶段',
            'synthesis': '综合阶段',
            'implementation': '实现阶段',
            'verification': '验证阶段'
        }
        
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  共生成 {len(tasks)} 个任务:", "cyan"))
        
        current_phase = None
        for task in tasks:
            phase = task.get('phase', 'implementation')
            if phase != current_phase:
                current_phase = phase
                phase_name = phase_names.get(phase, phase)
                print(cls.BOX_CHARS["vertical"])
                print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  [{phase_name}]", "yellow"))
            
            tool_info = f" [工具: {task.get('tool')}]" if task.get('tool') else ""
            task_line = f"    {task['id']}. {task['description']}{tool_info}"
            truncated = cls._truncate(task_line, width - 4)
            print(cls.BOX_CHARS["vertical"] + truncated)
        
        print(cls.BOX_CHARS["vertical"])
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def execution_box(cls, step: int, total: int, phase: str, description: str, tool: str, args: dict, width: int = 80) -> None:
        print()
        print(cls.BOX_CHARS["top_left"] + "─" + f" 执行任务 " + "─" * (width - 13) + cls.BOX_CHARS["top_right"])
        print(cls.BOX_CHARS["vertical"])
        
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  任务进度: {step}/{total}", "cyan"))
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  任务阶段: {phase}", "yellow"))
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  任务描述: {description}", "white"))
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  使用工具: {tool}", "magenta"))
        
        if args:
            args_str = str(args)
            truncated = cls._truncate(args_str, width - 8)
            print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  工具参数: {truncated}", "dim"))
        
        print(cls.BOX_CHARS["vertical"])
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def result_box(cls, status: str, result: str, feedback: str, width: int = 80) -> None:
        print()
        print(cls.BOX_CHARS["top_left"] + "─" + f" 任务执行结果 " + "─" * (width - 17) + cls.BOX_CHARS["top_right"])
        print(cls.BOX_CHARS["vertical"])
        
        status_color = "green" if status == "completed" else "red"
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  状态: {status}", status_color))
        
        print(cls.BOX_CHARS["vertical"] + "  结果:")
        result_lines = result.split("\n")
        for line in result_lines[:5]:
            truncated = cls._truncate(line, width - 4)
            print(cls.BOX_CHARS["vertical"] + "  " + truncated)
        if len(result_lines) > 5:
            print(cls.BOX_CHARS["vertical"] + "  ...")
        
        print(cls.BOX_CHARS["vertical"])
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  反馈: {feedback}", "cyan"))
        print(cls.BOX_CHARS["vertical"])
        
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def decision_box(cls, next_step: str, reason: Optional[str] = None, width: int = 80) -> None:
        print()
        print(cls.BOX_CHARS["top_left"] + "─" + f" 执行决策 " + "─" * (width - 13) + cls.BOX_CHARS["top_right"])
        print(cls.BOX_CHARS["vertical"])
        
        print(cls.BOX_CHARS["vertical"] + cls._colorize(f"  下一步: {next_step}", "green"))
        
        if reason:
            print(cls.BOX_CHARS["vertical"])
            reason_lines = reason.split("\n")
            for line in reason_lines[:3]:
                truncated = cls._truncate(line, width - 4)
                print(cls.BOX_CHARS["vertical"] + "  " + truncated)
        
        print(cls.BOX_CHARS["vertical"])
        print(cls.BOX_CHARS["bottom_left"] + "─" * (width - 2) + cls.BOX_CHARS["bottom_right"])
    
    @classmethod
    def info(cls, msg: str, icon: bool = True) -> None:
        prefix = f"{cls.ICONS['info']} " if icon else ""
        print(f"{prefix}{msg}")
    
    @classmethod
    def success(cls, msg: str, icon: bool = True) -> None:
        prefix = f"{cls.ICONS['success']} " if icon else ""
        print(cls._colorize(f"{prefix}{msg}", "green"))
    
    @classmethod
    def warning(cls, msg: str, icon: bool = True) -> None:
        prefix = f"{cls.ICONS['warning']} " if icon else ""
        print(cls._colorize(f"{prefix}{msg}", "yellow"))
    
    @classmethod
    def error(cls, msg: str, icon: bool = True) -> None:
        prefix = f"{cls.ICONS['error']} " if icon else ""
        print(cls._colorize(f"{prefix}{msg}", "red"))
    
    @classmethod
    def debug(cls, msg: str, icon: bool = True) -> None:
        prefix = f"{cls.ICONS['debug']} " if icon else ""
        print(cls._colorize(f"{prefix}{msg}", "dim"))
    
    @classmethod
    def step(cls, step_name: str, prev_step: str, message: str, width: int = 80) -> None:
        print()
        print(cls.BOX_CHARS["double_top_left"] + cls.BOX_CHARS["double_horizontal"] * (width - 2) + cls.BOX_CHARS["double_top_right"])
        print(cls.BOX_CHARS["double_vertical"] + cls._pad(f"Graph 执行日志", width - 2, "center") + cls.BOX_CHARS["double_vertical"])
        print(cls.BOX_CHARS["double_left_tee"] + cls.BOX_CHARS["double_horizontal"] * (width - 2) + cls.BOX_CHARS["double_right_tee"])
        print(cls.BOX_CHARS["double_vertical"] + cls._pad(f"当前步骤: {step_name}", width - 2) + cls.BOX_CHARS["double_vertical"])
        print(cls.BOX_CHARS["double_vertical"] + cls._pad(f"上一步:   {prev_step}", width - 2) + cls.BOX_CHARS["double_vertical"])
        
        msg_display = cls._truncate(message, width - 14)
        print(cls.BOX_CHARS["double_vertical"] + cls._pad(f"输入消息: {msg_display}", width - 2) + cls.BOX_CHARS["double_vertical"])
        
        print(cls.BOX_CHARS["double_bottom_left"] + cls.BOX_CHARS["double_horizontal"] * (width - 2) + cls.BOX_CHARS["double_bottom_right"])
    
    @classmethod
    def separator(cls, width: int = 80, char: str = "─") -> None:
        print(char * width)
    
    @classmethod
    def blank_line(cls, count: int = 1) -> None:
        for _ in range(count):
            print()


console = ConsoleFormatter()
