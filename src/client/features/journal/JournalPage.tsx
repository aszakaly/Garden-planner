import { BookOpen, Plus, Search } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { harvestTotals } from '@shared/domain/journal.ts';
import { JOURNAL_TYPE_LABEL, JOURNAL_TYPES, MONTHS_HU, type JournalType } from '@shared/labels.ts';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { todayISO } from '../../lib/format.ts';
import { useBeds, useJournal, usePlants } from '../../lib/queries.ts';
import { useStoredState } from '../../lib/useStoredState.ts';
import { useYear } from '../../lib/year.tsx';
import { JournalRow } from './JournalRow.tsx';
import { formatAmount, JOURNAL_TYPE_COLOR } from './journalView.ts';
import { useJournalSheet } from './useJournalSheet.tsx';
import s from './Journal.module.css';

type YearScope = 'ev' | 'mind';

/** A napló: dátum szerint csoportosított bejegyzések, kereséssel és szűrőkkel. */
export function JournalPage() {
  const { year } = useYear();
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [debounced, setDebounced] = useState(urlQuery.trim());
  const [scope, setScope] = useStoredState<YearScope>('kerttervezo.journalScope', 'ev');
  const [hidden, setHidden] = useStoredState<JournalType[]>('kerttervezo.journalHidden', []);
  const bedFilter = Number(params.get('agyas')) || undefined;
  const plantFilter = Number(params.get('noveny')) || undefined;
  const { data: beds = [] } = useBeds(year);
  const { data: plants = [] } = usePlants();
  const sheet = useJournalSheet();

  // Adatlapról „minden év” nézettel érkezünk
  useEffect(() => {
    if (params.get('ev') === 'mind') setScope('mind');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  // Az oldalsáv keresőjéből érkező kifejezés
  useEffect(() => setQuery(urlQuery), [urlQuery]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: entries, isLoading } = useJournal({
    q: debounced || undefined,
    year: scope === 'ev' ? year : undefined,
    bed_id: bedFilter,
    plant_id: plantFilter,
  });
  const shown = (entries ?? []).filter((e) => !hidden.includes(e.entry_type));
  const byMonth = Map.groupBy(shown, (e) => e.entry_date.slice(0, 7));
  const totals = harvestTotals(shown);
  const filtered = !!(debounced || bedFilter || plantFilter || hidden.length);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const toggleType = (t: JournalType) => setHidden(hidden.includes(t) ? hidden.filter((x) => x !== t) : [...hidden, t]);
  const create = () =>
    sheet.create({ entry_date: todayISO(), bed_id: bedFilter ?? null, plant_id: plantFilter ?? null });

  return (
    <div className={s.page}>
      <PageHeader
        title="Napló"
        color="var(--c-brown)"
        count={shown.length}
        actions={
          <ToolbarButton label="Új bejegyzés" onClick={create}>
            <Plus size={19} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      <div className={s.controls}>
        <label className={s.search}>
          <Search size={15} strokeWidth={2.4} />
          <input type="search" placeholder="Keresés a naplóban" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <SegmentedControl<YearScope>
          label="Időszak"
          size="small"
          value={scope}
          options={[
            { value: 'ev', label: String(year) },
            { value: 'mind', label: 'Minden év' },
          ]}
          onChange={setScope}
        />
      </div>

      <div className={s.filters}>
        {JOURNAL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`${s.filterChip} ${hidden.includes(t) ? s.filterOff : ''}`}
            style={{ '--c': JOURNAL_TYPE_COLOR[t] } as CSSProperties}
            aria-pressed={!hidden.includes(t)}
            onClick={() => toggleType(t)}
          >
            <i />
            {JOURNAL_TYPE_LABEL[t]}
          </button>
        ))}
        <span className={s.filterSelects}>
          <select className={s.filterSelect} value={bedFilter ?? ''} onChange={(e) => setParam('agyas', e.target.value)} aria-label="Ágyás">
            <option value="">Minden ágyás</option>
            {beds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select className={s.filterSelect} value={plantFilter ?? ''} onChange={(e) => setParam('noveny', e.target.value)} aria-label="Növény">
            <option value="">Minden növény</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_hu}
              </option>
            ))}
          </select>
        </span>
      </div>

      {totals.length > 0 && (
        <p className={s.totals}>
          Rögzített termés{filtered ? ' (a szűrés szerint)' : ''}: {totals.map((t) => formatAmount(t.amount, t.unit)).join(' · ')}
        </p>
      )}

      {[...byMonth.entries()].map(([month, items]) => (
        <Section key={month} title={`${month.slice(0, 4)}. ${MONTHS_HU[Number(month.slice(5, 7)) - 1]}`} detail={items.length}>
          {items.map((e) => (
            <JournalRow key={e.id} entry={e} onOpen={sheet.open} />
          ))}
        </Section>
      ))}

      {!isLoading && shown.length === 0 && (
        <div className={s.empty}>
          <BookOpen size={44} strokeWidth={1.8} className={s.emptyIcon} />
          <p className={s.emptyTitle}>{filtered ? 'Nincs találat' : scope === 'ev' ? `${year}: még nincs bejegyzés` : 'Még nincs bejegyzés'}</p>
          <p>
            {filtered
              ? 'Próbálj más keresőszót, vagy kapcsold be a többi típust.'
              : 'Jegyezd fel, mit láttál a kertben: kelést, termést, betegséget, kártevőt. A bejegyzések az ültetésekhez, fajtákhoz és ágyásokhoz köthetők, így jövőre is visszakereshetők.'}
          </p>
          {!filtered && (
            <button type="button" className={s.emptyButton} onClick={create}>
              <Plus size={16} strokeWidth={2.6} />
              Új bejegyzés
            </button>
          )}
        </div>
      )}

      {sheet.sheet}
    </div>
  );
}
