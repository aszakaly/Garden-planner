import type { SegmentKind } from '@shared/domain/calendar.ts';

/** A naptárszakaszok színei (vetés, kiültetés, betakarítás…). */
export const SEGMENT_COLOR: Record<SegmentKind, string> = {
  vetes_talcaba: 'var(--c-purple)',
  helyrevetes: 'var(--c-green)',
  ultetes: 'var(--c-brown)',
  kiultetes: 'var(--c-teal)',
  betakaritas: 'var(--c-orange)',
};
