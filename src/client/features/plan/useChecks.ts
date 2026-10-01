import { useMemo } from 'react';
import { companionIndex } from '@shared/domain/companions.ts';
import { checkYear, uniqueIssues, type ChecksContext, type PlantingIssue } from '@shared/domain/plantingChecks.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import type { GrowingWindow } from '@shared/types.ts';
import { useBeds, useCompanions, useFamilies, usePlantingHistory, usePlants, useSettings } from '../../lib/queries.ts';

/** Az ellenőrzésekhez szükséges adatok egy évre (az előző évek ültetéseivel együtt). */
export function useChecksContext(year: number): ChecksContext | null {
  const { data: all } = usePlantingHistory(year);
  const { data: beds } = useBeds(year);
  const { data: families } = useFamilies();
  const { data: companions } = useCompanions();
  const { data: settings } = useSettings();
  const { data: plants } = usePlants();
  return useMemo(() => {
    if (!all || !beds || !families || !companions) return null;
    const windows = new Map<number, GrowingWindow>((plants ?? []).flatMap((p) => p.windows.map((w) => [w.id, w] as const)));
    return {
      all,
      beds,
      families: new Map(families.map((f) => [f.id, f])),
      companions: companionIndex(companions),
      frost: settings ?? DEFAULT_SETTINGS,
      currentYear: new Date().getFullYear(),
      windows,
    };
  }, [all, beds, families, companions, settings, plants]);
}

export interface YearChecks {
  ctx: ChecksContext | null;
  issues: PlantingIssue[];
  byPlanting: Map<number, PlantingIssue[]>;
  /** Kerülendő és figyelmeztető jelzések (páronként egyszer) */
  warnings: PlantingIssue[];
}

export const isWarning = (i: PlantingIssue) => i.level === 'kerulendo' || i.level === 'figyelem';

/** Az év összes ültetésének ellenőrzése (vetésforgó, társítás, ütközés, dátum, vetőmag, elhelyezés). */
export function useYearChecks(year: number): YearChecks {
  const ctx = useChecksContext(year);
  return useMemo(() => {
    const issues = ctx ? checkYear(year, ctx) : [];
    return {
      ctx,
      issues,
      byPlanting: Map.groupBy(issues, (i) => i.plantingId),
      warnings: uniqueIssues(issues).filter(isWarning),
    };
  }, [ctx, year]);
}
