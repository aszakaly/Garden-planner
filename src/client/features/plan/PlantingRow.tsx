import { ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { cropColor } from '../../lib/cropColors.ts';
import { datesSummary, needsSeed, placementSummary, plantingTitle, type ClashInfo } from './plantingView.ts';
import s from './PlantingRow.module.css';

interface Props {
  planting: PlantingListItem;
  /** A megjelenített év (az ennél korábbi ültetés „előző évről” áthúzódó) */
  year: number;
  bed?: Bed;
  showBed?: boolean;
  clashes?: ClashInfo[];
  onOpen: () => void;
}

/** Egy ültetés a listákban: növény és fajta, dátumok, hely, jelzések. */
export function PlantingRow({ planting: p, year, bed, showBed, clashes, onOpen }: Props) {
  const place = [showBed ? (p.bed_name ?? 'Elhelyezésre vár') : null, placementSummary(p, bed)].filter(Boolean).join(' · ');
  const unplacedInBed = p.bed_id != null && p.axis_start_cm == null && p.actual_axis_start_cm == null;
  return (
    <div className={s.row}>
      <button type="button" className={s.inner} onClick={onOpen}>
        <span className={s.swatch} style={{ '--sc': cropColor(p.crop_group_code) } as CSSProperties} />
        <span className={s.body}>
          <span className={s.title}>{plantingTitle(p)}</span>
          <span className={s.meta}>{datesSummary(p, year)}</span>
          {place && <span className={s.meta}>{place}</span>}
          <span className={s.chips}>
            {!!clashes?.length && (
              <Chip tone="bad">Ütközik: {[...new Set(clashes.map((c) => c.other.plant_name))].join(', ')}</Chip>
            )}
            {needsSeed(p) && !p.has_seed && p.year >= year && <Chip tone="warn">Nincs vetőmag</Chip>}
            {(p.series_size ?? 0) > 1 && (
              <Chip tone="info">
                Újravetés {p.series_index}/{p.series_size}
              </Chip>
            )}
            {p.year < year && <Chip>Előző évről</Chip>}
            {p.is_history && <Chip>Előzmény</Chip>}
            {unplacedInBed && <Chip>Nincs kijelölt sávja</Chip>}
          </span>
        </span>
        <ChevronRight size={16} className={s.chevron} />
      </button>
    </div>
  );
}
