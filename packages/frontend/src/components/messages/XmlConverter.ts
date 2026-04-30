import type { MergedSegment } from './types';
import { MergedSegmentType } from './types';

export const ALLOWED_XML_TAGS = Object.values(MergedSegmentType).map(t => t.toLowerCase());

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function segmentToXmlElement(seg: MergedSegment): string {
  const tag = seg.type.toLowerCase();
  const metaAttr =
    Object.keys(seg.meta).length > 0
      ? ` meta="${escapeXml(JSON.stringify(seg.meta))}"`
      : '';
  return `<${tag} mid="${escapeXml(seg.mid)}"${metaAttr}>${escapeXml(seg.content)}</${tag}>`;
}

/**
 * Converts a list of merged segments into a well-formed XML string.
 * Root element is <message>; each segment becomes a child element named after its type.
 */
export function toXml(segments: MergedSegment[]): string {
  const body = segments.map(segmentToXmlElement).join('\n  ');
  return `<message>\n  ${body}\n</message>`;
}

/**
 * Checks whether the XML string parses without errors using DOMParser.
 * Returns null on success, or an error message string on failure.
 */
export function validateXml(xml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  return parseError ? (parseError.textContent ?? 'XML parse error') : null;
}

export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the structure of the generated XML:
 * - Root tag must be <message>
 * - Each child tag must be a known MergedSegmentType
 * - Each child must have a non-empty "mid" attribute
 */
export function validateXmlStructure(xml: string): XmlValidationResult {
  const errors: string[] = [];

  const parseErrorMsg = validateXml(xml);
  if (parseErrorMsg) {
    return { valid: false, errors: [parseErrorMsg] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  if (doc.documentElement.tagName !== 'message') {
    errors.push(`Expected root tag <message>, got <${doc.documentElement.tagName}>`);
  }

  Array.from(doc.documentElement.children).forEach((child, i) => {
    if (!ALLOWED_XML_TAGS.includes(child.tagName)) {
      errors.push(`Unknown segment type at index ${i}: <${child.tagName}>`);
    }
    if (!child.getAttribute('mid')) {
      errors.push(`Segment at index ${i} (<${child.tagName}>) is missing required "mid" attribute`);
    }
  });

  return { valid: errors.length === 0, errors };
}
