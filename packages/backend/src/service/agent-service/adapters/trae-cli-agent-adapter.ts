import { spawn } from 'child_process';
import assert from 'node:assert/strict';
import * as path from 'path';
import { logger } from '../../../core/logging';
import { SegmentType } from '../../session-service/canonical';
import { settingsService } from '../../settings-service';
import type { AgentOutcome } from '../graph/agent-graphs';
import type { AgentState } from '../state/agent-state';
import {
  collectWorkflowEvents,
  extractTraeFailureMessage,
  extractTraeFinalResult,
  formatTraeExitError,
  readTraeTrajectory,
  writeTraeConfig,
  type TraeCliRuntimeSettings,
} from './trae-cli-runtime';
import type { AgentAdapter, AgentAdapterContext, AgentId } from './types';

function formatMessages(title: string, messages: Array<Record<string, unknown>>): string {
  if (messages.length === 0) {
    return `${title}\n无`;
  }

  const lines = messages.map((message, index) => {
    assert(
      message.role === 'user' || message.role === 'assistant',
      'Agent context message role is invalid',
    );
    assert(typeof message.content === 'string', 'Agent context message content must be a string');
    const role = message.role === 'user' ? 'User' : 'Assistant';
    return `#${index + 1}\n${role}: ${message.content}`;
  });

  return `${title}\n${lines.join('\n\n')}`;
}

export function buildTraePrompt(context: AgentAdapterContext): string {
  return [
    '你正在 WorkBranch 树形对话软件中执行任务。',
    '请根据上下文完成当前用户任务；如需修改文件，只能在指定 working directory 内操作。',
    formatMessages('【父节点链上下文】', context.parentChainMessages),
    formatMessages('【当前节点已有消息】', context.currentConversationMessages),
    `【当前用户任务】\n${context.userMessage}`,
  ].join('\n\n');
}

function requireString(key: string): string {
  const value = settingsService.get(key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Trae CLI setting must be a non-empty string: ${key}`);
  }
  return value;
}

function requireNumber(key: string): number {
  const value = settingsService.get(key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Trae CLI setting must be a finite number: ${key}`);
  }
  return value;
}

function requireStringArray(key: string): string[] {
  const value = settingsService.get(key);
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`Trae CLI setting must be a non-empty string array: ${key}`);
  }
  return [...value] as string[];
}

