import { describe, expect, it } from 'vitest';
import { getAllowedTools, isToolAllowed } from '../src/service/agent-service/graph/subgraphs/tool-registry';

describe('tool registry web search permission', () => {
  it('keeps explore_internet when web search is enabled', () => {
    expect(getAllowedTools('director_agent', true)).toContain('explore_internet');
    expect(isToolAllowed('explore_internet', 'director_agent', true)).toBe(true);
  });

  it('removes explore_internet when web search is disabled', () => {
    expect(getAllowedTools('director_agent', false)).not.toContain('explore_internet');
    expect(isToolAllowed('explore_internet', 'director_agent', false)).toBe(false);
    expect(isToolAllowed('read_file', 'director_agent', false)).toBe(true);
  });
});
