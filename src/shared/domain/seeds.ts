/**
 * Vetőmag csírázóképessége az évjárat és a faj csírázóképességi ideje alapján.
 *
 * - 'ok'       – még bőven jó
 * - 'utolso'   – idén használható utoljára
 * - 'lejart'   – a csírázóképesség ideje letelt (vetés előtt csíráztatási próba javasolt)
 * - 'ismeretlen' – nincs évjárat vagy nincs adat a fajról
 */
export type SeedViability = 'ok' | 'utolso' | 'lejart' | 'ismeretlen';

export function seedViability(
  vintageYear: number | null | undefined,
  viabilityYears: number | null | undefined,
  currentYear: number,
): SeedViability {
  if (!vintageYear || !viabilityYears) return 'ismeretlen';
  const lastYear = vintageYear + viabilityYears;
  if (currentYear > lastYear) return 'lejart';
  if (currentYear === lastYear) return 'utolso';
  return 'ok';
}

export const SEED_VIABILITY_LABEL: Record<SeedViability, string> = {
  ok: 'Jól csírázik',
  utolso: 'Idén használd fel',
  lejart: 'Csírázóképesség lejárt',
  ismeretlen: 'Csírázóképesség ismeretlen',
};
