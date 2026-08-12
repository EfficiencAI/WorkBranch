import { extractMarkdownText } from '../markdownText';

describe('extractMarkdownText', () => {
  it('returns empty string for empty input', () => {
    expect(extractMarkdownText('')).toBe('');
    expect(extractMarkdownText('   ')).toBe('');
  });

  it('falls back to raw text when content is not a JSON block array', () => {
    expect(extractMarkdownText('plain **markdown** text')).toBe('plain **markdown** text');
  });

  it('keeps only TEXT and PLAN segments, merging deltas', () => {
    const content = JSON.stringify([
      { type: 'text_start', content: '' },
      { type: 'text_delta', content: 'Hello ' },
      { type: 'text_delta', content: '**World**' },
      { type: 'thinking_delta', content: 'should be dropped' },
      { type: 'tool_call', content: 'should be dropped too' },
      { type: 'text_end', content: '' },
    ]);
    expect(extractMarkdownText(content)).toBe('Hello **World**');
  });

  it('keeps PLAN segments', () => {
    const content = JSON.stringify([
      { type: 'plan_delta', content: '1. Step one' },
      { type: 'plan_delta', content: '\n2. Step two' },
    ]);
    expect(extractMarkdownText(content)).toBe('1. Step one\n2. Step two');
  });
});