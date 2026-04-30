import { getRenderer, strategyRegistry } from '../strategies';
import { MergedSegment, MergedSegmentType } from '../types';

const makeMerged = (overrides: Partial<MergedSegment>): MergedSegment => ({
  mid: 'mid1',
  type: MergedSegmentType.TEXT,
  content: 'test content',
  meta: {},
  ...overrides,
});

describe('strategyRegistry', () => {
  it('has a renderer for every MergedSegmentType', () => {
    const types = Object.values(MergedSegmentType);
    types.forEach((type) => {
      expect(() => getRenderer(type)).not.toThrow();
    });
  });

  it('each renderer canRender() its own type', () => {
    Object.entries(strategyRegistry).forEach(([type, renderer]) => {
      expect(renderer.canRender(type as MergedSegmentType)).toBe(true);
    });
  });
});

describe('individual strategies renderToXml()', () => {
  const cases: [MergedSegmentType, string][] = [
    [MergedSegmentType.TEXT, 'text'],
    [MergedSegmentType.THINKING, 'thinking'],
    [MergedSegmentType.PLAN, 'plan'],
    [MergedSegmentType.TOOL_CALL, 'tool_call'],
    [MergedSegmentType.TOOL_RES, 'tool_res'],
    [MergedSegmentType.ERROR, 'error'],
    [MergedSegmentType.STATE_CHANGE, 'state_change'],
  ];

  cases.forEach(([type, expectedTag]) => {
    it(`${type} strategy produces <${expectedTag}> tag with mid attribute`, () => {
      const renderer = getRenderer(type);
      const xml = renderer.renderToXml(makeMerged({ type, mid: 'test-mid' }));
      expect(xml).toContain(`<${expectedTag}`);
      expect(xml).toContain('mid="test-mid"');
      expect(xml).toContain(`</${expectedTag}>`);
    });
  });

  it('TextStrategy escapes < > & in content', () => {
    const renderer = getRenderer(MergedSegmentType.TEXT);
    const xml = renderer.renderToXml(makeMerged({ content: '<script>&</script>' }));
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&amp;');
  });

  it('all strategy renderToComponent() stubs return null', () => {
    Object.values(strategyRegistry).forEach((renderer) => {
      expect(renderer.renderToComponent(makeMerged({ type: renderer.segmentType }))).toBeNull();
    });
  });
});
