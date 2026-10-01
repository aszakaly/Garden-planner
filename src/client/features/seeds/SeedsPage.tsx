import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SEED_ORIGIN_LABEL } from '@shared/labels.ts';
import { SEED_VIABILITY_LABEL } from '@shared/domain/seeds.ts';
import type { SeedStockListItem } from '@shared/types.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { api } from '../../lib/api.ts';
import { qk, useApiMutation, useSeeds } from '../../lib/queries.ts';
import { useStoredState } from '../../lib/useStoredState.ts';
import { SeedEditSheet } from './SeedEditSheet.tsx';
import s from './SeedsPage.module.css';

type Filter = 'keszleten' | 'elfogyott' | 'mind';

export function SeedsPage() {
  const { data: seeds = [], isLoading } = useSeeds();
  const [filter, setFilter] = useStoredState<Filter>('kerttervezo.seedFilter', 'keszleten');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<SeedStockListItem | 'new' | null>(null);
  const toggle = useApiMutation(
    (seed: SeedStockListItem) => api.patch(`/seeds/${seed.id}`, { in_stock: !seed.in_stock }),
    [qk.seeds, ['plants'], qk.plantings],
  );

  const inStock = seeds.filter((x) => x.in_stock);
  const stats = {
    inStock: inStock.length,
    lastYear: inStock.filter((x) => x.viability === 'utolso').length,
    expired: inStock.filter((x) => x.viability === 'lejart').length,
  };

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('hu');
    const visible = seeds.filter(
      (x) =>
        (filter === 'mind' || (filter === 'keszleten') === x.in_stock) &&
        (!q || `${x.plant_name} ${x.variety_name} ${x.supplier ?? ''}`.toLocaleLowerCase('hu').includes(q)),
    );
    const byPlant = Map.groupBy(visible, (x) => x.plant_name);
    return [...byPlant.entries()].sort(([a], [b]) => a.localeCompare(b, 'hu'));
  }, [seeds, filter, query]);

  return (
    <div className={s.page}>
      <PageHeader
        title="Vetőmagkészlet"
        color="var(--c-purple)"
        count={stats.inStock || undefined}
        actions={
          <ToolbarButton label="Új vetőmag" onClick={() => setEditing('new')}>
            <Plus size={19} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      <div className={s.stats}>
        <Stat value={stats.inStock} label="tétel készleten" />
        <Stat value={stats.lastYear} label="idén használd fel" tone={stats.lastYear ? 'warn' : undefined} />
        <Stat value={stats.expired} label="lejárt csírázóképességű" tone={stats.expired ? 'bad' : undefined} />
      </div>

      <div className={s.controls}>
        <SegmentedControl<Filter>
          label="Szűrés"
          value={filter}
          options={[
            { value: 'keszleten', label: 'Készleten' },
            { value: 'elfogyott', label: 'Elfogyott' },
            { value: 'mind', label: 'Mind' },
          ]}
          onChange={setFilter}
        />
        <label className={s.search}>
          <Search size={15} strokeWidth={2.4} />
          <input type="search" placeholder="Keresés" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {!isLoading && seeds.length === 0 && (
        <div className={s.empty}>
          <p className={s.emptyTitle}>Még nincs rögzített vetőmag</p>
          <p>Vedd fel a meglévő magjaidat – a tervezésnél látni fogod, mi van készleten, és mit kell beszerezni.</p>
          <button type="button" className={s.emptyButton} onClick={() => setEditing('new')}>
            <Plus size={16} strokeWidth={2.4} /> Első vetőmag felvétele
          </button>
        </div>
      )}
      {seeds.length > 0 && groups.length === 0 && <p className={s.muted}>Nincs a szűrésnek megfelelő tétel.</p>}

      {groups.map(([plantName, items]) => (
        <Section key={plantName} title={plantName} detail={`${items.length}`}>
          {items.map((seed) => (
            <div key={seed.id} className={`${s.row} ${seed.in_stock ? '' : s.out}`}>
              <div className={s.rowInner}>
              <button type="button" className={s.rowMain} onClick={() => setEditing(seed)}>
                <span className={s.title}>{seed.variety_name}</span>
                <span className={s.meta}>
                  {[seed.vintage_year, SEED_ORIGIN_LABEL[seed.origin_type], seed.supplier, seed.quantity]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {seed.in_stock && (seed.viability === 'utolso' || seed.viability === 'lejart') && (
                  <span className={s.chips}>
                    <Chip tone={seed.viability === 'lejart' ? 'bad' : 'warn'}>{SEED_VIABILITY_LABEL[seed.viability]}</Chip>
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`${s.stock} ${seed.in_stock ? s.stockOn : ''}`}
                onClick={() => toggle.mutate(seed)}
                aria-pressed={seed.in_stock}
                title={seed.in_stock ? 'Jelölés elfogyottként' : 'Jelölés készletenként'}
              >
                {seed.in_stock ? 'Készleten' : 'Elfogyott'}
              </button>
              </div>
            </div>
          ))}
        </Section>
      ))}

      <SeedEditSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        seed={editing && editing !== 'new' ? editing : undefined}
      />
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
