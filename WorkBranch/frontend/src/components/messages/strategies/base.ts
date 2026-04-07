import type { MergedSegment } from '../types';
import { MergedSegmentType } from '../types';
import type { ReactNode } from 'react';

/**
 * Unified interface every segment rendering strategy must implement.
 * Phase 1: only renderToXml() is required; renderToComponent() is stubbed for future phases.
 */
export interface SegmentRenderer {
  /** Returns the segment type this strategy handles. */
  readonly segmentType: MergedSegmentType;

  /** Whether this strategy can handle the given type. */
  canRender(type: MergedSegmentType): boolean;

  /** Serialises the segment to its XML representation. */
  renderToXml(segment: MergedSegment): string;

  /**
   * Phase 2 placeholder: renders the segment as a React node.
   * Returns null until concrete visual rendering is implemented.
   */
  renderToComponent(segment: MergedSegment): ReactNode;
}

/**
 * Abstract base class providing default implementations.
 * Concrete strategies extend this and override as needed.
 */
export abstract class BaseSegmentRenderer implements SegmentRenderer {
  abstract readonly segmentType: MergedSegmentType;

  canRender(type: MergedSegmentType): boolean {
    return type === this.segmentType;
  }

  abstract renderToXml(segment: MergedSegment): string;

  // Phase 2 stub
  renderToComponent(_segment: MergedSegment): ReactNode {
    return null;
  }
}
