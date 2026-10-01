import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { bedAxes } from '@shared/domain/geometry.ts';
import {
  suggestPlantings,
  SUGGESTION_RANK_LABEL,
  SUGGESTION_RANKS,
  type Suggestion,
  type SuggestionRank,
  type SuggestionReason,
} from '@shared/domain/suggestions.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { DateInput, FormButton, FormGroup, FormRow, NumberInput, Select, Toggle } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { cropColor } from '../../lib/cropColors.ts';
import { todayISO } from '../../lib/format.ts';
import { useBeds, useCropGroups, usePlants, useSeeds } from '../../lib/queries.ts';
import { blankPlanting, datesSummary } from './plantingView.ts';
import { useChecksContext } from './useChecks.ts';
import s from './SuggestionSheet.module.css';

export interface SuggestionRequest {
  bedId: number | null;
  /** Sáv a tengely mentén (a szerkesztőből); üresen a teljes ágyásban keres */
  strip?: { start: number; span: number } | null;
  cross?: { start: number; span: number } | null;
  /** Legkorábbi kezdés */
  from?: string | null;
  /** A szerkesztett ültetés (nem számít foglaltságnak) */
  excludeId?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  year: number;
  request: SuggestionRequest;
  onPick: (suggestion: Suggestion, bedId: number) => void;
}

const TONE: Record<SuggestionReason['level'], 'good' | 'neutral' | 'warn' | 'bad'> = {
  ok: 'good',
  info: 'neutral',
  figyelem: 'warn',
  kerulendo: 'bad',
};
const RANK_COLOR: Record<SuggestionRank, string> = {
  ajanlott: 'var(--c-green)',
  lehetseges: 'var(--c-gray)',
  kerulendo: 'var(--c-red)',
};
const SHOWN = 8;

/** Az év eleje, az idei évben a mai nap. */
const defaultFrom = (year: number) => {
  const today = todayISO();
  return today.startsWith(String(year)) ? today : `${year}-01-01`;
};

