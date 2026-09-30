import { createContext, useContext, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'kerttervezo.year';

interface YearState {
  year: number;
  setYear: (year: number) => void;
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
  const setYear = (y: number) => {
    setYearState(y);
    try {
      localStorage.setItem(STORAGE_KEY, String(y));
    } catch {
      /* nem baj */
    }
  };
  return <YearContext.Provider value={{ year, setYear }}>{children}</YearContext.Provider>;
}

export function useYear(): YearState {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear csak YearProvider alatt használható');
  return ctx;
}
