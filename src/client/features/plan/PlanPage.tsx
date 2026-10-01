import { NotebookPen, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MONTHS_HU, PLAN_YEAR_STATUS_LABEL } from '@shared/labels.ts';
import type { Suggestion } from '@shared/domain/suggestions.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { useBeds, useCarryCandidates, usePlanYear, usePlantings, useSettings } from '../../lib/queries.ts';
import { useStoredState } from '../../lib/useStoredState.ts';
import { useYear } from '../../lib/year.tsx';
import { CarryOverCard } from './CarryOverCard.tsx';
import { GardenTimeline } from './GardenTimeline.tsx';
import { NextYearPanel } from './NextYearPanel.tsx';
import { PlanYearSheet } from './PlanYearSheet.tsx';
import { SuggestionSheet } from './SuggestionSheet.tsx';
import { PlantingEditSheet } from './PlantingEditSheet.tsx';
import { PlantingRow } from './PlantingRow.tsx';
import { TimelineLegend } from './TimelineLegend.tsx';
import { byStart, effectiveBedId, firstActionOf, needsSeed } from './plantingView.ts';
import { useYearChecks } from './useChecks.ts';
import s from './PlanPage.module.css';

type View = 'agyas' | 'idorend';

export function PlanPage() {
  const { year } = useYear();
  const { data: plantings = [], isLoading } = usePlantings(year);
  const { data: beds = [] } = useBeds(year);
  const { data: settings } = useSettings();
  const [view, setView] = useStoredState<View>('kerttervezo.planView', 'agyas');
  const [editing, setEditing] = useState<PlantingListItem | 'new' | null>(null);
  const [editTab, setEditTab] = useState<'terv' | 'teny'>('terv');
  const [yearSheet, setYearSheet] = useState(false);
  const [suggestBed, setSuggestBed] = useState<number | null>(null);
  const [picked, setPicked] = useState<{ suggestion: Suggestion; bedId: number } | null>(null);
  const { data: planYear } = usePlanYear(year);
  const { data: candidates = [] } = useCarryCandidates(year);

  const own = plantings.filter((p) => p.year === year);
  const checks = useYearChecks(year);
  const clashIds = new Set(checks.issues.filter((i) => i.category === 'utkozes').map((i) => i.plantingId));
  const bedById = new Map(beds.map((b) => [b.id, b]));
  const timelineBeds = beds.filter((b) => b.active || plantings.some((p) => effectiveBedId(p) === b.id));

  const missingSeeds = new Set(own.filter((p) => needsSeed(p) && !p.has_seed).map((p) => p.variety_id ?? `n${p.plant_id}`));
  const stats = {
    count: own.length,
    unplaced: own.filter((p) => effectiveBedId(p) == null).length,
    seeds: missingSeeds.size,
    clashes: checks.warnings.filter((i) => i.category === 'utkozes').length,
  };

  const byBed = useMemo(() => {
    const sorted = [...plantings].sort(byStart);
    const groups = beds
      .map((b) => ({ bed: b, items: sorted.filter((p) => effectiveBedId(p) === b.id) }))
      .filter((g) => g.items.length);
    return { groups, unplaced: sorted.filter((p) => effectiveBedId(p) == null && p.year === year) };
  }, [plantings, beds, year]);

  const byMonth = useMemo(() => {
    const groups = Map.groupBy([...own].sort((a, b) => (firstActionOf(a) ?? '9').localeCompare(firstActionOf(b) ?? '9')), (p) => {
      const d = firstActionOf(p);
      if (!d) return 'nincs';
      return Number(d.slice(0, 4)) === year ? d.slice(5, 7) : d.slice(0, 4);
    });
    return [...groups.entries()];
  }, [own, year]);

  const monthTitle = (key: string) => {
    if (key === 'nincs') return 'Dátum nélkül';
    if (key.length === 4) return `${key} (évhatáron túl)`;
    const name = MONTHS_HU[Number(key) - 1]!;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Éves terv"
        color="var(--c-green)"
        count={stats.count || undefined}
        subtitle={`${year}${planYear ? ` · ${PLAN_YEAR_STATUS_LABEL[planYear.status]}` : ''}${stats.count ? ` · ${new Set(own.map(effectiveBedId).filter(Boolean)).size} ágyás` : ''}`}
        actions={
          <>
            <ToolbarButton label="Tervév: állapot és jegyzet" onClick={() => setYearSheet(true)}>
              <NotebookPen size={18} strokeWidth={2.1} />
            </ToolbarButton>
            <ToolbarButton label="Új ültetés" onClick={() => setEditing('new')}>
              <Plus size={19} strokeWidth={2.2} />
            </ToolbarButton>
          </>
        }
      />

      {planYear?.notes && (
        <p className={s.yearNotes}>
          {planYear.notes}
          <button type="button" onClick={() => setYearSheet(true)}>
            Szerkesztés
          </button>
        </p>
      )}

      {candidates.length > 0 && (
        <CarryOverCard
          year={year}
          candidates={candidates}
          onOpen={(p) => {
            setEditTab('teny');
            setEditing(p);
          }}
        />
      )}

      {!isLoading && own.length === 0 && (
        <NextYearPanel
          year={year}
          beds={beds}
          ctx={checks.ctx}
          onSuggest={setSuggestBed}
          onNew={() => setEditing('new')}
        />
      )}

      {own.length > 0 && (
        <>
          <div className={s.stats}>
            <Stat value={stats.count} label="ültetés" />
            <Stat value={stats.unplaced} label="elhelyezésre vár" tone={stats.unplaced ? 'warn' : undefined} />
            <Stat value={stats.seeds} label="hiányzó vetőmag" tone={stats.seeds ? 'warn' : undefined} />
            <Stat value={stats.clashes} label="helyütközés" tone={stats.clashes ? 'bad' : undefined} />
          </div>

          <section className={s.timeline}>
            <GardenTimeline
              year={year}
              beds={timelineBeds}
              plantings={plantings}
              clashIds={clashIds}
              frost={settings ?? DEFAULT_SETTINGS}
              onSelect={setEditing}
            />
            <TimelineLegend plantings={plantings} />
          </section>

          <div className={s.controls}>
            <SegmentedControl<View>
              label="Csoportosítás"
              value={view}
              options={[
                { value: 'agyas', label: 'Ágyások szerint' },
                { value: 'idorend', label: 'Időrendben' },
              ]}
              onChange={setView}
            />
          </div>

          {view === 'agyas' && (
            <>
              {byBed.groups.map(({ bed, items }) => (
                <Section
                  key={bed.id}
                  title={
                    <Link to={`/agyas/${bed.id}`} className={s.sectionLink}>
                      {bed.name}
                    </Link>
                  }
                  detail={items.length}
                >
                  {items.map((p) => (
                    <PlantingRow key={p.id} planting={p} year={year} bed={bed} issues={checks.byPlanting.get(p.id)} onOpen={() => setEditing(p)} />
                  ))}
                </Section>
              ))}
              {byBed.unplaced.length > 0 && (
                <Section title="Elhelyezésre vár" detail={byBed.unplaced.length}>
                  {byBed.unplaced.map((p) => (
                    <PlantingRow key={p.id} planting={p} year={year} issues={checks.byPlanting.get(p.id)} onOpen={() => setEditing(p)} />
                  ))}
                </Section>
              )}
            </>
          )}

          {view === 'idorend' &&
            byMonth.map(([key, items]) => (
              <Section key={key} title={monthTitle(key)} detail={items.length}>
                {items.map((p) => (
                  <PlantingRow
                    key={p.id}
                    planting={p}
                    year={year}
                    bed={bedById.get(effectiveBedId(p) ?? 0)}
                    showBed
                    issues={checks.byPlanting.get(p.id)}
                    onOpen={() => setEditing(p)}
                  />
                ))}
              </Section>
            ))}
        </>
      )}

      <PlantingEditSheet
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setEditTab('terv');
          setPicked(null);
        }}
        planting={editing && editing !== 'new' ? editing : undefined}
        bedId={picked?.bedId}
        suggestion={editing === 'new' ? picked?.suggestion : undefined}
        initialTab={editTab}
        year={year}
      />
      <SuggestionSheet
        open={suggestBed !== null}
        onClose={() => setSuggestBed(null)}
        year={year}
        request={{ bedId: suggestBed }}
        onPick={(sg, bedId) => {
          setSuggestBed(null);
          setPicked({ suggestion: sg, bedId });
          setEditing('new');
        }}
      />
      {planYear && <PlanYearSheet open={yearSheet} onClose={() => setYearSheet(false)} planYear={planYear} />}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className={`${s.stat} ${tone ? s[tone] : ''}`}>
      <span className={s.statValue}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  );
}
