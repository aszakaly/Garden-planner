import { ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { LEVEL_RANK, type IssueLevel, type PlantingIssue } from '@shared/domain/plantingChecks.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { cropColor } from '../../lib/cropColors.ts';
import { datesSummary, placementSummary, plantingTitle } from './plantingView.ts';
import s from './PlantingRow.module.css';

const TONE: Record<IssueLevel, 'bad' | 'warn' | 'info' | 'good'> = {
  kerulendo: 'bad',
  figyelem: 'warn',
  info: 'info',
  ok: 'good',
};

interface Props {
  planting: PlantingListItem;
  /** A megjelenített év (az ennél korábbi ültetés „előző évről” áthúzódó) */
  year: number;
  bed?: Bed;
  showBed?: boolean;
  /** Az ültetés ellenőrzési jelzései (vetésforgó, társítás, ütközés, …) */
  issues?: PlantingIssue[];
  onOpen: () => void;
}

/** Egy ültetés a listákban: növény és fajta, dátumok, hely, jelzések. */
export function PlantingRow({ planting: p, year, bed, showBed, issues = [], onOpen }: Props) {
  const place = [showBed ? (p.bed_name ?? 'Elhelyezésre vár') : null, placementSummary(p, bed)].filter(Boolean).join(' · ');
  const goodNeighbours = issues.filter((i) => i.category === 'tarsitas' && i.level === 'ok' && i.neighbour).map((i) => i.other);
  const chips = [
    ...new Map(
      [...issues]
        .filter((i) => i.chip && !(i.category === 'tarsitas' && i.level === 'ok'))
        // Ágyás nélküli ültetésnél a csoport címe már elmondja
        .filter((i) => !(i.category === 'elhelyezes' && i.level === 'info' && !showBed && p.bed_id == null))
        .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
        .map((i) => [i.chip, i]),
    ).values(),
  ];
  return (
    <div className={s.row}>
      <button type="button" className={s.inner} onClick={onOpen}>
        <span className={s.swatch} style={{ '--sc': cropColor(p.crop_group_code) } as CSSProperties} />
        <span className={s.body}>
          <span className={s.title}>{plantingTitle(p)}</span>
          <span className={s.meta}>{datesSummary(p, year)}</span>
          {place && <span className={s.meta}>{place}</span>}
          <span className={s.chips}>
            {chips.map((i) => (
              <Chip key={i.chip} tone={TONE[i.level]}>
                {i.chip}
              </Chip>
            ))}
            {goodNeighbours.length > 0 && <Chip tone="good">Jó szomszéd: {goodNeighbours.join(', ')}</Chip>}
            {(p.series_size ?? 0) > 1 && (
              <Chip tone="neutral">
                Újravetés {p.series_index}/{p.series_size}
              </Chip>
            )}
            {p.year < year && <Chip>Előző évről</Chip>}
            {p.is_history && <Chip>Előzmény</Chip>}
          </span>
        </span>
        <ChevronRight size={16} className={s.chevron} />
      </button>
    </div>
  );
}
