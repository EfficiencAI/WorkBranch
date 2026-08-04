import * as fs from 'fs';
import * as path from 'path';
import { SegmentType } from '../../session-service/canonical';

export interface TraeCliRuntimeSettings {
  executable: string;
  provider: string;
  maxSteps: number;
  tools: string[];
  showWorkflow: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface TraeToolCall {
  call_id?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

interface TraeToolResult {
  call_id?: string;
  id?: string;
  success?: boolean;
  result?: unknown;
  error?: unknown;
}

interface TraeLlmResponse {
  content?: string;
  tool_calls?: TraeToolCall[] | null;
}

interface TraeAgentStep {
  step_number?: number;
  state?: string;
  llm_response?: TraeLlmResponse | null;
  tool_calls?: TraeToolCall[] | null;
  tool_results?: TraeToolResult[] | null;
  reflection?: string | null;
  error?: string | null;
}

export interface TraeTrajectory {
  success?: boolean;
  final_result?: string | null;
  agent_steps?: TraeAgentStep[];
}

export interface TraeWorkflowEvent {
  type: SegmentType;
  content: string;
  metadata: Record<string, unknown>;
}

export interface TraeFinalResult {
  content: string;
  source: 'trajectory.final_result' | 'trajectory.agent_steps.llm_response.content';
}

function stringifyWorkflowValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? null, null, 2);
}

export function buildTraeConfig(settings: TraeCliRuntimeSettings): Record<string, unknown> {
  return {
    agents: {
      trae_agent: {
        enable_lakeview: false,
        model: 'workbranch_model',
        max_steps: settings.maxSteps,
        tools: settings.tools,
      },
    },
    allow_mcp_servers: [],
    mcp_servers: {},
    model_providers: {
      [settings.provider]: {
        api_key: '',
        provider: settings.provider,
        base_url: settings.baseUrl,
      },
    },
    models: {
      workbranch_model: {
        model_provider: settings.provider,
        model: settings.model,
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
        top_p: 1,
        top_k: 0,
        max_retries: 3,
        parallel_tool_calls: true,
      },
    },
  };
}

export function writeTraeConfig(
  workspaceDir: string,
  settings: TraeCliRuntimeSettings
): { configFile: string; trajectoryDir: string } {
  const workbranchDir = path.join(workspaceDir, '.workbranch');
  const trajectoryDir = path.join(workbranchDir, 'trajectories');
  fs.mkdirSync(trajectoryDir, { recursive: true });

  const configFile = path.join(workbranchDir, 'trae-config.yaml');
  fs.writeFileSync(configFile, JSON.stringify(buildTraeConfig(settings), null, 2), 'utf8');
  return { configFile, trajectoryDir };
}

export function readTraeTrajectory(trajectoryFile: string): TraeTrajectory | null {
  if (!fs.existsSync(trajectoryFile)) return null;

  try {
    return JSON.parse(fs.readFileSync(trajectoryFile, 'utf8')) as TraeTrajectory;
  } catch {
    return null;
  }
}

export function extractTraeFinalResult(trajectory: TraeTrajectory): TraeFinalResult | null {
  if (typeof trajectory.final_result === 'string' && trajectory.final_result.trim().length > 0) {
    return { content: trajectory.final_result, source: 'trajectory.final_result' };
  }

  const steps = trajectory.agent_steps ?? [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const content = step.llm_response?.content;
    if (step.state === 'completed' && typeof content === 'string' && content.trim().length > 0) {
      return { content, source: 'trajectory.agent_steps.llm_response.content' };
    }
  }

  return null;
}

export function extractTraeFailureMessage(trajectory: TraeTrajectory): string | null {
  if (typeof trajectory.final_result === 'string' && trajectory.final_result.trim().length > 0) {
    return trajectory.final_result;
  }

  const steps = trajectory.agent_steps ?? [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const error = steps[index].error;
    if (typeof error === 'string' && error.trim().length > 0) return error;
  }

  return null;
}

export function collectWorkflowEvents(
  trajectory: TraeTrajectory,
  emittedStepCount: number
): { events: TraeWorkflowEvent[]; emittedStepCount: number } {
  const steps = trajectory.agent_steps ?? [];
  const events: TraeWorkflowEvent[] = [];

  for (let index = emittedStepCount; index < steps.length; index += 1) {
    const step = steps[index];
    const stepNumber = step.step_number ?? index + 1;
    const state = step.state ?? 'unknown';
    const baseMetadata = { agent_id: 'trae', step_number: stepNumber, state };

    events.push({
      type: SegmentType.STATE_CHANGE,
      content: `Trae step ${stepNumber}: ${state}`,
      metadata: baseMetadata,
    });

    const responseContent = step.llm_response?.content;
    if (responseContent) {
      events.push({ type: SegmentType.THINKING_START, content: '', metadata: baseMetadata });
      events.push({
        type: SegmentType.THINKING_DELTA,
        content: responseContent,
        metadata: baseMetadata,
      });
      events.push({ type: SegmentType.THINKING_END, content: '', metadata: baseMetadata });
    }

    const toolCalls = step.tool_calls ?? step.llm_response?.tool_calls ?? [];
    for (const toolCall of toolCalls ?? []) {
      const toolName = toolCall.name ?? 'unknown';
      events.push({
        type: SegmentType.TOOL_CALL,
        content: stringifyWorkflowValue({ name: toolName, arguments: toolCall.arguments ?? {} }),
        metadata: {
          ...baseMetadata,
          tool_name: toolName,
          call_id: toolCall.call_id ?? toolCall.id ?? null,
        },
      });
    }

    for (const toolResult of step.tool_results ?? []) {
      events.push({
        type: SegmentType.TOOL_RES,
        content: stringifyWorkflowValue({
          success: toolResult.success === true,
          result: toolResult.result ?? null,
          error: toolResult.error ?? null,
        }),
        metadata: {
          ...baseMetadata,
          call_id: toolResult.call_id ?? toolResult.id ?? null,
          success: toolResult.success === true,
        },
      });
    }

    if (step.reflection) {
      events.push({
        type: SegmentType.THINKING_DELTA,
        content: step.reflection,
        metadata: { ...baseMetadata, source: 'reflection' },
      });
    }

    if (step.error) {
      events.push({
        type: SegmentType.STATE_CHANGE,
        content: `Trae step ${stepNumber} error: ${step.error}`,
        metadata: { ...baseMetadata, error: step.error },
      });
    }
  }

  return { events, emittedStepCount: steps.length };
}

export function formatTraeExitError(code: number | null, stdout: string, stderr: string): string {
  const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
  return `Trae CLI exited with code ${String(code)}${details ? `: ${details}` : ''}`;
}
