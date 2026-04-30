import type { Task, IntentAnalysis } from '../../state/agent-state';
import { llmService } from '../../service/llm-service';
import { logger } from '../../../../core/logging';
import { INTENT_ANALYSIS_PROMPT, PLAN_SYSTEM_PROMPT_BASE } from '../../prompts/graph-prompts';

export interface PlanPhase {
  phase: 'understand' | 'design';
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
}

export interface PlanResult {
  success: boolean;
  plan: Task[];
  intent_analysis?: IntentAnalysis;
  error?: string;
}

export function parsePlanFromText(text: string): Task[] {
  let responseText = text.trim();

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

  try {
    const data = JSON.parse(responseText);
    const rawTasks = data.tasks || [];

    return rawTasks.map(
      (task: Record<string, unknown>, idx: number) => ({
        id: idx + 1,
        description: String(task.description || `步骤 ${idx + 1}`),
        goal: String(task.goal || task.description || ''),
        done_when: String(task.done_when || '该步骤目标达成'),
        phase: String(task.phase || 'implementation'),
        status: 'pending',
        tool: task.tool as string | undefined,
        args: task.args as Record<string, unknown> | undefined,
        result: undefined,
        feedback: undefined,
      })
    );
  } catch {
    logger.warn({
      event: 'plan.parse_failed',
      text_preview: text.slice(0, 100),
    });
    return [];
  }
}

export async function runPlanFlow(
  userMessage: string,
  workspaceId: string,
  sendMessage?: (content: string, type: string, metadata?: Record<string, unknown>) => void
): Promise<PlanResult> {
  const phases: PlanPhase[] = [
    { phase: 'understand', status: 'pending' },
    { phase: 'design', status: 'pending' },
  ];

  const send = sendMessage || (() => {});

  try {
    phases[0].status = 'running';
    send('', 'PLAN_START', { phase: 'understand' });

    const intentPrompt = INTENT_ANALYSIS_PROMPT.replace('{tool_prompt}', '');
    const intentResponse = await llmService.chat(
      [{ role: 'user', content: `请分析以下用户需求：\n\n${userMessage}` }],
      intentPrompt
    );

    const intentAnalysis: IntentAnalysis = {
      intent_type: 'develop',
      summary: userMessage.slice(0, 100),
      key_points: [],
      suggested_tools: [],
      complexity: 'medium',
      confidence: 0.8,
    };

    try {
      let parsed = intentResponse.trim();
      if (parsed.startsWith('```json')) parsed = parsed.slice(7);
      if (parsed.startsWith('```')) parsed = parsed.slice(3);
      if (parsed.endsWith('```')) parsed = parsed.slice(0, -3);
      parsed = parsed.trim();

      const data = JSON.parse(parsed);
      Object.assign(intentAnalysis, {
        intent_type: data.intent_type || 'develop',
        summary: data.summary || intentAnalysis.summary,
        key_points: data.key_points || [],
        suggested_tools: data.suggested_tools || [],
        complexity: data.complexity || 'medium',
        confidence: data.confidence || 0.8,
      });
    } catch {
      logger.warn({ event: 'plan.intent_parse_failed' });
    }

    phases[0].status = 'completed';
    phases[0].result = intentAnalysis;

    phases[1].status = 'running';
    send('', 'PLAN_START', { phase: 'design' });

    const planSystemPrompt = PLAN_SYSTEM_PROMPT_BASE.replace('{tool_prompt}', '');
    const planResponse = await llmService.chat(
      [{ role: 'user', content: `请为以下需求生成详细的执行计划：\n\n${userMessage}\n\n意图分析结果：${JSON.stringify(intentAnalysis, null, 2)}` }],
      planSystemPrompt
    );
    const plan = parsePlanFromText(planResponse);

    phases[1].status = 'completed';
    send('', 'PLAN_END', {});

    logger.info({
      event: 'plan.flow_completed',
      workspace_id: workspaceId,
      plan_steps: plan.length,
    });

    return {
      success: true,
      plan,
      intent_analysis: intentAnalysis,
    };
  } catch (error) {
    const errorMessage = String(error);
    const runningPhase = phases.find((p) => p.status === 'running');
    if (runningPhase) {
      runningPhase.status = 'failed';
    }
    send(errorMessage, 'ERROR', { phase: 'plan' });

    logger.error({
      event: 'plan.flow_failed',
      workspace_id: workspaceId,
      error: errorMessage,
    });

    return {
      success: false,
      plan: [],
      error: errorMessage,
    };
  }
}

export function formatPlanAsMarkdown(userMessage: string, tasks: Task[]): string {
  const lines = [
    `# 执行计划`,
    '',
    `## 用户需求`,
    userMessage,
    '',
    `## 执行步骤`,
    '',
  ];

  for (const task of tasks) {
    lines.push(`### ${task.id}. ${task.description}`);
    if (task.goal) {
      lines.push(`**目标**: ${task.goal}`);
    }
    if (task.done_when) {
      lines.push(`**完成条件**: ${task.done_when}`);
    }
    lines.push(`**阶段**: ${task.phase}`);
    lines.push('');
  }

  return lines.join('\n');
}
