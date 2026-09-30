import { NUTRIENT_LABEL, ROTATION_STAGES, ROTATION_STAGE_LABEL, type NutrientGroup } from '@shared/labels.ts';
import type { CropGroup, PlantListItem } from '@shared/types.ts';

export type Grouping = 'csalad' | 'csoport' | 'szakasz' | 'tapanyag';

export const GROUPING_OPTIONS: { value: Grouping; label: string }[] = [
  { value: 'csalad', label: 'Család' },
  { value: 'csoport', label: 'Zöldségcsoport' },
  { value: 'szakasz', label: 'Vetésforgó' },
  { value: 'tapanyag', label: 'Tápanyag' },
];

export interface PlantGroup {
  key: string;
  title: string;
  detail?: string;
  items: PlantListItem[];
}

const NONE = 'Nincs besorolva';

/** Növények csoportosítása a választott szempont szerint, szakmailag értelmes sorrendben. */
export function groupPlants(plants: PlantListItem[], grouping: Grouping, cropGroups: CropGroup[] = []): PlantGroup[] {
  const groups = new Map<string, PlantGroup>();
  const add = (key: string, title: string, plant: PlantListItem, detail?: string) => {
    if (!groups.has(key)) groups.set(key, { key, title, detail, items: [] });
    groups.get(key)!.items.push(plant);
  };

  for (const p of plants) {
    switch (grouping) {
      case 'csalad':
        add(p.family_name ?? '~', p.family_name ?? NONE, p);
        break;
      case 'csoport': {
        const g = cropGroups.find((c) => c.id === p.crop_group_id);
        add(g ? String(g.sort_order).padStart(3, '0') : '~', g?.name_hu ?? NONE, p, g?.description ?? undefined);
        break;
      }
      case 'szakasz': {
        const i = p.rotation_stage ? ROTATION_STAGES.indexOf(p.rotation_stage) : -1;
        add(
          i >= 0 ? String(i) : '~',
          p.rotation_stage ? `${ROTATION_STAGE_LABEL[p.rotation_stage]}` : 'Vetésforgón kívül',
          p,
          p.rotation_stage ? STAGE_DETAIL[p.rotation_stage] : 'Fűszer-, kísérő- és évelő növények',
        );
        break;
      }
      case 'tapanyag':
        add(
          p.nutrient_group ? String(p.nutrient_group) : '~',
          p.nutrient_group ? NUTRIENT_LABEL[p.nutrient_group as NutrientGroup] : 'Nincs megadva',
          p,
          p.nutrient_group ? NUTRIENT_DETAIL[p.nutrient_group as NutrientGroup] : undefined,
        );
        break;
    }
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key, 'hu'));
}

const STAGE_DETAIL = {
  huvelyes: '1. szakasz – nitrogéngyűjtők, a talajt javítják',
  level: '2. szakasz – a hüvelyesek nitrogénjét hasznosítják',
  termes: '3. szakasz – erős tápanyagigényű termésnövények',
  gyoker: '4. szakasz – a kimerültebb talajjal is beérik',
} as const;

const NUTRIENT_DETAIL = {
  1: 'Friss szerves trágyát igényelnek (I. termőhelyi erő)',
  2: 'Trágyázás utáni 2. évben (II. termőhelyi erő)',
  3: 'Trágyázás utáni 3. évben, talajjavítók (III. termőhelyi erő)',
} as const;
