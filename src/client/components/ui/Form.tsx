import { useState, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { MONTHS_SHORT_HU } from '@shared/labels.ts';
import s from './Form.module.css';

/** iOS-beállítások stílusú csoport (fehér kártya, felirat fölötte, lábjegyzet alatta). */
export function FormGroup({ title, footer, children }: { title?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.group}>
      {title && <h3 className={s.groupTitle}>{title}</h3>}
      <div className={s.card}>{children}</div>
      {footer && <p className={s.footer}>{footer}</p>}
    </section>
  );
}

/** Egy sor: felirat balra, vezérlő jobbra. */
export function FormRow({
  label,
  children,
  stacked,
  hideLabel,
}: {
  label: ReactNode;
  children: ReactNode;
  stacked?: boolean;
  /** A felirat csak képernyőolvasónak (pl. ha a csoport címe már elmondja) */
  hideLabel?: boolean;
}) {
  return (
    <label className={`${s.row} ${stacked ? s.stacked : ''}`}>
      <span className={hideLabel ? 'visually-hidden' : s.label}>{label}</span>
      <span className={s.control}>{children}</span>
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" autoComplete="off" {...props} className={`${s.input} ${props.className ?? ''}`} />;
}

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  unit?: string;
}

export function NumberInput({ value, onChange, unit, ...rest }: NumberInputProps) {
  return (
    <span className={s.numberWrap}>
      <input
        type="number"
        inputMode="numeric"
        {...rest}
        className={s.input}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      {unit && <span className={s.unit}>{unit}</span>}
    </span>
  );
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={s.select}>
      {children}
    </select>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={s.textarea} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${s.toggle} ${checked ? s.on : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={s.knob} />
    </button>
  );
}

/** Dátumválasztó ('YYYY-MM-DD' vagy null). */
export function DateInput({
  value,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  return (
    <input
      type="date"
      {...rest}
      className={`${s.input} ${s.date}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

/** Elfogadható nap: üres (törlés), vagy az adatbázis által is elfogadott évben (1900–2200). */
const plausibleDate = (v: string | null) => v == null || (Number(v.slice(0, 4)) >= 1900 && Number(v.slice(0, 4)) <= 2200);

/**
 * Dátumválasztó, amely csak elfogadható napot ad tovább (`valid`, alapból: 1900 és 2200 közötti
 * év, vagy üres). A Chrome a billentyűzettel írt évet számjegyenként jelenti (0002-07-01,
 * 0020-07-01 …): a félig begépelt érték csak a mezőben látszik, elhagyáskor a korábbi nap áll
 * vissza. A piszkozat ahhoz a naphoz tartozik, amelyikből kiindult: ha a nap közben máshonnan
 * változik, az új nap látszik.
 */
export function GuardedDateInput({
  value,
  onChange,
  valid = plausibleDate,
  onBlur,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  valid?: (v: string | null) => boolean;
}) {
  const [draft, setDraft] = useState<{ base: string | null | undefined; value: string } | null>(null);
  return (
    <DateInput
      {...rest}
      value={draft && draft.base === value ? draft.value : value}
      onChange={(v) => {
        if (valid(v)) {
          setDraft(null);
          onChange(v);
        } else setDraft({ base: value, value: v ?? '' });
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Hónap-nap választó (év nélkül): 'HH-NN' vagy null. */
export function MonthDayInput({
  value,
  onChange,
  allowEmpty = true,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  allowEmpty?: boolean;
}) {
  const month = value ? Number(value.slice(0, 2)) : 0;
  const day = value ? Number(value.slice(3, 5)) : 0;
  const emit = (m: number, d: number) => {
    if (!m) return onChange(null);
    const maxDay = DAYS_IN_MONTH[m - 1]!;
    const dd = Math.min(Math.max(d || 1, 1), maxDay);
    onChange(`${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  };
  return (
    <span className={s.monthDay}>
      <select className={s.select} value={month} onChange={(e) => emit(Number(e.target.value), day)}>
        {allowEmpty && <option value={0}>—</option>}
        {MONTHS_SHORT_HU.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}.
          </option>
        ))}
      </select>
      <select className={s.select} value={day} disabled={!month} onChange={(e) => emit(month, Number(e.target.value))}>
        {!month && <option value={0}>—</option>}
        {Array.from({ length: month ? DAYS_IN_MONTH[month - 1]! : 31 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}.
          </option>
        ))}
      </select>
    </span>
  );
}

/** Szöveges gomb-sor csoporton belül (pl. „Törlés”). */
export function FormButton({
  children,
  onClick,
  destructive,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button type="button" className={`${s.button} ${destructive ? s.destructive : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