/** „Mi kerülhet ide?” – rangsorolt javaslatok egy ágyáshoz vagy ágyásrészhez. */
export function SuggestionSheet({ open, onClose, year, request, onPick }: Props) {
  const ctx = useChecksContext(year);
  const { data: plants = [] } = usePlants();
  const { data: seeds = [] } = useSeeds();
  const { data: beds = [] } = useBeds(year);
  const { data: groups = [] } = useCropGroups();
  const [bedId, setBedId] = useState<number | null>(null);
  const [useStrip, setUseStrip] = useState(false);
  const [start, setStart] = useState<number | null>(0);
  const [span, setSpan] = useState<number | null>(null);
  const [from, setFrom] = useState(defaultFrom(year));
  const [expanded, setExpanded] = useState<Set<SuggestionRank>>(new Set());

  useEffect(() => {
    if (!open) return;
    setBedId(request.bedId ?? beds.find((b) => b.active)?.id ?? null);
    setUseStrip(!!request.strip);
    setStart(request.strip?.start ?? 0);
    setSpan(request.strip?.span ?? null);
    setFrom(request.from && request.from > defaultFrom(year) ? request.from : defaultFrom(year));
    setExpanded(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bed = ctx?.beds.find((b) => b.id === bedId);
  const axis = bed ? bedAxes(bed).axis : null;
  const codeOf = new Map(groups.map((g) => [g.id, g.code]));
  // A kérés objektuma minden szülő-rendereléskor új, ezért a számításhoz az értékeit figyeljük
  const crossStart = request.cross?.start;
  const crossSpan = request.cross?.span;

  const suggestions = useMemo(() => {
    if (!open || !ctx || !bed || !plants.length || !from) return null;
    const strip = useStrip && span ? { start: start ?? 0, span } : null;
    const cross = crossSpan ? { start: crossStart ?? 0, span: crossSpan } : null;
    return suggestPlantings({
      target: { bed, year, strip, cross, from, today: todayISO(), excludeId: request.excludeId },
      plants,
      seeds,
      ctx,
    });
  }, [open, ctx, bed, plants, seeds, year, useStrip, start, span, from, crossStart, crossSpan, request.excludeId]);

  const byRank = Map.groupBy(suggestions ?? [], (x) => x.rank);
  const toggle = (rank: SuggestionRank) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });

  return (
    <Sheet title="Mi kerülhet ide?" open={open} onClose={onClose}>
      <FormGroup
        title="Hely és idő"
        footer="A javaslat a vetésforgót, a szomszédokat, a vetőmagkészletet és a korábbi értékeléseidet veszi figyelembe, és csak azt mutatja, ami a termesztési időszakába és a szabad helyre belefér."
      >
        <FormRow label="Ágyás">
          <Select value={bedId ?? ''} onChange={(e) => setBedId(e.target.value ? Number(e.target.value) : null)}>
            {!bedId && <option value="">Válassz…</option>}
            {beds
              .filter((b) => b.active || b.id === bedId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
        </FormRow>
        {bed && (
          <FormRow label="Csak egy sávban">
            <Toggle
              label="Csak egy sávban"
              checked={useStrip}
              onChange={(v) => {
                setUseStrip(v);
                if (v && !span) setSpan(Math.min(60, axis ?? 60));
              }}
            />
          </FormRow>
        )}
        {bed && useStrip && (
          <>
            <FormRow label="Kezdete">
              <NumberInput value={start} min={0} unit="cm" onChange={setStart} />
            </FormRow>
            <FormRow label="Szélessége">
              <NumberInput value={span} min={1} unit="cm" onChange={setSpan} />
            </FormRow>
          </>
        )}
        <FormRow label="Legkorábban">
          <DateInput value={from} onChange={(v) => v && setFrom(v)} />
        </FormRow>
      </FormGroup>

      {suggestions && suggestions.length === 0 && (
        <p className={s.empty}>
          Ebben {useStrip ? 'a sávban' : 'az ágyásban'} és időszakban egyik növény sem fér el. Próbálj későbbi kezdést vagy
          szélesebb sávot.
        </p>
      )}

      {SUGGESTION_RANKS.map((rank) => {
        const items = byRank.get(rank) ?? [];
        if (!items.length) return null;
        const isExpanded = expanded.has(rank);
        const hidden = rank === 'kerulendo' ? !isExpanded : !isExpanded && items.length > SHOWN;
        const visible = isExpanded ? items : rank === 'kerulendo' ? [] : items.slice(0, SHOWN);
        return (
          <FormGroup key={rank} title={`${SUGGESTION_RANK_LABEL[rank]} (${items.length})`}>
            {visible.map((sg) => (
              <SuggestionRow
                key={sg.plant.id}
                suggestion={sg}
                year={year}
                color={cropColor(codeOf.get(sg.plant.crop_group_id ?? 0))}
                rankColor={RANK_COLOR[rank]}
                onPick={() => bedId && onPick(sg, bedId)}
              />
            ))}
            {hidden && (
              <FormButton onClick={() => toggle(rank)}>
                {rank === 'kerulendo' ? `Kerülendők megjelenítése (${items.length})` : `Továbbiak (${items.length - SHOWN})`}
              </FormButton>
            )}
          </FormGroup>
        );
      })}
    </Sheet>
  );
}

function SuggestionRow({
  suggestion: sg,
  year,
  color,
  rankColor,
  onPick,
}: {
  suggestion: Suggestion;
  year: number;
  color: string;
  rankColor: string;
  onPick: () => void;
}) {
  const p = sg.placement;
  const summary = datesSummary(
    {
      ...blankPlanting(),
      year,
      method: sg.method,
      plan_sow_date: sg.dates.sow,
      plan_transplant_date: sg.dates.transplant,
      plan_harvest_start: sg.dates.harvestStart,
      plan_end_date: sg.dates.end,
    },
    year,
  );
  const place = `${sg.rows} sor · ${Math.round(p.axis_start_cm)}–${Math.round(p.axis_start_cm + p.axis_span_cm)} cm`;
  return (
    <button type="button" className={s.row} onClick={onPick} style={{ '--sc': color, '--rc': rankColor } as CSSProperties}>
      <span className={s.swatch} />
      <span className={s.body}>
        <span className={s.title}>
          {sg.plant.name_hu}
          {sg.variety_name && <span className={s.variety}> – {sg.variety_name}</span>}
        </span>
        <span className={s.meta}>
          {summary} · {place}
        </span>
        <span className={s.chips}>
          {sg.reasons.map((r) => (
            <span key={r.text} title={r.detail}>
              <Chip tone={TONE[r.level]}>{r.text}</Chip>
            </span>
          ))}
        </span>
      </span>
      <ChevronRight size={16} className={s.chevron} />
    </button>
  );
}
