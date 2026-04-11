import { llmService } from '../service/llm-service';
import type { AgentState, ToolCall } from '../state/agent-state';
import { createInitialState } from '../state/agent-state';
import {
  ExecutionMode,
  analyzeTaskComplexity,
  evaluateTaskComplexity,
  type IntentAnalysis,
} from './decision/complexity-analyzer';
import { runToolExecution } from './subgraphs/tool-execution-graph';
import { SegmentType } from '../../session-service/canonical';
import { logger } from '../../../core/logging';
import { getSubagent, hasSubagent } from '../subagents';

export interface MessageContext {
  send_message: (content: string, type: SegmentType) => void;
  session_id: string;
  conversation_id: string;
  workspace_id: string;
  message_id: string;
}

function checkState(state: AgentState): 'analyze' | 'execute' | 'plan' | 'subagent' | 'done' {
  if (!state.execution_mode) {
    return 'analyze';
  }

  if (state.execution_mode === null) {
    return 'done';
  }

  if (state.in_plan_mode) {
    if (state.plan && state.current_step < state.plan.length) {
      return 'execute';
    }
    return 'done';
  }

  if (state.active_subagent) {
    return 'subagent';
  }

  if (state.pending_tools && state.pending_tools.length > 0) {
    return 'execute';
  }

  return 'done';
}

async function analyzeNode(state: AgentState): Promise<Partial<AgentState>> {
  const userMessage = state.messages[state.messages.length - 1] as string;

  logger.info({
    event: 'orchestrator.analyze.started',
    workspace_id: state.workspace_id,
  });

  const systemPrompt = `你是一个任务分析专家。请分析用户任务的复杂度，并决定执行模式。

执行模式选项：
1. DIRECT - 直接执行：适用于简单任务，如读取文件、查询信息等
2. PLAN - 规划模式：适用于复杂开发任务，需要多步骤规划
3. SUBAGENT - 子Agent模式：适用于特定类型任务，如探索、审查等

请以JSON格式返回分析结果：
{
    "complexity": "simple/medium/complex",
    "intent_type": "develop/explore/review/question/debug/refactor/other",
    "execution_mode": "DIRECT/PLAN/SUBAGENT",
    "reason": "选择该模式的原因",
    "suggested_tools": ["工具列表"],
    "suggested_agent": "explore/review/None"
}

只返回JSON，不要其他内容。`;

  const messages = [{ role: 'user', content: `请分析以下任务：\n\n${userMessage}` }];

  let modeDecision: {
    mode: ExecutionMode;
    reason: string;
    suggested_tools: string[];
    suggested_agent: string | null;
  };

  let intentAnalysis: IntentAnalysis;

  try {
    const response = await llmService.chat(messages, systemPrompt);

    let responseText = response.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.slice(7);
    }
    if (responseText.startsWith('```')) {
      responseText = responseText.slice(3);
    }
    if (responseText.endsWith('```')) {
      responseText = responseText.slice(0, -3);
    }
    responseText = responseText.trim();

    const analysisResult = JSON.parse(responseText);

    const modeStr = analysisResult.execution_mode || 'DIRECT';
    const executionMode = ExecutionMode[modeStr as keyof typeof ExecutionMode] || ExecutionMode.DIRECT;

    modeDecision = {
      mode: executionMode,
      reason: analysisResult.reason || '',
      suggested_tools: analysisResult.suggested_tools || [],
      suggested_agent: analysisResult.suggested_agent || null,
    };

    intentAnalysis = {
      intent_type: analysisResult.intent_type || 'other',
      summary: userMessage.slice(0, 100),
      key_points: [userMessage],
      suggested_tools: analysisResult.suggested_tools || [],
      complexity: analysisResult.complexity || 'medium',
      confidence: 0.9,
    };
  } catch (err) {
    logger.warn({
      event: 'orchestrator.analyze.llm_failed',
      error: String(err),
    });

    const complexity = evaluateTaskComplexity(userMessage);
    intentAnalysis = {
      intent_type: 'other',
      summary: userMessage.slice(0, 100),
      key_points: [userMessage],
      suggested_tools: [],
      complexity,
      confidence: 0.7,
    };
    modeDecision = analyzeTaskComplexity(userMessage, intentAnalysis);
  }

  logger.info({
    event: 'orchestrator.analyze.completed',
    mode: modeDecision.mode,
    reason: modeDecision.reason,
  });

  return {
    intent_analysis: intentAnalysis,
    execution_mode: modeDecision.mode,
    mode_reason: modeDecision.reason,
    suggested_tools: modeDecision.suggested_tools,
    suggested_subagent: modeDecision.suggested_agent || undefined,
    in_plan_mode: modeDecision.mode === ExecutionMode.PLAN,
    active_subagent: modeDecision.mode === ExecutionMode.SUBAGENT,
  };
}

async function executeNode(
  state: AgentState,
  context: MessageContext
): Promise<Partial<AgentState>> {
  const pendingTools = state.pending_tools || [];

  if (pendingTools.length === 0) {
    return {};
  }

  const toolCall = pendingTools[0] as { tool: string; args: Record<string, unknown> };
  const toolName = toolCall.tool;
  const toolArgs = toolCall.args || {};

  logger.info({
    event: 'orchestrator.execute.started',
    tool_name: toolName,
    workspace_id: state.workspace_id,
  });

  const toolResult = await runToolExecution({
    toolName,
    toolArgs,
    workspaceId: state.workspace_id,
    conversationId: context.conversation_id,
    messageId: context.message_id,
    agentType: state.agent_type || 'build_agent',
    previousCalls: state.tool_history,
  });

  const resultStr = toolResult.result ? String(toolResult.result) : '';

  if (toolResult.error) {
    context.send_message(`工具执行失败: ${toolResult.error}`, SegmentType.TEXT_DELTA);
  } else {
    const truncatedResult = resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr;
    context.send_message(`工具执行成功: ${truncatedResult}`, SegmentType.TEXT_DELTA);
  }

  const newToolHistory: ToolCall[] = [
    ...state.tool_history,
    {
      tool: toolName,
      args: toolArgs,
      result: toolResult.result ? String(toolResult.result) : undefined,
    },
  ];

  const remainingTools = pendingTools.slice(1);

  return {
    tool_history: newToolHistory,
    pending_tools: remainingTools.length > 0 ? remainingTools : undefined,
  };
}

