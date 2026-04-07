# 特殊工具配置系统

## 概述

特殊工具配置系统允许你灵活地定义哪些工具应该使用专门的段类型，而不是标准的 `tool_call`/`tool_res` 模式。

## 配置方式

在 `tool_execution_graph.py` 文件中，有一个 `SPECIAL_TOOLS` 配置字典：

```python
SPECIAL_TOOLS = {
    "tool_name": {
        "start_type": SegmentType.START_TYPE,
        "delta_type": SegmentType.DELTA_TYPE,
        "end_type": SegmentType.END_TYPE,
        "content_field": "frontend_content_field"
    }
}
```

## 配置参数说明

- `start_type`: 开始段的类型（SegmentType枚举值）
- `delta_type`: 内容流式传输段的类型
- `end_type`: 结束段的类型
- `content_field`: 前端对应的内容字段名

## 添加新的特殊工具

### 1. 在后端添加段类型

在 `canonical.py` 中添加新的段类型：

```python
class SegmentType(Enum):
    # ... 现有类型
    NEW_TOOL_START = "new_tool_start"
    NEW_TOOL_DELTA = "new_tool_delta"
    NEW_TOOL_END = "new_tool_end"
```

### 2. 配置特殊工具

在 `SPECIAL_TOOLS` 中添加配置：

```python
SPECIAL_TOOLS = {
    "thinking": { ... },  # 现有配置
    "new_tool": {
        "start_type": SegmentType.NEW_TOOL_START,
        "delta_type": SegmentType.NEW_TOOL_DELTA,
        "end_type": SegmentType.NEW_TOOL_END,
        "content_field": "new_tool_content"
    }
}
```

### 3. 实现工具处理逻辑

在 `_execute_special_tool` 函数中添加新的工具处理分支：

```python
def _execute_special_tool(...):
    if tool_name == "new_tool":
        return _execute_new_tool(tool_name, tool_args, task_description, ...)
    # ...
```

### 4. 前端处理

- 在 `MessageNode` 接口中添加对应的内容字段
- 在 `store.ts` 中添加对新段类型的处理逻辑
- 在数据库中添加对应的字段

## 当前配置

目前只有 `thinking` 工具被配置为特殊工具，它使用：
- `THINKING_START` / `THINKING_DELTA` / `THINKING_END` 段类型
- 前端 `thinkingContent` 字段存储内容