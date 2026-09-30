import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip } from '../../components/ui/Chip.tsx';
import { LinkRow } from '../../components/ui/LinkRow.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { useCropGroups, usePlants } from '../../lib/queries.ts';
import { useStoredState } from '../../lib/useStoredState.ts';
import { useIsMobile } from '../../lib/useIsMobile.ts';
import { GROUPING_OPTIONS, groupPlants, type Grouping } from './grouping.ts';
import { MiniCalendar, MiniCalendarHeader } from './SeasonCalendar.tsx';
import { PlantEditSheet } from './PlantEditSheet.tsx';
import s from './PlantsPage.module.css';

export function PlantsPage() {
  const { data: plants = [], isLoading } = usePlants();
  const { data: cropGroups = [] } = useCropGroups();
  const [grouping, setGrouping] = useStoredState<Grouping>('kerttervezo.plantGrouping', 'csalad');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plants;
    return plants.filter(
      (p) =>
        p.name_hu.toLowerCase().includes(q) ||
        p.name_latin?.toLowerCase().includes(q) ||
        p.aliases_en.some((a) => a.includes(q)),
    );
  }, [plants, query]);
  const groups = useMemo(() => groupPlants(filtered, grouping, cropGroups), [filtered, grouping, cropGroups]);

  return (
    <div className={s.page}>
      <PageHeader
        title="Növények"
        color="var(--c-mint)"
        count={plants.length || undefined}
        actions={
          <ToolbarButton label="Új növény" onClick={() => setCreating(true)}>
            <Plus size={19} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      <div className={s.controls}>
        <SegmentedControl label="Csoportosítás" value={grouping} options={GROUPING_OPTIONS} onChange={setGrouping} />
        <label className={s.search}>
          <Search size={15} strokeWidth={2.4} />
          <input
            type="search"
            placeholder="Keresés név szerint"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {!isMobile && groups.length > 0 && (
        <div className={s.calendarHeader}>
          <MiniCalendarHeader />
        </div>
      )}

      {isLoading && <p className={s.muted}>Betöltés…</p>}
      {!isLoading && groups.length === 0 && <p className={s.muted}>Nincs találat.</p>}

      {groups.map((g) => (
        <Section key={g.key} title={g.title} detail={`${g.items.length}`}>
          {g.detail && <p className={s.groupDetail}>{g.detail}</p>}
          {g.items.map((p) => (
            <LinkRow
              key={p.id}
              to={`/novenyek/${p.id}`}
              title={p.name_hu}
              subtitle={[p.name_latin, p.variety_count ? `${p.variety_count} fajta` : null].filter(Boolean).join(' · ')}
              accessory={
                <>
                  {p.perennial && <Chip>Évelő</Chip>}
                  {!isMobile && <MiniCalendar windows={p.windows} />}
                </>
              }
            />
          ))}
        </Section>
      ))}

      <PlantEditSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