async function runDirectMode(
  userMessage: string,
  context: MessageContext
): Promise<void> {
  const systemPrompt = '你是一个有帮助的AI助手。请用中文回答用户的问题。';
  const messages = [{ role: 'user', content: userMessage }];

  let textStarted = false;

  for await (const chunk of llmService.chatStream(messages, systemPrompt)) {
    if (!textStarted) {
      context.send_message('', SegmentType.TEXT_START);
      textStarted = true;
    }
    context.send_message(chunk, SegmentType.TEXT_DELTA);
  }

  if (textStarted) {
    context.send_message('', SegmentType.TEXT_END);
  }
}

async function runPlanMode(
  userMessage: string,
  state: AgentState,
  context: MessageContext
): Promise<void> {
  context.send_message('进入规划模式，分析任务...', SegmentType.TEXT_DELTA);

  const planPrompt = `请将以下任务分解为可执行的步骤。以JSON数组格式返回：
[
  {"description": "步骤描述", "tool": "工具名称（可选）", "args": {"参数": "值"}}
]

任务：${userMessage}`;

  try {
    const response = await llmService.chat([{ role: 'user', content: planPrompt }]);

    let responseText = response.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.slice(7);
    }
    if (responseText.startsWith('```')) {
      responseText = responseText.slice(3);
    }
    if (responseText.endsWith('```')) {
      responseText = responseText.slice(0, -3);
    }
    responseText = responseText.trim();

    const plan = JSON.parse(responseText);

    context.send_message(`已创建 ${plan.length} 个步骤的计划`, SegmentType.TEXT_DELTA);

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      context.send_message(`\n步骤 ${i + 1}: ${step.description}`, SegmentType.TEXT_DELTA);

      if (step.tool) {
        const toolResult = await runToolExecution({
          toolName: step.tool,
          toolArgs: step.args || {},
          workspaceId: state.workspace_id,
          conversationId: context.conversation_id,
          messageId: context.message_id,
          agentType: state.agent_type || 'build_agent',
        });

        if (toolResult.error) {
          context.send_message(`  执行失败: ${toolResult.error}`, SegmentType.TEXT_DELTA);
        } else {
          const resultStr = toolResult.result ? String(toolResult.result) : '';
          const truncated = resultStr.length > 200 ? resultStr.slice(0, 200) + '...' : resultStr;
          context.send_message(`  执行成功: ${truncated}`, SegmentType.TEXT_DELTA);
        }
      }
    }

    context.send_message('\n计划执行完成', SegmentType.TEXT_DELTA);
  } catch (err) {
    context.send_message(`规划失败: ${String(err)}`, SegmentType.TEXT_DELTA);
  }
}

async function runSubagentMode(
  userMessage: string,
  suggestedAgent: string | null,
  context: MessageContext
): Promise<void> {
  const agentName = suggestedAgent || 'explore_agent';

  if (!hasSubagent(agentName)) {
    context.send_message(`未知的子Agent: ${agentName}，使用默认模式处理`, SegmentType.TEXT_DELTA);
    await runDirectMode(userMessage, context);
    return;
  }

  context.send_message(`委托给 ${agentName} 处理...`, SegmentType.TEXT_DELTA);

  const agent = getSubagent(agentName, context.send_message);

  const agentContext = {
    workspace_id: context.workspace_id,
    conversation_id: context.conversation_id,
    message_id: context.message_id,
  };

  const result = await agent.execute(userMessage, agentContext);

  if (result.error) {
    context.send_message(`子Agent执行失败: ${result.error}`, SegmentType.ERROR);
  }
}

export async function runOrchestrator(
  userMessage: string,
  workspaceId: string,
  context: MessageContext
): Promise<void> {
  logger.info({
    event: 'orchestrator.started',
    workspace_id: workspaceId,
    conversation_id: context.conversation_id,
  });

  const state = createInitialState(workspaceId);
  state.messages = [userMessage];

  try {
    const analysisUpdate = await analyzeNode(state);
    Object.assign(state, analysisUpdate);

    const nextState = checkState(state);

    switch (nextState) {
      case 'analyze':
        break;

      case 'execute':
        const executeUpdate = await executeNode(state, context);
        Object.assign(state, executeUpdate);
        break;

      case 'plan':
        await runPlanMode(userMessage, state, context);
        break;

      case 'subagent':
        await runSubagentMode(userMessage, state.suggested_subagent || null, context);
        break;

      case 'done':
      default:
        await runDirectMode(userMessage, context);
        break;
    }

    logger.info({
      event: 'orchestrator.completed',
      workspace_id: workspaceId,
      mode: state.execution_mode,
    });
  } catch (err) {
    logger.error({
      event: 'orchestrator.failed',
      workspace_id: workspaceId,
      error: String(err),
    });

    context.send_message(`执行失败: ${String(err)}`, SegmentType.ERROR);
  }
}
