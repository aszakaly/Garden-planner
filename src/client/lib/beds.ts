import { Boxes, Flower2, House, Rows3, Tent, type LucideIcon } from 'lucide-react';
import type { BedType } from '@shared/labels.ts';

export const BED_ICON: Record<BedType, LucideIcon> = {
  foldagyas: Rows3,
  emelt: Rows3,
  magasagyas: Boxes,
  folia: Tent,
  uveghaz: House,
  cserep: Flower2,
};

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });

/** 400 × 120 cm → „4 × 1,2 m” */
export function formatDimensions(lengthCm: number, widthCm: number): string {
  return `${nf.format(lengthCm / 100)} × ${nf.format(widthCm / 100)} m`;
}

/** Terület m²-ben, magyar tizedesvesszővel */
export function formatArea(lengthCm: number, widthCm: number): string {
  return `${nf.format((lengthCm * widthCm) / 10_000)} m²`;
}

export function areaM2(lengthCm: number, widthCm: number): number {
  return (lengthCm * widthCm) / 10_000;
}
