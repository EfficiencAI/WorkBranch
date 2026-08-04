import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { SegmentType } from '../src/service/session-service/canonical';
import {
  buildTraeConfig,
  collectWorkflowEvents,
  extractTraeFailureMessage,
  extractTraeFinalResult,
  formatTraeExitError,
  readTraeTrajectory,
  writeTraeConfig,
  type TraeCliRuntimeSettings,
} from '../src/service/agent-service/adapters/trae-cli-runtime';

const tempDirs: string[] = [];

function createSettings(): TraeCliRuntimeSettings {
  return {
    executable: 'trae-cli',
    provider: 'openai',
    maxSteps: 200,
    tools: ['bash', 'str_replace_based_edit_tool', 'sequentialthinking', 'task_done'],
    showWorkflow: true,
    apiKey: 'secret-key',
    baseUrl: 'https://example.test/v1',
    model: 'test-model',
    temperature: 0.7,
    maxTokens: 4096,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Trae CLI runtime', () => {
  it('writes a complete config without persisting the API key', () => {
    const settings = createSettings();
    const config = buildTraeConfig(settings);
    const serialized = JSON.stringify(config);

    expect(serialized).not.toContain(settings.apiKey);
    expect(config).toMatchObject({
      agents: { trae_agent: { max_steps: 200, tools: settings.tools } },
      model_providers: { openai: { api_key: '', provider: 'openai' } },
      models: { workbranch_model: { model: 'test-model' } },
    });

    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workbranch-trae-'));
    tempDirs.push(workspace);
    const result = writeTraeConfig(workspace, settings);
    expect(fs.existsSync(result.configFile)).toBe(true);
    expect(fs.readFileSync(result.configFile, 'utf8')).not.toContain(settings.apiKey);
  });

  it('maps new trajectory steps to structured workflow events exactly once', () => {
    const trajectory = {
      agent_steps: [{
        step_number: 1,
        state: 'completed',
        llm_response: {
          content: 'Inspect the settings path',
          tool_calls: [{ call_id: 'call-1', name: 'bash', arguments: { command: 'rg settings' } }],
        },
        tool_results: [{ call_id: 'call-1', success: true, result: 'settings-service.ts' }],
      }],
    };

    const first = collectWorkflowEvents(trajectory, 0);
    expect(first.events.map((event) => event.type)).toEqual([
      SegmentType.STATE_CHANGE,
      SegmentType.THINKING_START,
      SegmentType.THINKING_DELTA,
      SegmentType.THINKING_END,
      SegmentType.TOOL_CALL,
      SegmentType.TOOL_RES,
    ]);
    expect(first.events[4].content).toContain('rg settings');
    expect(first.events[5].metadata.success).toBe(true);

    const second = collectWorkflowEvents(trajectory, first.emittedStepCount);
    expect(second.events).toEqual([]);
  });

  it('tolerates a trajectory while the CLI is rewriting it', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workbranch-trae-'));
    tempDirs.push(workspace);
    const trajectoryFile = path.join(workspace, 'trajectory.json');
    fs.writeFileSync(trajectoryFile, '{"agent_steps":', 'utf8');
    expect(readTraeTrajectory(trajectoryFile)).toBeNull();
  });

  it('includes stdout and stderr in CLI exit errors', () => {
    expect(formatTraeExitError(1, 'Config file not found', 'warning')).toContain(
      'warning\nConfig file not found'
    );
  });

  it('prefers the explicit trajectory final result', () => {
    expect(extractTraeFinalResult({
      final_result: 'explicit result',
      agent_steps: [{ state: 'completed', llm_response: { content: 'step result' } }],
    })).toEqual({ content: 'explicit result', source: 'trajectory.final_result' });
  });

  it('uses the last completed non-empty response when Trae leaves final_result empty', () => {
    expect(extractTraeFinalResult({
      final_result: '',
      agent_steps: [
        { state: 'completed', llm_response: { content: 'TRAE_OK' } },
        { state: 'completed', llm_response: { content: '' } },
      ],
    })).toEqual({
      content: 'TRAE_OK',
      source: 'trajectory.agent_steps.llm_response.content',
    });
  });

  it('rejects trajectories without any completed response text', () => {
    expect(extractTraeFinalResult({
      final_result: '   ',
      agent_steps: [{ state: 'running', llm_response: { content: 'partial' } }],
    })).toBeNull();
  });

  it('extracts the last step error when a failed trajectory has no final result', () => {
    expect(extractTraeFailureMessage({
      success: false,
      final_result: '',
      agent_steps: [
        { state: 'completed', error: 'first error' },
        { state: 'completed', error: 'response parse failed' },
      ],
    })).toBe('response parse failed');
  });
});
