import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'kerttervezo.year';

interface YearState {
  year: number;
  setYear: (year: number) => void;
  /** Őr az évváltás elé (pl. mentetlen módosítás): ha hamisat ad, az év marad. Visszaadja a leiratkozást. */
  addGuard: (guard: () => boolean) => () => void;
}

const YearContext = createContext<YearState | null>(null);

function initialYear(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (stored >= 1900 && stored <= 2200) return stored;
  } catch {
    /* a localStorage nem elérhető */
  }
  return new Date().getFullYear();
}

export function YearProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState(initialYear);
  const guards = useRef(new Set<() => boolean>());
  const setYear = (y: number) => {
    if (y === year) return;
    for (const guard of guards.current) if (!guard()) return;
    setYearState(y);
    try {
      localStorage.setItem(STORAGE_KEY, String(y));
    } catch {
      /* nem baj */
    }
  };
  const addGuard = (guard: () => boolean) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  };
  return <YearContext.Provider value={{ year, setYear, addGuard }}>{children}</YearContext.Provider>;
}

export function useYear(): Pick<YearState, 'year' | 'setYear'> {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear csak YearProvider alatt használható');
  return ctx;
}

/** Amíg `active`, az évváltás előtt a `confirm` dönt (hamis: az év marad). */
export function useYearGuard(active: boolean, confirm: () => boolean) {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYearGuard csak YearProvider alatt használható');
  const latest = useRef(confirm);
  latest.current = confirm;
  const { addGuard } = ctx;
  useEffect(() => (active ? addGuard(() => latest.current()) : undefined), [active, addGuard]);
}
