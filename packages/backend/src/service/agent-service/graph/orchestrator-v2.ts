import { runDirectorGraph, type MessageContext as DirectorMessageContext } from './director-agent';
import { SegmentType } from '../../session-service/canonical';
import { runCompaction } from './subgraphs/compaction-graph';
import { logger } from '../../../core/logging';
import * as fs from 'fs';
import * as path from 'path';

export interface MessageContext {
  send_message: (content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>;
  session_id: string;
  conversation_id: string;
  workspace_id: string;
  message_id: string;
  cancel_check?: () => void;
}

export interface OrchestratorState {
  messages: unknown[];
  workspace_id: string;
  plan: Array<Record<string, unknown>>;
  current_step: number;
  results: string[];
  plan_failed: boolean;
  tool_history: Array<Record<string, unknown>>;
  replan_count: number;
  agent_type: string | null;
  parent_chain_messages: Array<Record<string, unknown>>;
  current_conversation_messages: Array<Record<string, unknown>>;
}

export type MemoryMode = 'accumulate' | 'sliding';

export interface OrchestratorConfig {
  memory_mode: MemoryMode;
  window_size: number;
  max_messages: number;
  max_replan_count: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  memory_mode: 'accumulate',
  window_size: 3,
  max_messages: 10,
  max_replan_count: 3,
};

class PersistenceServiceImpl {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(process.cwd(), '.agent_states');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  private getStatePath(workspaceId: string): string {
    return path.join(this.basePath, `${workspaceId}.json`);
  }

  save(workspaceId: string, state: Record<string, unknown>): boolean {
    logger.info({ event: 'persistence.save', workspace_id: workspaceId });
    const statePath = this.getStatePath(workspaceId);

    try {
      const stateWithMeta = {
        workspace_id: workspaceId,
        saved_at: new Date().toISOString(),
        state,
      };
      fs.writeFileSync(statePath, JSON.stringify(stateWithMeta, null, 2), 'utf-8');
      return true;
    } catch (err) {
      logger.error({ event: 'persistence.save.failed', workspace_id: workspaceId, error: String(err) });
      return false;
    }
  }

  load(workspaceId: string): Record<string, unknown> | null {
    logger.info({ event: 'persistence.load', workspace_id: workspaceId });
    const statePath = this.getStatePath(workspaceId);

    if (!fs.existsSync(statePath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      logger.info({ event: 'persistence.load.success', workspace_id: workspaceId, saved_at: data.saved_at });
      return data.state || null;
    } catch (err) {
      logger.error({ event: 'persistence.load.failed', workspace_id: workspaceId, error: String(err) });
      return null;
    }
  }

  delete(workspaceId: string): boolean {
    const statePath = this.getStatePath(workspaceId);
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
      return true;
    }
    return false;
  }

