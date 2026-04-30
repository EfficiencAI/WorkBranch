export const CONVOLUTION_COMPRESSION_PROMPT = `你是一个对话历史压缩专家。请将目标记录压缩为结构化摘要。

## 上下文信息（仅供参考，不要压缩这部分）

### 上一条记录
{prev_context}

### 下一条记录
{next_context}

## 目标记录（需要压缩）

{target_content}

## 压缩要求

1. **理解上下文**：参考上一条和下一条记录，理解目标记录在对话中的位置和作用
2. **保留关联**：在摘要中体现与上下文的逻辑关系
3. **提取核心**：提取目标记录的核心信息
4. **控制长度**：根据目标长度调整摘要详细程度

## 目标长度
约 {target_tokens} tokens（压缩到 {compression_ratio}%）

## 输出格式
严格按照以下 JSON 格式输出：

\`\`\`json
{
  "role": "user/assistant",
  "summary": "核心内容摘要（1-2句话）",
  "context_relation": "与上下文的关系（如：承接上文的方案，引出下文的问题）",
  "key_points": ["关键点1", "关键点2"],
  "action_taken": "采取的行动或给出的方案（仅assistant）",
  "result": "结果或结论"
}
\`\`\`

## 注意事项
- 只输出 JSON，不要有其他文字
- context_relation 要简洁，说明在对话链中的作用
- 如果目标记录与上下文关联不强，context_relation 可以为空
- 保持语义完整性，不要丢失关键信息

请开始压缩：`;

export const COMPRESSION_SYSTEM_PROMPT = '你是一个专业的对话历史压缩专家。';

export function buildCompressionPrompt(
  prevContext: string,
  nextContext: string,
  targetContent: string,
  targetTokens: number,
  compressionRatio: number,
): string {
  return CONVOLUTION_COMPRESSION_PROMPT
    .replace('{prev_context}', prevContext)
    .replace('{next_context}', nextContext)
    .replace('{target_content}', targetContent)
    .replace('{target_tokens}', String(targetTokens))
    .replace('{compression_ratio}', String(compressionRatio));
}
