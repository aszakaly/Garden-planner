import { ChevronRight, CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_LABEL,
  LEVEL_RANK,
  uniqueIssues,
  type PlantingIssue,
} from '@shared/domain/plantingChecks.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { useStoredState } from '../../lib/useStoredState.ts';
import { useYear } from '../../lib/year.tsx';
import { PlantingEditSheet } from '../plan/PlantingEditSheet.tsx';
import { shortDate } from '@shared/domain/isoDate.ts';
import { plantingTitle, startOf } from '../plan/plantingView.ts';
import { isWarning, useYearChecks } from '../plan/useChecks.ts';
import s from './WarningsPage.module.css';

type Filter = 'fontos' | 'mind';

const ICON = { kerulendo: CircleAlert, figyelem: TriangleAlert, info: Info, ok: CircleCheck } as const;

/** Az év ültetéseinek jelzései kategóriánként: vetésforgó, társítás, ütközés, dátumok, vetőmag, elhelyezés. */
export function WarningsPage() {
  const { year } = useYear();
  const checks = useYearChecks(year);
  const [filter, setFilter] = useStoredState<Filter>('kerttervezo.warningFilter', 'fontos');
  const [editing, setEditing] = useState<PlantingListItem | null>(null);

  const byId = useMemo(() => new Map((checks.ctx?.all ?? []).map((p) => [p.id, p])), [checks.ctx]);
  const visible = uniqueIssues(checks.issues).filter((i) => i.level !== 'ok' && (filter === 'mind' || isWarning(i)));
  const infoCount = uniqueIssues(checks.issues).filter((i) => i.level === 'info').length;
  const groups = ISSUE_CATEGORIES.map((category) => ({
    category,
    items: visible
      .filter((i) => i.category === category)
      .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || title(a).localeCompare(title(b), 'hu')),
  })).filter((g) => g.items.length);

  function title(i: PlantingIssue) {
    const p = byId.get(i.plantingId);
    return p ? plantingTitle(p) : '';
  }

  return (
    <div className={s.page}>
      <PageHeader
        title="Figyelmeztetések"
        color="var(--c-orange)"
        count={checks.warnings.length || undefined}
        subtitle={`${year} · vetésforgó, társítás, helyütközés, dátumok és vetőmag`}
      />

      <div className={s.controls}>
        <SegmentedControl<Filter>
          label="Szűrés"
          value={filter}
          options={[
            { value: 'fontos', label: 'Fontos' },
            { value: 'mind', label: `Mind${infoCount ? ` (+${infoCount} tájékoztató)` : ''}` },
          ]}
          onChange={setFilter}
        />
      </div>

      {checks.ctx && groups.length === 0 && (
        <div className={s.empty}>
          <CircleCheck size={44} strokeWidth={1.8} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Nincs figyelmeztetés</p>
          <p>
            {byId.size === 0
              ? 'Ha felveszed az ültetéseket, itt jelzi a program a vetésforgó- és társítási gondokat, a helyütközéseket és a fagyveszélyt.'
              : filter === 'fontos' && infoCount
                ? `Ebben az évben (${year}) nincs kerülendő vagy figyelmeztető jelzés. ${infoCount} tájékoztató jelzést a „Mind” nézetben látsz.`
                : `Ebben az évben (${year}) minden ültetés rendben van.`}
          </p>
        </div>
      )}

      {groups.map(({ category, items }) => (
        <Section key={category} title={ISSUE_CATEGORY_LABEL[category]} detail={items.length}>
          {items.map((i) => {
            const p = byId.get(i.plantingId);
            const Icon = ICON[i.level];
            return (
              <div key={i.key} className={s.row}>
                <button type="button" className={s.inner} onClick={() => p && setEditing(p)}>
                  <Icon size={18} strokeWidth={2.3} className={`${s.icon} ${s[i.level]}`} />
                  <span className={s.body}>
                    <span className={s.title}>
                      {p ? plantingTitle(p) : 'Ültetés'}
                      <span className={s.where}>
                        {[p?.bed_name ?? 'Elhelyezésre vár', p && startOf(p) ? shortDate(startOf(p)!) : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className={s.message}>{i.message}</span>
                  </span>
                  <ChevronRight size={16} className={s.chevron} />
                </button>
              </div>
            );
          })}
        </Section>
      ))}

      <PlantingEditSheet open={editing !== null} onClose={() => setEditing(null)} planting={editing ?? undefined} year={year} />
    </div>
  );
}