  exists(workspaceId: string): boolean {
    return fs.existsSync(this.getStatePath(workspaceId));
  }
}

export const persistence = new PersistenceServiceImpl();

function getPreviousResults(
  toolHistory: Array<Record<string, unknown>>,
  memoryMode: MemoryMode = 'accumulate',
  windowSize: number = 3,
): string[] {
  const allResults = toolHistory
    .filter(call => call.result)
    .map(call => String(call.result));

  if (memoryMode === 'sliding') {
    return windowSize > 0 ? allResults.slice(-windowSize) : [];
  }

  return allResults;
}

function checkState(
  state: OrchestratorState,
  config: OrchestratorConfig,
): 'plan' | 'build' | 'compaction' | 'done' {
  if (!state.plan || state.plan.length === 0) {
    logger.info({ event: 'orchestrator.check_state', result: 'plan', reason: 'no_plan' });
    return 'plan';
  }

  if (state.plan_failed) {
    if (state.replan_count >= config.max_replan_count) {
      logger.info({
        event: 'orchestrator.check_state',
        result: 'done',
        reason: 'max_replan',
        replan_count: state.replan_count,
      });
      return 'done';
    }
    logger.info({
      event: 'orchestrator.check_state',
      result: 'plan',
      reason: 'plan_failed',
      replan_count: state.replan_count,
    });
    return 'plan';
  }

  if (state.current_step < state.plan.length) {
    logger.info({
      event: 'orchestrator.check_state',
      result: 'build',
      step: state.current_step,
      total: state.plan.length,
    });
    return 'build';
  }

  if (state.messages.length > config.max_messages) {
    logger.info({
      event: 'orchestrator.check_state',
      result: 'compaction',
      message_count: state.messages.length,
    });
    return 'compaction';
  }

  logger.info({ event: 'orchestrator.check_state', result: 'done' });
  return 'done';
}

export async function runOrchestrator(
  userMessage: string,
  workspaceId: string,
  context: MessageContext,
  config: Partial<OrchestratorConfig> = {},
): Promise<void> {
  const fullConfig: OrchestratorConfig = { ...DEFAULT_CONFIG, ...config };

  logger.info({
    event: 'orchestrator.started',
    workspace_id: workspaceId,
    memory_mode: fullConfig.memory_mode,
    window_size: fullConfig.window_size,
  });

  try {
    const savedState = persistence.load(workspaceId) as OrchestratorState | null;

    let initialState: OrchestratorState;
    if (savedState) {
      logger.info({ event: 'orchestrator.state_restored', workspace_id: workspaceId });
      initialState = {
        ...savedState,
        messages: [...(savedState.messages || []), userMessage],
        parent_chain_messages: savedState.parent_chain_messages || [],
        current_conversation_messages: savedState.current_conversation_messages || [],
      };
    } else {
      initialState = {
        messages: [userMessage],
        workspace_id: workspaceId,
        plan: [],
        current_step: 0,
        results: [],
        plan_failed: false,
        tool_history: [],
        replan_count: 0,
        agent_type: null,
        parent_chain_messages: [],
        current_conversation_messages: [],
      };
    }

    let currentState = { ...initialState };
    let maxIterations = 50;

    while (maxIterations-- > 0) {
      const nextStep = checkState(currentState, fullConfig);

      if (nextStep === 'done') {
        break;
      }

      if (nextStep === 'plan') {
        await context.send_message('', SegmentType.STATE_CHANGE, {
          state: 'plan',
          is_replan: currentState.plan_failed,
        });

        const directorContext: DirectorMessageContext = {
          send_message: context.send_message,
          session_id: context.session_id,
          conversation_id: context.conversation_id,
          workspace_id: context.workspace_id,
          message_id: context.message_id,
        };

        await runDirectorGraph(
          String(currentState.messages[currentState.messages.length - 1]),
          workspaceId,
          directorContext,
        );

        if (currentState.plan_failed) {
          currentState.tool_history = [];
          currentState.plan_failed = false;
          currentState.current_step = 0;
          currentState.results = [];
          currentState.replan_count++;
        }

        persistence.save(workspaceId, currentState);
      } else if (nextStep === 'build') {
        context.cancel_check?.();

        await context.send_message('', SegmentType.STATE_CHANGE, {
          state: 'build',
          step: currentState.current_step + 1,
          total: currentState.plan.length,
        });

        const directorContext: DirectorMessageContext = {
          send_message: context.send_message,
          session_id: context.session_id,
          conversation_id: context.conversation_id,
          workspace_id: context.workspace_id,
          message_id: context.message_id,
        };

        await runDirectorGraph(
          String(currentState.messages[currentState.messages.length - 1]),
          workspaceId,
          directorContext,
        );

        currentState.current_step++;
        persistence.save(workspaceId, currentState);
      } else if (nextStep === 'compaction') {
        const compactionResult = runCompaction(currentState.messages, fullConfig.max_messages);
        currentState.messages = compactionResult.messages;
        persistence.save(workspaceId, currentState);
      }
    }

    persistence.save(workspaceId, currentState);

    logger.info({
      event: 'orchestrator.completed',
      workspace_id: workspaceId,
    });
  } catch (err) {
    logger.error({
      event: 'orchestrator.failed',
      workspace_id: workspaceId,
      error: String(err),
    });

    await context.send_message(`执行失败: ${String(err)}`, SegmentType.ERROR);
  }
}

export { getPreviousResults, checkState, PersistenceServiceImpl };
