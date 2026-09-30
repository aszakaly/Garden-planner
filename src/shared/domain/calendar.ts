import type { GrowingWindow } from '../types.ts';

/** Egy időablak megjelenítendő szakaszainak típusai. */
export type SegmentKind = 'vetes_talcaba' | 'helyrevetes' | 'ultetes' | 'kiultetes' | 'betakaritas';

export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  vetes_talcaba: 'Vetés palántának',
  helyrevetes: 'Helyrevetés',
  ultetes: 'Ültetés',
  kiultetes: 'Kiültetés',
  betakaritas: 'Betakarítás',
};

export interface CalendarSegment {
  kind: SegmentKind;
  /** Az év törtrésze (0 = jan. 1., 1 = dec. 31. vége) */
  start: number;
  end: number;
  /** A szakasz (ez a része) a következő évre esik */
  nextYear: boolean;
}

const CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** 'HH-NN' → az év napja (0-tól, nem szökőévvel számolva). */
export function dayOfYear(md: string): number {
  const m = Number(md.slice(0, 2));
  const d = Number(md.slice(3, 5));
  return CUMULATIVE[m - 1]! + Math.min(d, m === 2 ? 28 : 31) - 1;
}

function range(kind: SegmentKind, from: string, to: string, nextYear = false): CalendarSegment[] {
  const a = dayOfYear(from) / 365;
  const b = (dayOfYear(to) + 1) / 365;
  if (dayOfYear(to) >= dayOfYear(from)) return [{ kind, start: a, end: b, nextYear }];
  // Évhatáron átnyúló tartomány: kettévágjuk, a második rész a következő évre esik
  return [
    { kind, start: a, end: 1, nextYear },
    { kind, start: 0, end: b, nextYear: true },
  ];
}

export function windowSegments(w: GrowingWindow): CalendarSegment[] {
  const out: CalendarSegment[] = [];
  if (w.sow_start && w.sow_end) {
    const kind: SegmentKind =
      w.method === 'palanta' ? 'vetes_talcaba' : w.method === 'ultetes' ? 'ultetes' : 'helyrevetes';
    out.push(...range(kind, w.sow_start, w.sow_end));
  }
  if (w.transplant_start && w.transplant_end) {
    out.push(...range('kiultetes', w.transplant_start, w.transplant_end));
  }
  if (w.harvest_start && w.harvest_end) {
    out.push(...range('betakaritas', w.harvest_start, w.harvest_end, w.harvest_year_offset === 1));
  }
  return out;
}
