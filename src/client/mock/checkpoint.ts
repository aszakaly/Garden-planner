/**
 * IDEIGLENES mintaadatok a 0. lépés dizájn-ellenőrzőpontjához.
 * A valódi adatok (ágyások, feladatok) a 3. és 6. lépésben váltják ki.
 */
import { addDays, todayISO } from '../lib/format.ts';
import type { ListColor } from '../lib/colors.ts';

export interface MockBed {
  id: number;
  name: string;
  color: ListColor;
  plantings: number;
}

export const MOCK_BEDS: MockBed[] = [
  { id: 1, name: 'Emelt ágyás 1', color: 'green', plantings: 6 },
  { id: 2, name: 'Emelt ágyás 2', color: 'orange', plantings: 4 },
  { id: 3, name: 'Hosszú ágyás', color: 'brown', plantings: 5 },
  { id: 4, name: 'Fóliasátor', color: 'blue', plantings: 7 },
  { id: 5, name: 'Fűszerkert', color: 'purple', plantings: 9 },
];

export type MockChip = { text: string; tone: 'neutral' | 'good' | 'bad' | 'warn' | 'info' };

export interface MockTask {
  id: string;
  date: string;
  title: string;
  bedId?: number;
  detail: string;
  kind: string;
  chips?: MockChip[];
  done?: boolean;
}

const t = todayISO();

export const MOCK_TASKS: MockTask[] = [
  {
    id: 'a',
    date: addDays(t, -2),
    title: 'Paradicsom utolsó szedése, tövek felszedése',
    bedId: 1,
    detail: 'Ökörszív · 8 tő',
    kind: 'Ágyásrész felszabadul',
  },
  {
    id: 'b',
    date: t,
    title: 'Fokhagyma ültetése',
    bedId: 3,
    detail: 'Makói lila · 3 sor, 25 cm sortáv',
    kind: 'Ültetés',
    chips: [{ text: 'Vetésforgó rendben', tone: 'good' }],
  },
  {
    id: 'c',
    date: t,
    title: 'Áttelelő spenót vetése',
    bedId: 2,
    detail: 'Matador · 2 sor',
    kind: 'Helyrevetés',
    chips: [{ text: 'Jó szomszéd: retek', tone: 'good' }],
  },
  {
    id: 'd',
    date: t,
    title: 'Őszi retek vetése',
    bedId: 2,
    detail: 'Jégcsap · 1 sor',
    kind: 'Helyrevetés',
    done: true,
  },
  {
    id: 'e',
    date: addDays(t, 1),
    title: 'Sárgarépa betakarításának kezdete',
    bedId: 1,
    detail: 'Nantesi · 4 sor',
    kind: 'Betakarítás',
  },
  {
    id: 'f',
    date: addDays(t, 2),
    title: 'Téli saláta palánták kiültetése',
    bedId: 4,
    detail: 'Május királya · 12 tő',
    kind: 'Kiültetés',
    chips: [{ text: 'Vetésforgó: fészkesek 2 éven belül', tone: 'warn' }],
  },
  {
    id: 'g',
    date: addDays(t, 3),
    title: 'Vetőmag beszerzése: dughagyma',
    detail: 'Stuttgarti óriás · a tavaszi tervhez',
    kind: 'Beszerzés',
    chips: [{ text: 'Nincs készleten', tone: 'info' }],
  },
  {
    id: 'h',
    date: addDays(t, 5),
    title: 'Uborka helye felszabadul',
    bedId: 3,
    detail: 'Utána: fokhagyma (áttelelő)',
    kind: 'Ágyásrész felszabadul',
  },
];

export const MOCK_COUNTS = {
  week: 7,
  scheduled: 23,
  calendar: 31,
  plan: 42,
  warnings: 3,
  journal: 128,
};
