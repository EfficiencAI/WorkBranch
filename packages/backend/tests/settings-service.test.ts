import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  ensureSettingFile: vi.fn((defaults: Record<string, unknown>) => {
    if (Object.keys(storage.data).length === 0) {
      storage.data = structuredClone(defaults);
    }
    return true;
  }),
  readSettings: vi.fn(() => structuredClone(storage.data)),
  writeSettings: vi.fn((data: Record<string, unknown>) => {
    storage.data = structuredClone(data);
  }),
}));

vi.mock('../src/data', () => ({ fileStorage: storage }));

import { SettingsService } from '../src/service/settings-service/settings-service';

describe('SettingsService partial updates', () => {
  beforeEach(() => {
    storage.data = {};
    vi.clearAllMocks();
  });

  it('preserves omitted LLM settings when onboarding patches credentials', () => {
    const service = new SettingsService();

    service.updateSettings({
      llm: {
        api_key: 'test-key',
        base_url: 'https://example.test/v1',
        model: 'test-model',
      },
    });

    expect(service.get('llm:api_key')).toBe('test-key');
    expect(service.get('llm:temperature')).toBe(0.7);
    expect(service.get('llm:max_tokens')).toBe(4096);
    expect(service.get('ui:theme_mode')).toBe('system');
    expect(service.get('agent:default_agent')).toBe('builtin');
    expect(service.get('trae_cli:max_steps')).toBe(200);
    expect(storage.data).toEqual(service.getAll());
  });

  it('replaces arrays and scalar values while preserving sibling settings', () => {
    const service = new SettingsService();

    service.updateSettings({
      logging: { sensitive_fields: ['credential'] },
      ui: { scale: 1.2 },
    });

    expect(service.get('logging:sensitive_fields')).toEqual(['credential']);
    expect(service.get('logging:enabled')).toBe(true);
    expect(service.get('ui:scale')).toBe(1.2);
    expect(service.get('ui:theme_mode')).toBe('system');
  });
});