function getRuntimeSettings(): TraeCliRuntimeSettings {
  const showWorkflow = settingsService.get('trae_cli:show_workflow');
  if (typeof showWorkflow !== 'boolean') {
    throw new Error('Trae CLI setting must be boolean: trae_cli:show_workflow');
  }

  const provider = requireString('trae_cli:provider');
  if (!/^[a-zA-Z0-9_]+$/.test(provider)) {
    throw new Error('Trae CLI provider contains unsupported characters');
  }

  const maxSteps = requireNumber('trae_cli:max_steps');
  const systemPromptRaw = settingsService.get('trae_cli:system_prompt');
  const systemPrompt = typeof systemPromptRaw === 'string' ? systemPromptRaw : '';
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new Error('Trae CLI max_steps must be a positive integer');
  }

  return {
    executable: requireString('trae_cli:executable'),
    provider,
    maxSteps,
    tools: requireStringArray('trae_cli:tools'),
    showWorkflow,
    apiKey: requireString('llm:api_key'),
    baseUrl: requireString('llm:base_url'),
    model: requireString('llm:model'),
    temperature: requireNumber('llm:temperature'),
    maxTokens: requireNumber('llm:max_tokens'),
    systemPrompt,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class TraeCliAgentAdapter implements AgentAdapter {
  id: AgentId = 'trae';

  async run(context: AgentAdapterContext): Promise<AgentOutcome> {
    const runtime = getRuntimeSettings();
    const prompt = buildTraePrompt(context);
    const effectiveTools = runtime.tools.filter((tool) => tool !== 'web_search' || context.webSearchEnabled !== false);
    const runRuntime = { ...runtime, tools: effectiveTools };
    const { configFile, trajectoryDir } = writeTraeConfig(context.workspaceDir, runRuntime);
    const trajectoryFile = path.join(trajectoryDir, `${context.messageId}.json`);

    const child = spawn(runtime.executable, [
      'run',
      prompt,
      '--working-dir',
      context.workspaceDir,
      '--config-file',
      configFile,
      '--provider',
      runtime.provider,
      '--model',
      runtime.model,
      '--max-steps',
      String(runtime.maxSteps),
      '--trajectory-file',
      trajectoryFile,
      '--console-type',
      'simple',
    ], {
      cwd: context.workspaceDir,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        [`${runtime.provider.toUpperCase()}_API_KEY`]: runtime.apiKey,
        [`${runtime.provider.toUpperCase()}_BASE_URL`]: runtime.baseUrl,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '',
      },
    });

    const killChild = () => {
      if (!child.killed) child.kill();
    };
    context.signal.addEventListener('abort', killChild, { once: true });

    let stdout = '';
    let stderr = '';
    let emittedStepCount = 0;

    const publishTrajectory = async (): Promise<void> => {
      if (!runtime.showWorkflow) return;
      const trajectory = readTraeTrajectory(trajectoryFile);
      if (!trajectory) return;

      const collected = collectWorkflowEvents(trajectory, emittedStepCount);
      emittedStepCount = collected.emittedStepCount;
      for (const event of collected.events) {
        await context.publish(event.content, event.type, event.metadata);
      }
    };

    try {
      const closePromise = new Promise<number | null>((resolve, reject) => {
        child.stdout.on('data', (chunk: Buffer) => {
          const content = chunk.toString('utf8');
          stdout += content;
          logger.debug({ event: 'trae.cli.stdout', message_id: context.messageId, content });
        });

        child.stderr.on('data', (chunk: Buffer) => {
          const content = chunk.toString('utf8');
          stderr += content;
          logger.debug({ event: 'trae.cli.stderr', message_id: context.messageId, content });
        });

        child.on('error', (error) => {
          reject(new Error(`Failed to start Trae CLI executable "${runtime.executable}": ${String(error)}`));
        });
        child.on('close', (code) => {
          if (context.signal.aborted) {
            reject(new Error('Trae CLI run cancelled'));
            return;
          }
          resolve(code);
        });
      });

      let closed = false;
      closePromise.finally(() => {
        closed = true;
      }).catch(() => undefined);

      while (!closed) {
        context.cancelCheck();
        await publishTrajectory();
        await delay(250);
      }

      const exitCode = await closePromise;
      await publishTrajectory();

      if (exitCode !== 0) {
        throw new Error(formatTraeExitError(exitCode, stdout, stderr));
      }

      const trajectory = readTraeTrajectory(trajectoryFile);
      if (!trajectory) {
        throw new Error(`Trae CLI trajectory is missing or invalid: ${trajectoryFile}`);
      }
      if (trajectory.success !== true) {
        const failureMessage = extractTraeFailureMessage(trajectory);
        throw new Error(
          failureMessage
            ? `Trae CLI reported failure: ${failureMessage}`
            : 'Trae CLI reported failure without error details'
        );
      }
      const finalResult = extractTraeFinalResult(trajectory);
      if (!finalResult) {
        throw new Error('Trae CLI completed without a final result');
      }

      await context.publish(finalResult.content, SegmentType.TEXT_DELTA, {
        agent_id: this.id,
        source: finalResult.source,
      });

      return {
        kind: 'graph',
        agent_type: this.id,
        status: 'completed',
        payload: finalResult.content,
        produced_user_reply: true,
        exit_info: {
          code: 'trae_cli_completed',
          message: null,
          details: { trajectory_file: trajectoryFile },
        },
        final_state: {} as AgentState,
      };
    } finally {
      context.signal.removeEventListener('abort', killChild);
    }
  }
}
