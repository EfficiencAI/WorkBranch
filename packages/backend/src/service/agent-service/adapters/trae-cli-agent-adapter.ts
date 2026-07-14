import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SegmentType } from '../../session-service/canonical';
import type { AgentOutcome } from '../graph/agent-graphs';
import type { AgentState } from '../state/agent-state';
import type { AgentAdapter, AgentAdapterContext, AgentId } from './types';

function formatMessages(title: string, messages: Array<Record<string, unknown>>): string {
  if (messages.length === 0) {
    return `${title}\n无`;
  }

  const lines = messages.map((message, index) => {
    const user = String(message.user_content ?? message.userContent ?? '');
    const assistant = String(message.assistant_content ?? message.assistantContent ?? '');
    return [
      `#${index + 1}`,
      user ? `User: ${user}` : null,
      assistant ? `Assistant: ${assistant}` : null,
    ].filter(Boolean).join('\n');
  });

  return `${title}\n${lines.join('\n\n')}`;
}

function buildPrompt(context: AgentAdapterContext): string {
  return [
    '你正在 WorkBranch 树形对话软件中执行任务。',
    '请根据上下文完成当前用户任务；如需修改文件，只能在指定 working directory 内操作。',
    formatMessages('【父节点链上下文】', context.parentChainMessages),
    formatMessages('【当前节点已有消息】', context.currentConversationMessages),
    `【当前用户任务】\n${context.userMessage}`,
  ].join('\n\n');
}

export class TraeCliAgentAdapter implements AgentAdapter {
  id: AgentId = 'trae';

  async run(context: AgentAdapterContext): Promise<AgentOutcome> {
    const prompt = buildPrompt(context);
    const trajectoryDir = path.join(context.workspaceDir, '.workbranch', 'trajectories');
    fs.mkdirSync(trajectoryDir, { recursive: true });
    const trajectoryFile = path.join(trajectoryDir, `${context.messageId}.json`);

    // TODO: 支持 trae-cli interactive，按会话/分支复用常驻 Trae 进程。
    const child = spawn('trae-cli', [
      'run',
      prompt,
      '--working-dir',
      context.workspaceDir,
      '--trajectory-file',
      trajectoryFile,
    ], {
      cwd: context.workspaceDir,
      shell: false,
      windowsHide: true,
    });

    const killChild = () => {
      if (!child.killed) {
        child.kill();
      }
    };
    context.signal.addEventListener('abort', killChild, { once: true });

    let output = '';
    let errorOutput = '';

    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (chunk: Buffer) => {
          context.cancelCheck();
          const text = chunk.toString('utf8');
          output += text;
          context.publish(text, SegmentType.TEXT_DELTA, { agent_id: this.id }).catch(reject);
        });

        child.stderr.on('data', (chunk: Buffer) => {
          errorOutput += chunk.toString('utf8');
        });

        child.on('error', reject);
        child.on('close', (code) => {
          if (context.signal.aborted) {
            reject(new Error('Trae CLI run cancelled'));
            return;
          }

          if (code !== 0) {
            reject(new Error(`Trae CLI exited with code ${code}${errorOutput ? `: ${errorOutput}` : ''}`));
            return;
          }

          resolve();
        });
      });
    } finally {
      context.signal.removeEventListener('abort', killChild);
    }

    return {
      kind: 'graph',
      agent_type: this.id,
      status: 'completed',
      payload: output,
      produced_user_reply: output.length > 0,
      exit_info: {
        code: 'trae_cli_completed',
        message: null,
        details: { trajectory_file: trajectoryFile },
      },
      final_state: {} as AgentState,
    };
  }
}
