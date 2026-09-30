import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PLANTING_METHODS,
  PLANTING_METHOD_LABEL,
  SEASON_LABEL,
  SEED_ORIGIN_LABEL,
  type CheckLevel,
  type PlantingMethod,
  type WindowMethod,
} from '@shared/labels.ts';
import {
  checkDates,
  completeDates,
  EMPTY_DATES,
  methodsForWindow,
  seriesOffsets,
  setDateShifting,
  suggestDates,
  suggestedSeriesCount,
  usesSow,
  usesTransplant,
  type CropTiming,
  type DateField,
  type PlantingDates,
} from '@shared/domain/dates.ts';
import {
  bedAxes,
  estimatePlantCount,
  firstFreeStart,
  occupantsClash,
  outsideBed,
  rowsForSpan,
  spanForRows,
  type Placement,
} from '@shared/domain/geometry.ts';
import { occupancyPeriod, placeSeries } from '@shared/domain/plantings.ts';
import { addDaysISO, shortDate } from '@shared/domain/isoDate.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import type { PlantingCreateInput } from '@shared/schemas.ts';
import type { BedListItem, GrowingWindow, PlantListItem, PlantingListItem, Variety, VarietyWithWindows } from '@shared/types.ts';
import {
  DateInput,
  FormButton,
  FormGroup,
  FormRow,
  NumberInput,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from '../../components/ui/Form.tsx';
import { NoticeList } from '../../components/ui/Notice.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { cropColor } from '../../lib/cropColors.ts';
import { errorMessage } from '../../lib/errors.ts';
import { withArticle } from '../../lib/format.ts';
import {
  qk,
  useApiMutation,
  useBeds,
  usePlantDetail,
  usePlantings,
  usePlants,
  useSeeds,
  useSettings,
} from '../../lib/queries.ts';
import { BedDiagram, type Strip } from '../garden/BedDiagram.tsx';
import { axisLabel, placedInBed, plantingTitle } from './plantingView.ts';
import s from './PlantingEditSheet.module.css';

const NEW_VARIETY = -1;

interface Form {
  year: number;
  plant_id: number | null;
  variety_id: number | null;
  newVarietyName: string;
  seed_stock_id: number | null;
  window_id: number | null;
  method: PlantingMethod;
  dates: PlantingDates;
  bed_id: number | null;
  rows: number | null;
  axis_span_cm: number | null;
  axis_start_cm: number | null;
  /** Új ültetésnél és ágyásváltáskor a program keres szabad helyet, amíg kézzel meg nem adod */
  autoPlace: boolean;
  fullCross: boolean;
  cross_start_cm: number | null;
  cross_span_cm: number | null;
  plant_count: number | null;
  notes: string;
  seriesOn: boolean;
  seriesCount: number;
  seriesInterval: number;
}

const emptyForm = (year: number): Form => ({
  year,
  plant_id: null,
  variety_id: null,
  newVarietyName: '',
  seed_stock_id: null,
  window_id: null,
  method: 'helyrevetes',
  dates: EMPTY_DATES,
  bed_id: null,
  rows: null,
  axis_span_cm: null,
  axis_start_cm: null,
  autoPlace: true,
  fullCross: true,
  cross_start_cm: null,
  cross_span_cm: null,
  plant_count: null,
  notes: '',
  seriesOn: false,
  seriesCount: 3,
  seriesInterval: 14,
});

function fromPlanting(p: PlantingListItem, bed: BedListItem | undefined): Form {
  const cross = bed ? bedAxes(bed).cross : null;
  const partial = p.cross_span_cm != null && cross != null && p.cross_span_cm < cross;
  return {
    ...emptyForm(p.year),
    plant_id: p.plant_id,
    variety_id: p.variety_id,
    seed_stock_id: p.seed_stock_id,
    window_id: p.window_id,
    method: p.method ?? 'helyrevetes',
    dates: { sow: p.plan_sow_date, transplant: p.plan_transplant_date, harvestStart: p.plan_harvest_start, end: p.plan_end_date },
    bed_id: p.bed_id,
    rows: p.rows,
    axis_span_cm: p.axis_span_cm,
    axis_start_cm: p.axis_start_cm,
    autoPlace: p.bed_id != null && p.axis_start_cm == null,
    fullCross: !partial,
    cross_start_cm: partial ? p.cross_start_cm : null,
    cross_span_cm: partial ? p.cross_span_cm : null,
    plant_count: p.plant_count,
    notes: p.notes ?? '',
  };
}

const METHOD_SHORT: Record<WindowMethod, string> = { helyrevetes: 'helyrevetés', palanta: 'palántáról', ultetes: 'ültetés' };

function windowLabel(w: GrowingWindow, varietyName?: string): string {
  const range =
    w.method === 'palanta' && w.transplant_start && w.transplant_end
      ? `kiültetés ${shortDate(w.transplant_start)} – ${shortDate(w.transplant_end)}`
      : w.sow_start && w.sow_end
        ? `${w.method === 'ultetes' ? 'ültetés' : 'vetés'} ${shortDate(w.sow_start)} – ${shortDate(w.sow_end)}`
        : '';
  return `${varietyName ? `${varietyName}: ` : ''}${SEASON_LABEL[w.season]} · ${METHOD_SHORT[w.method]}${range ? ` (${range})` : ''}`;
}

/** Az idei évben az első még elérhető időszak, egyébként az első. */
function defaultWindow(windows: GrowingWindow[], year: number): GrowingWindow | null {
  if (!windows.length) return null;
  const now = new Date();
  if (year !== now.getFullYear()) return windows[0]!;
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const lastDay = (w: GrowingWindow) => (w.method === 'palanta' ? w.transplant_end : w.sow_end);
  return windows.find((w) => (lastDay(w) ?? '') >= md) ?? windows[0]!;
}

const defaultRows = (rowSpacing: number | null) => (rowSpacing ? Math.max(1, Math.round(60 / rowSpacing)) : 1);

function cropOf(plant: PlantListItem, variety?: Variety | null): CropTiming {
  return {
    daysToHarvest: variety?.days_to_harvest ?? plant.days_to_harvest,
    harvestDurationDays: plant.harvest_duration_days,
    frostSensitive: plant.frost_sensitive,
    perennial: plant.perennial,
  };
}

/** Az űrlap dátumai egy ültetés-szerű objektumként (a foglaltság számításához). */
function periodOf(f: Form) {
  return occupancyPeriod({
    year: f.year,
    method: f.method,
    status: 'terv',
    plan_sow_date: usesSow(f.method) ? f.dates.sow : null,
    plan_transplant_date: usesTransplant(f.method) ? f.dates.transplant : null,
    plan_harvest_start: f.dates.harvestStart,
    plan_end_date: f.dates.end,
    actual_sow_date: null,
    actual_transplant_date: null,
    actual_harvest_start: null,
    actual_end_date: null,
  });
}

function crossOf(f: Form, bed: BedListItem) {
  const { cross } = bedAxes(bed);
  return f.fullCross
    ? { start: 0, span: cross }
    : { start: f.cross_start_cm ?? 0, span: f.cross_span_cm ?? cross };
}

function placementOfForm(f: Form, bed: BedListItem | undefined): Placement | null {
  if (!bed || f.axis_start_cm == null || !f.axis_span_cm) return null;
  const c = crossOf(f, bed);
  return { axis_start_cm: f.axis_start_cm, axis_span_cm: f.axis_span_cm, cross_start_cm: c.start, cross_span_cm: c.span };
}

interface Props {
  open: boolean;
  onClose: () => void;
  planting?: PlantingListItem;
  /** Új ültetésnél előre kiválasztott ágyás / növény */
  bedId?: number;
  plantId?: number;
  year: number;
}

export function PlantingEditSheet({ open, onClose, planting, bedId, plantId, year }: Props) {
  const [form, setForm] = useState<Form>(() => emptyForm(year));
  const { data: plants = [] } = usePlants();
  const { data: settings } = useSettings();
  // Az ütközéseket és a szabad helyet az ültetés saját évében nézzük (az évet a lapon is át lehet állítani)
  const { data: allBeds } = useBeds(form.year);
  const { data: plantings } = usePlantings(form.year);
  const { data: seeds = [] } = useSeeds();
  const { data: detail } = usePlantDetail(form.plant_id ?? 0);
  const frost = settings ?? DEFAULT_SETTINGS;

  const beds = useMemo(
    () => (allBeds ?? []).filter((b) => b.active || b.id === planting?.bed_id || b.id === bedId),
    [allBeds, planting?.bed_id, bedId],
  );
  const others = useMemo(() => (plantings ?? []).filter((p) => p.id !== planting?.id), [plantings, planting?.id]);
  const othersIn = (id: number | null) => {
    const bed = beds.find((b) => b.id === id);
    return bed ? placedInBed(others, bed) : [];
  };

  const ready = plants.length > 0 && !!allBeds && !!plantings && !!settings;

  // Megnyitáskor egyszer alaphelyzetbe állítjuk (ha kell, megvárva az adatokat)
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      // Zárt lapnál az üres űrlap az aktuális évre áll, így nyitáskor már annak az adatai töltődnek
      initialized.current = null;
      setForm(emptyForm(planting?.year ?? year));
      return;
    }
    const key = String(planting?.id ?? 'uj');
    if (!ready || initialized.current === key) return;
    initialized.current = key;
    if (planting) {
      setForm(fromPlanting(planting, beds.find((b) => b.id === planting.bed_id)));
      return;
    }
    let f: Form = { ...emptyForm(year), bed_id: bedId ?? null };
    const plant = plants.find((p) => p.id === plantId);
    if (plant) f = withPlant(f, plant);
    setForm(place(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planting?.id, ready, year]);

  const plant = plants.find((p) => p.id === form.plant_id);
  const varieties: VarietyWithWindows[] = detail?.plant.id === form.plant_id ? detail.varieties : [];
  const variety = varieties.find((v) => v.id === form.variety_id) ?? null;
  const windows: { w: GrowingWindow; label: string }[] = [
    ...(variety?.windows ?? []).map((w) => ({ w, label: windowLabel(w, variety!.name) })),
    ...(plant?.windows ?? []).map((w) => ({ w, label: windowLabel(w) })),
  ];
  const window = windows.find((x) => x.w.id === form.window_id)?.w ?? null;
  const crop = plant ? cropOf(plant, variety) : null;
  const rowSpacing = variety?.row_spacing_cm ?? plant?.row_spacing_cm ?? null;
  const inRowSpacing = variety?.in_row_spacing_cm ?? plant?.in_row_spacing_cm ?? null;
  const bed = beds.find((b) => b.id === form.bed_id);

  // --- Állapotváltások -------------------------------------------------------

  /** Szabad hely keresése, amíg az elhelyezést kézzel nem módosították. */
  function place(f: Form): Form {
    const b = beds.find((x) => x.id === f.bed_id);
    const period = periodOf(f);
    if (!f.autoPlace || !b || !period || !f.axis_span_cm) return f;
    const start = firstFreeStart(bedAxes(b).axis, othersIn(f.bed_id), period, f.axis_span_cm, crossOf(f, b));
    return { ...f, axis_start_cm: start ?? 0 };
  }

  const apply = (fn: (f: Form) => Form) => setForm((f) => place(fn(f)));

  function withWindow(f: Form, w: GrowingWindow | null, c: CropTiming): Form {
    if (!w) return { ...f, window_id: null };
    const methods = methodsForWindow(w.method);
    const method = methods.includes(f.method) ? f.method : methods[0]!;
    const dates = suggestDates({ year: f.year, window: w, method, crop: c, frost });
    const interval = w.succession_days ?? f.seriesInterval;
    const first = dates.sow ?? dates.transplant;
    return {
      ...f,
      window_id: w.id,
      method,
      dates,
      seriesInterval: interval,
      seriesCount: first && w.succession_days ? Math.max(2, suggestedSeriesCount(w, first, interval)) : f.seriesCount,
    };
  }

  function withPlant(f: Form, p: PlantListItem): Form {
    const rows = defaultRows(p.row_spacing_cm);
    const next: Form = {
      ...f,
      plant_id: p.id,
      variety_id: null,
      newVarietyName: '',
      seed_stock_id: null,
      rows,
      axis_span_cm: spanForRows(rows, p.row_spacing_cm),
      plant_count: null,
    };
    return withWindow(next, defaultWindow(p.windows, f.year), cropOf(p));
  }

  const choosePlant = (id: number | null) => {
    const p = plants.find((x) => x.id === id);
    apply((f) => (p ? withPlant(f, p) : { ...f, plant_id: null, variety_id: null, seed_stock_id: null, window_id: null }));
  };

  const chooseVariety = (id: number | null) => {
    const v = varieties.find((x) => x.id === id);
    const stock = seeds
      .filter((x) => x.variety_id === id && x.in_stock)
      .sort((a, b) => (b.vintage_year ?? 0) - (a.vintage_year ?? 0))[0];
    apply((f) => {
      let next: Form = { ...f, variety_id: id, seed_stock_id: stock?.id ?? null };
      const spacing = v?.row_spacing_cm ?? plant?.row_spacing_cm ?? null;
      if (next.rows) next.axis_span_cm = spanForRows(next.rows, spacing);
      if (v?.windows.length && plant) next = withWindow(next, defaultWindow(v.windows, f.year), cropOf(plant, v));
      return next;
    });
  };

  const chooseWindow = (id: number | null) => {
    const w = windows.find((x) => x.w.id === id)?.w ?? null;
    apply((f) => (w && crop ? withWindow(f, w, crop) : { ...f, window_id: null }));
  };

  const chooseMethod = (m: PlantingMethod) =>
    apply((f) => {
      if (window && crop) return { ...f, method: m, dates: suggestDates({ year: f.year, window, method: m, crop, frost }) };
      return { ...f, method: m };
    });

  const setDate = (field: DateField, value: string | null) =>
    apply((f) => {
      let dates = setDateShifting(f.dates, field, value);
      const startField: DateField = usesTransplant(f.method) ? 'transplant' : 'sow';
      if (field === startField && crop) dates = completeDates(dates, f.method, crop, frost);
      return { ...f, dates };
    });

  const resetDates = () =>
    apply((f) => (window && crop ? { ...f, dates: suggestDates({ year: f.year, window, method: f.method, crop, frost }) } : f));

  const changeYear = (y: number) =>
    apply((f) => {
      const delta = y - f.year;
      const move = (d: string | null) => (d ? `${Number(d.slice(0, 4)) + delta}${d.slice(4)}` : null);
      const dates = { sow: move(f.dates.sow), transplant: move(f.dates.transplant), harvestStart: move(f.dates.harvestStart), end: move(f.dates.end) };
      return { ...f, year: y, dates };
    });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => apply((f) => ({ ...f, [k]: v }));

  // --- Származtatott értékek -------------------------------------------------

  const period = periodOf(form);
  const placement = placementOfForm(form, bed);
  const axes = bed ? bedAxes(bed) : null;
  const occupants = othersIn(form.bed_id);
  const estimate = placement ? estimatePlantCount(form.rows, placement.cross_span_cm, inRowSpacing) : null;
  const creatingSeries = !planting && form.seriesOn && form.seriesCount >= 2;
  const offsets = creatingSeries ? seriesOffsets(form.seriesCount, form.seriesInterval) : [0];
  const series = placement && period && axes ? placeSeries({ placement, period }, offsets, axes.axis, occupants) : [];
  const clashing = new Map<number, string>();
  series.forEach((item, i) =>
    occupants.forEach((o) => {
      if (occupantsClash(item, o) && !clashing.has(o.id)) clashing.set(o.id, i === 0 ? '' : ` (${i + 1}. vetés)`);
    }),
  );

  const dateIssues = crop ? checkDates({ dates: form.dates, method: form.method, window, crop, frost }) : [];
  const placementIssues: { level: CheckLevel; message: string }[] = [];
  if (bed && placement && outsideBed(placement, bed)) {
    placementIssues.push({ level: 'kerulendo', message: 'A sáv kilóg az ágyásból – csökkentsd a sorok számát vagy a kezdő távolságot.' });
  }
  for (const o of occupants.filter((x) => clashing.has(x.id))) {
    placementIssues.push({
      level: 'figyelem',
      message: `Ütközik${clashing.get(o.id)}: ${plantingTitle(o.planting)} ugyanitt áll ${shortDate(o.period.start)} – ${shortDate(o.period.end)} között.`,
    });
  }
  if (bed && placement && period && form.autoPlace) {
    const free = firstFreeStart(axes!.axis, occupants, period, placement.axis_span_cm, crossOf(form, bed));
    if (free === null) {
      placementIssues.unshift({
        level: 'figyelem',
        message: `Ebben az időszakban nincs ${placement.axis_span_cm} cm széles szabad sáv az ágyásban – csökkentsd a sorok számát, vagy válassz másik ágyást vagy időpontot.`,
      });
    }
  }
  if (bed && !period) placementIssues.push({ level: 'info', message: 'Dátumok nélkül az ütközést nem lehet ellenőrizni.' });

  const stocks = seeds.filter((x) => x.variety_id === form.variety_id);
  const needsSeed = usesSow(form.method) && !!plant;
  const hasSeedInStock =
    form.variety_id && form.variety_id !== NEW_VARIETY
      ? stocks.some((x) => x.in_stock)
      : seeds.some((x) => x.plant_id === form.plant_id && x.in_stock);
  const seedIssues: { level: CheckLevel; message: string }[] =
    needsSeed && !hasSeedInStock
      ? [
          {
            level: 'info',
            message: form.variety_id
              ? 'Ebből a fajtából nincs vetőmag készleten – be kell szerezni.'
              : `${withArticle(plant!.name_hu.toLowerCase(), true)} egyik fajtájából sincs vetőmag készleten – be kell szerezni.`,
          },
        ]
      : [];

  // --- Mentés ------------------------------------------------------------------

  const invalidate = [qk.plantings, qk.beds, qk.varieties, ['plants']];
  const save = useApiMutation(async (f: Form) => {
    let varietyId = f.variety_id;
    if (varietyId === NEW_VARIETY) {
      varietyId = (await api.post<Variety>(`/plants/${f.plant_id}/varieties`, { name: f.newVarietyName.trim() })).id;
    }
    const p = placementOfForm(f, beds.find((b) => b.id === f.bed_id));
    const body: PlantingCreateInput = {
      year: f.year,
      plant_id: f.plant_id!,
      variety_id: varietyId,
      seed_stock_id: usesSow(f.method) && varietyId === f.variety_id ? f.seed_stock_id : null,
      bed_id: f.bed_id,
      axis_start_cm: p?.axis_start_cm ?? null,
      axis_span_cm: p?.axis_span_cm ?? null,
      cross_start_cm: p && !f.fullCross ? p.cross_start_cm : null,
      cross_span_cm: p && !f.fullCross ? p.cross_span_cm : null,
      rows: f.rows,
      plant_count: f.plant_count,
      method: f.method,
      window_id: f.window_id,
      plan_sow_date: usesSow(f.method) ? f.dates.sow : null,
      plan_transplant_date: usesTransplant(f.method) ? f.dates.transplant : null,
      plan_harvest_start: f.dates.harvestStart,
      plan_end_date: f.dates.end,
      is_history: planting?.is_history ?? false,
      notes: f.notes,
      series: creatingSeries ? { count: f.seriesCount, interval_days: f.seriesInterval } : null,
    };
    if (planting) {
      const { series: _series, ...update } = body;
      return api.put(`/plantings/${planting.id}`, update);
    }
    return api.post('/plantings', body);
  }, invalidate);
  const remove = useApiMutation(
    (whole: boolean) => api.delete(`/plantings/${planting!.id}${whole ? '?series=1' : ''}`),
    invalidate,
  );

  const canSave = !!form.plant_id && (form.variety_id !== NEW_VARIETY || !!form.newVarietyName.trim());
  const thisYear = new Date().getFullYear();
  const years = [...new Set([...Array.from({ length: 10 }, (_, i) => thisYear - 6 + i), form.year])].sort();

  // Rajzolási sorrend: más ültetések, az új / szerkesztett sáv, végül felül az ütközők
  const strips: Strip[] = [];
  const clashStrips: Strip[] = [];
  if (bed && period) {
    for (const o of occupants) {
      if (!series.some((item) => item.period.start < o.period.end && o.period.start < item.period.end)) continue;
      const clash = clashing.has(o.id);
      (clash ? clashStrips : strips).push({
        key: o.id,
        placement: o.placement,
        // Az ütköző sáv neve az alatta lévő jelzésben szerepel; itt csak a helyét mutatjuk
        label: clash ? undefined : o.planting.plant_name,
        color: cropColor(o.planting.crop_group_code),
        variant: clash ? 'clash' : 'muted',
      });
    }
    series.forEach((item, i) =>
      strips.push({
        key: `uj-${i}`,
        placement: item.placement,
        label: i === 0 ? plant?.name_hu : `${i + 1}.`,
        color: cropColor(detail?.crop_group?.code),
        variant: i === 0 ? 'current' : 'ghost',
      }),
    );
    strips.push(...clashStrips);
  }
  const hasOthers = strips.some((x) => x.variant === 'muted' || x.variant === 'clash');

  const sowLabel = form.method === 'palanta' ? 'Vetés (palántának)' : form.method === 'ultetes' ? 'Ültetés' : 'Vetés';

  return (
    <Sheet
      title={planting ? plantingTitle(planting) : 'Új ültetés'}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(form, { onSuccess: onClose })}
      confirmDisabled={!canSave}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Növény">
          <Select value={form.plant_id ?? ''} onChange={(e) => choosePlant(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Válassz…</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_hu}
              </option>
            ))}
          </Select>
        </FormRow>
        {plant && (
          <FormRow label="Fajta">
            <Select
              value={form.variety_id ?? ''}
              onChange={(e) => chooseVariety(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Fajta nélkül</option>
              {varieties.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              <option value={NEW_VARIETY}>＋ Új fajta…</option>
            </Select>
          </FormRow>
        )}
        {form.variety_id === NEW_VARIETY && (
          <FormRow label="Új fajta neve">
            <TextInput value={form.newVarietyName} onChange={(e) => set('newVarietyName', e.target.value)} placeholder="pl. Ökörszív" />
          </FormRow>
        )}
        {form.variety_id && form.variety_id !== NEW_VARIETY && usesSow(form.method) && stocks.length > 0 && (
          <FormRow label="Vetőmag">
            <Select value={form.seed_stock_id ?? ''} onChange={(e) => set('seed_stock_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nincs megadva</option>
              {stocks.map((x) => (
                <option key={x.id} value={x.id}>
                  {[x.vintage_year ?? 'évjárat nélkül', x.supplier ?? SEED_ORIGIN_LABEL[x.origin_type]].join(' · ')}
                  {x.in_stock ? '' : ' (elfogyott)'}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        <FormRow label="Év">
          <Select value={form.year} onChange={(e) => changeYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </FormRow>
      </FormGroup>
      <NoticeList items={seedIssues} />

      {plant && (
        <>
          <FormGroup title="Időszak és módszer" footer={window?.notes ?? undefined}>
            <FormRow label="Időszak">
              <Select value={form.window_id ?? ''} onChange={(e) => chooseWindow(e.target.value ? Number(e.target.value) : null)}>
                {windows.map(({ w, label }) => (
                  <option key={w.id} value={w.id}>
                    {label}
                  </option>
                ))}
                <option value="">Egyéni dátumok</option>
              </Select>
            </FormRow>
            {!window && (
              <FormRow label="Módszer">
                <Select value={form.method} onChange={(e) => chooseMethod(e.target.value as PlantingMethod)}>
                  {PLANTING_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PLANTING_METHOD_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}
          </FormGroup>
          {window?.method === 'palanta' && (
            <div className={s.segment}>
              <SegmentedControl<PlantingMethod>
                label="Palánta"
                value={form.method}
                options={[
                  { value: 'palanta', label: 'Saját nevelés' },
                  { value: 'vasarolt_palanta', label: 'Vásárolt palánta' },
                ]}
                onChange={chooseMethod}
              />
            </div>
          )}

          <FormGroup
            title="Dátumok"
            footer={`A javaslat az időszak elejéről indul${plant.frost_sensitive ? `, fagyérzékeny növénynél legkorábban az utolsó fagy napjától (${shortDate(frost.lastFrost)})` : ''}. Egy dátum módosítása a későbbieket is ugyanannyival tolja.`}
          >
            {usesSow(form.method) && (
              <FormRow label={sowLabel}>
                <DateInput value={form.dates.sow} onChange={(v) => setDate('sow', v)} />
              </FormRow>
            )}
            {usesTransplant(form.method) && (
              <FormRow label="Kiültetés">
                <DateInput value={form.dates.transplant} onChange={(v) => setDate('transplant', v)} />
              </FormRow>
            )}
            <FormRow label="Betakarítás kezdete">
              <DateInput value={form.dates.harvestStart} onChange={(v) => setDate('harvestStart', v)} />
            </FormRow>
            <FormRow label={plant.perennial ? 'Terület felszabadul (évelő)' : 'Terület felszabadul'}>
              <DateInput value={form.dates.end} onChange={(v) => setDate('end', v)} />
            </FormRow>
            {window && <FormButton onClick={resetDates}>Javasolt dátumok visszaállítása</FormButton>}
          </FormGroup>
          <NoticeList items={dateIssues} />

          <FormGroup
            title="Elhelyezés"
            footer={
              bed && axes
                ? `A sávok az ágyás ${axisLabel(bed)} mentén (${axes.axis} cm) követik egymást; a kezdet az ágyás ${bed.row_direction === 'keresztben' ? 'elejétől' : 'hosszanti szélétől'} mért távolság.${rowSpacing ? ` Sortáv ${rowSpacing} cm` : ''}${inRowSpacing ? `, tőtáv ${inRowSpacing} cm.` : rowSpacing ? '.' : ''}`
                : 'Ágyás nélkül az ültetés az „Elhelyezésre vár” listába kerül.'
            }
          >
            <FormRow label="Ágyás">
              <Select
                value={form.bed_id ?? ''}
                onChange={(e) =>
                  apply((f) => ({ ...f, bed_id: e.target.value ? Number(e.target.value) : null, autoPlace: true }))
                }
              >
                <option value="">Még nincs helye</option>
                {beds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormRow>
            {bed && axes && (
              <>
                <FormRow label="Sorok száma">
                  <NumberInput
                    value={form.rows}
                    min={1}
                    onChange={(v) => apply((f) => ({ ...f, rows: v, axis_span_cm: v ? spanForRows(v, rowSpacing) : f.axis_span_cm }))}
                  />
                </FormRow>
                <FormRow label="Sáv szélessége">
                  <NumberInput
                    value={form.axis_span_cm}
                    min={1}
                    unit="cm"
                    onChange={(v) => apply((f) => ({ ...f, axis_span_cm: v, rows: v ? rowsForSpan(v, rowSpacing) : f.rows }))}
                  />
                </FormRow>
                <FormRow label="Kezdete">
                  <NumberInput
                    value={form.axis_start_cm}
                    min={0}
                    unit="cm"
                    onChange={(v) => setForm((f) => ({ ...f, axis_start_cm: v, autoPlace: false }))}
                  />
                </FormRow>
                <FormRow label={`Teljes ${bed.row_direction === 'keresztben' ? 'szélességben' : 'hosszban'}`}>
                  <Toggle
                    label={`Teljes ${bed.row_direction === 'keresztben' ? 'szélességben' : 'hosszban'}`}
                    checked={form.fullCross}
                    onChange={(v) =>
                      apply((f) => ({
                        ...f,
                        fullCross: v,
                        cross_start_cm: v ? null : (f.cross_start_cm ?? 0),
                        cross_span_cm: v ? null : (f.cross_span_cm ?? Math.round(axes.cross / 2)),
                      }))
                    }
                  />
                </FormRow>
                {!form.fullCross && (
                  <>
                    <FormRow label={bed.row_direction === 'keresztben' ? 'Szélességben kezdete' : 'Hosszában kezdete'}>
                      <NumberInput value={form.cross_start_cm} min={0} unit="cm" onChange={(v) => set('cross_start_cm', v)} />
                    </FormRow>
                    <FormRow label={bed.row_direction === 'keresztben' ? 'Szélességben foglal' : 'Hosszában foglal'}>
                      <NumberInput value={form.cross_span_cm} min={1} unit="cm" onChange={(v) => set('cross_span_cm', v)} />
                    </FormRow>
                  </>
                )}
                <FormRow label="Tőszám">
                  <NumberInput
                    value={form.plant_count}
                    min={0}
                    placeholder={estimate ? `kb. ${estimate}` : undefined}
                    onChange={(v) => set('plant_count', v)}
                  />
                </FormRow>
                {!form.autoPlace && (
                  <FormButton onClick={() => apply((f) => ({ ...f, autoPlace: true }))}>Első szabad helyre</FormButton>
                )}
              </>
            )}
          </FormGroup>
          {bed && strips.length > 0 && (
            <div className={s.preview}>
              <BedDiagram
                lengthCm={bed.length_cm}
                widthCm={bed.width_cm}
                rowDirection={bed.row_direction}
                color={bed.color}
                strips={strips}
                maxHeight={130}
                caption={
                  period
                    ? hasOthers
                      ? `Szürkével: ${shortDate(period.start)} – ${shortDate(period.end)} között itt álló más ültetések.`
                      : `${shortDate(period.start)} – ${shortDate(period.end)} között nincs más ültetés ebben az ágyásban.`
                    : false
                }
              />
            </div>
          )}
          <NoticeList items={placementIssues} />

          {!planting && (
            <FormGroup
              title="Újravetés"
              footer={
                creatingSeries && form.dates.sow
                  ? `Vetések: ${offsets.map((o) => shortDate(addDaysISO(form.dates.sow!, o))).join(', ')} – mindegyik a következő szabad sávba kerül.`
                  : window?.succession_days
                    ? `${withArticle(plant.name_hu.toLowerCase(), true)} ${window.succession_days} naponta újravetve folyamatosan szedhető.`
                    : undefined
              }
            >
              <FormRow label="Újravetés-sorozat">
                <Toggle checked={form.seriesOn} onChange={(v) => set('seriesOn', v)} label="Újravetés-sorozat" />
              </FormRow>
              {form.seriesOn && (
                <>
                  <FormRow label="Vetések száma">
                    <NumberInput value={form.seriesCount} min={2} max={20} onChange={(v) => set('seriesCount', v ?? 2)} />
                  </FormRow>
                  <FormRow label="Időköz">
                    <NumberInput value={form.seriesInterval} min={1} unit="nap" onChange={(v) => set('seriesInterval', v ?? 14)} />
                  </FormRow>
                </>
              )}
            </FormGroup>
          )}
        </>
      )}

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormRow>
      </FormGroup>

      {planting && (
        <FormGroup>
          <FormButton
            destructive
            onClick={() => confirm('Törlöd ezt az ültetést?') && remove.mutate(false, { onSuccess: onClose })}
          >
            Ültetés törlése
          </FormButton>
          {(planting.series_size ?? 0) > 1 && (
            <FormButton
              destructive
              onClick={() =>
                confirm(`Törlöd a teljes újravetés-sorozatot (${planting.series_size} ültetés)?`) &&
                remove.mutate(true, { onSuccess: onClose })
              }
            >
              A teljes sorozat törlése ({planting.series_size} ültetés)
            </FormButton>
          )}
        </FormGroup>
      )}
    </Sheet>
  );
}
