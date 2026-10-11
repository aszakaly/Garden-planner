import { useNavigate } from 'react-router';
import type { PlantingListItem } from '@shared/types.ts';
import { effectiveBedId } from '../../plan/plantingView.ts';

/** Honnan jött a felhasználó a munkalapra: a vissza gomb ide visz. */
export interface BackTo {
  to: string;
  label: string;
}

/** A munkalap hivatkozása: az ágyás, kijelölt ültetéssel vagy javaslatlistával. */
export function workspaceLink(bedId: number, opts: { planting?: number; suggest?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (opts.planting != null) q.set('ultetes', String(opts.planting));
  if (opts.suggest) q.set('javaslat', '1');
  const query = q.toString();
  return `/agyas/${bedId}${query ? `?${query}` : ''}`;
}

/**
 * Ágyáshoz kötött belépés: az ágyásban álló ültetés a munkalapon nyílik, kijelölve; a hely
 * nélküli a megadott lapon (`fallback`). A munkalap vissza gombja a hívó oldalra visz.
 */
export function useOpenPlanting(back: BackTo, fallback: (p: PlantingListItem) => void) {
  const navigate = useNavigate();
  return (p: PlantingListItem) => {
    const bed = effectiveBedId(p);
    if (bed == null) fallback(p);
    else navigate(workspaceLink(bed, { planting: p.id }), { state: { back } });
  };
}
