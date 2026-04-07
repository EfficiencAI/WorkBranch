import { toXml, validateXmlStructure } from '../XmlConverter';
import { MergedSegment, MergedSegmentType } from '../types';

const makeMerged = (overrides: Partial<MergedSegment>): MergedSegment => ({
  mid: 'mid1',
  type: MergedSegmentType.TEXT,
  content: '',
  meta: {},
  ...overrides,
});

describe('toXml', () => {
  it('wraps segments in <message> root', () => {
    const xml = toXml([makeMerged({ content: 'hello' })]);
    expect(xml).toContain('<message>');
    expect(xml).toContain('</message>');
  });

  it('uses lowercase type as element tag', () => {
    const xml = toXml([makeMerged({ type: MergedSegmentType.THINKING, content: 'deep' })]);
    expect(xml).toContain('<thinking');
    expect(xml).toContain('</thinking>');
  });

  it('includes mid attribute on each segment element', () => {
    const xml = toXml([makeMerged({ mid: 'abc123', content: 'x' })]);
    expect(xml).toContain('mid="abc123"');
  });

  it('escapes special XML characters in content', () => {
    const xml = toXml([makeMerged({ content: '<b>bold</b> & "quoted"' })]);
    expect(xml).not.toContain('<b>');
    expect(xml).toContain('&lt;b&gt;');
    expect(xml).toContain('&amp;');
  });

  it('produces empty <message> for empty input', () => {
    const xml = toXml([]);
    expect(xml).toContain('<message>');
    expect(xml).toContain('</message>');
  });
});

describe('validateXmlStructure', () => {
  it('passes valid XML with known types', () => {
    const xml = toXml([
      makeMerged({ type: MergedSegmentType.TEXT, content: 'hi' }),
      makeMerged({ type: MergedSegmentType.THINKING, content: 'hmm' }),
    ]);
    const { valid, errors } = validateXmlStructure(xml);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('fails for malformed XML', () => {
    const { valid } = validateXmlStructure('<message><unclosed></message>');
    expect(valid).toBe(false);
  });

  it('fails for unknown segment tag', () => {
    const { valid, errors } = validateXmlStructure('<message><unknown mid="x">val</unknown></message>');
    expect(valid).toBe(false);
    expect(errors[0]).toContain('unknown');
  });

  it('fails for segments missing mid attribute', () => {
    const { valid, errors } = validateXmlStructure('<message><text>val</text></message>');
    expect(valid).toBe(false);
    expect(errors[0]).toContain('mid');
  });
});
