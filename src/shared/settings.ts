import { z } from 'zod';

const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'HH-NN formátum kell');

export const settingsSchema = z.object({
  /** Utolsó tavaszi fagy várható napja (HH-NN) */
  lastFrost: monthDay,
  /** Első őszi fagy várható napja (HH-NN) */
  firstFrost: monthDay,
  region: z.string().max(200),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  lastFrost: '05-10',
  firstFrost: '10-20',
  region: 'Közép-Magyarország, az Alföld északi része',
};
