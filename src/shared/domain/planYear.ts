import type { PlanYearStatus } from '../labels.ts';
import type { GrowingWindow, PlantingListItem } from '../types.ts';
import { isoFromMonthDay, monthDayOf } from './isoDate.ts';
import { effectiveBedId } from './plantings.ts';

/**
 * Tervév: az év állapota és az évelők átvitele az előző évből.
 */

export interface PlanYear {
  year: number;
  status: PlanYearStatus;
  notes: string | null;
  /** Rögzítették-e már (különben az állapot az évből adódik) */
  stored: boolean;
}

/** Rögzített állapot híján: a jövő év tervezés alatt, az idei folyamatban, a múltbeli lezárva. */
export function defaultPlanYearStatus(year: number, currentYear: number): PlanYearStatus {
  return year > currentYear ? 'tervezes' : year === currentYear ? 'aktiv' : 'lezart';
}

/**
 * Átvihető-e az évelő a következő évbe: az előző évben állt, nem maradt el / pusztult el,
 * és nincs megadva a felszámolása (ha van záró dátuma, az idővonal magától átnyúlik).
 */
export function isCarryCandidate(p: PlantingListItem, year: number): boolean {
  return (
    p.year === year - 1 &&
    p.perennial &&
    p.status !== 'elmaradt' &&
    p.status !== 'sikertelen' &&
    !(p.actual_end_date ?? p.plan_end_date)
  );
}

/**
 * Az előző évi ültetés tervezett betakarítása már az új évre esik (pl. nyár végén telepített
 * eper): ezt az áthozott ültetés veszi át, hogy ne legyen kétszer betakarítási feladat.
 */
export const harvestMovesToCarry = (p: PlantingListItem, year: number) =>
  !p.actual_harvest_start && !!p.plan_harvest_start && p.plan_harvest_start >= `${year}-01-01`;

/**
 * Az áthozott ültetés mezői: ugyanott, ugyanazzal a fajtával, vetés és kiültetés nélkül.
 * A betakarítás az időszak szerinti napra esik (az időszak évhatár-eltolása a telepítés
 * évére vonatkozik, itt már nem számít), időszak híján a tavalyi betakarítás napjára.
 */
export function carriedPlanting(p: PlantingListItem, year: number, window?: Pick<GrowingWindow, 'harvest_start'> | null) {
  const actualPlace = p.actual_axis_start_cm != null && p.actual_axis_span_cm != null;
  const lastHarvest = p.actual_harvest_start ?? p.plan_harvest_start;
  const harvest = harvestMovesToCarry(p, year)
    ? p.plan_harvest_start
    : window?.harvest_start
      ? isoFromMonthDay(year, window.harvest_start)
      : lastHarvest
        ? isoFromMonthDay(year, monthDayOf(lastHarvest))
        : null;
  return {
    year,
    plant_id: p.plant_id,
    variety_id: p.variety_id,
    bed_id: effectiveBedId(p),
    axis_start_cm: actualPlace ? p.actual_axis_start_cm : p.axis_start_cm,
    axis_span_cm: actualPlace ? p.actual_axis_span_cm : p.axis_span_cm,
    cross_start_cm: actualPlace ? p.actual_cross_start_cm : p.cross_start_cm,
    cross_span_cm: actualPlace ? p.actual_cross_span_cm : p.cross_span_cm,
    rows: p.rows,
    plant_count: p.plant_count,
    method: p.method,
    window_id: p.window_id,
    plan_harvest_start: harvest,
    status: 'terv' as const,
    carried_from_id: p.id,
  };
}
