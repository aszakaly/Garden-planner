import type { CSSProperties } from 'react';
import type { PlantingListItem } from '@shared/types.ts';
import { cropColor } from '../../lib/cropColors.ts';
import s from './Timeline.module.css';

/** Jelmagyarázat: a megjelenő zöldségcsoportok színei és a vonaltípusok. */
export function TimelineLegend({ plantings, tray }: { plantings: PlantingListItem[]; tray?: boolean }) {
  const groups = [...new Map(plantings.map((p) => [p.crop_group_code, p.crop_group_name])).entries()].filter(
    (g): g is [string, string] => !!g[0] && !!g[1],
  );
  return (
    <div className={s.legend}>
      {groups.map(([code, name]) => (
        <span key={code} className={s.legendItem}>
          <span className={s.swatch} style={{ '--sc': cropColor(code) } as CSSProperties} />
          {name}
        </span>
      ))}
      <span className={s.legendItem}>
        <span className={`${s.swatch} ${s.swatchPlanned}`} /> szaggatott: terv · sötétebb vég: betakarítás
      </span>
      {tray && <span className={s.legendItem}>pontozott vonal: palántanevelés</span>}
      <span className={s.legendItem}>
        <span className={s.lineFrost} /> fagyhatárok
      </span>
      <span className={s.legendItem}>
        <span className={s.lineToday} /> ma
      </span>
    </div>
  );
}
