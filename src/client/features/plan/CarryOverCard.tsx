import { useEffect, useState } from 'react';
import { yearOnto, yearOutOf } from '@shared/text.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { Checkbox } from '../../components/ui/Checkbox.tsx';
import { api } from '../../lib/api.ts';
import { colorVar } from '../../lib/colors.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation } from '../../lib/queries.ts';
import { plantingTitle } from './plantingView.ts';
import s from './PlanPage.module.css';

interface Props {
  year: number;
  candidates: PlantingListItem[];
  /** Egy évelő megnyitása (pl. ha már nem áll, a megszűnés napjának rögzítéséhez) */
  onOpen: (p: PlantingListItem) => void;
}

/** Az előző évben álló évelők átvitele az új évbe. */
export function CarryOverCard({ year, candidates, onOpen }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(candidates.map((p) => p.id)));
  const carry = useApiMutation(
    (ids: number[]) => api.post<PlantingListItem[]>(`/plan-years/${year}/carryover`, { ids }),
    [qk.plantings, qk.planYear(year)],
  );

  // Új jelöltnél (pl. évváltás után) alapból mind ki van jelölve
  const key = candidates.map((p) => p.id).join(',');
  useEffect(() => setSelected(new Set(candidates.map((p) => p.id))), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section className={s.carry}>
      <h2 className={s.carryTitle}>Évelők {yearOutOf(year - 1)}</h2>
      <p className={s.carryText}>
        Ezek {year - 1} végén is az ágyásokban álltak. Átvitelkor ugyanarra a helyre kerülnek, január 1-jétől foglalják a
        helyet, és csak a betakarítás kerül a feladatok közé. Ami már nem áll, azt nyisd meg, és a Megvalósulás fülön add
        meg, mikor szűnt meg.
      </p>
      <div className={s.carryList}>
        {candidates.map((p) => (
          <div key={p.id} className={s.carryRow}>
            <Checkbox
              checked={selected.has(p.id)}
              onChange={(on) => toggle(p.id, on)}
              color={p.bed_color ? colorVar(p.bed_color) : 'var(--c-green)'}
              label={`${plantingTitle(p)} átvitele`}
            />
            <button type="button" className={s.carryName} onClick={() => onOpen(p)}>
              {plantingTitle(p)}
              <span className={s.carryBed}>{p.bed_name ?? 'ágyás nélkül'}</span>
            </button>
          </div>
        ))}
      </div>
      {carry.error && <p className={s.carryError}>{errorMessage(carry.error)}</p>}
      <button
        type="button"
        className={s.emptyButton}
        disabled={!selected.size || carry.isPending}
        onClick={() => carry.mutate([...selected])}
      >
        {carry.isPending ? 'Átvitel…' : `Átvitel ${yearOnto(year)} (${selected.size})`}
      </button>
    </section>
  );
}
