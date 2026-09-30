import type { CSSProperties } from 'react';
import type { RowDirection } from '@shared/labels.ts';
import { colorVar } from '../../lib/colors.ts';
import s from './BedDiagram.module.css';

interface Props {
  lengthCm: number;
  widthCm: number;
  rowDirection: RowDirection;
  color: string;
  /** Szemléltető sortáv a sorvonalakhoz */
  rowSpacingCm?: number;
}

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });

/**
 * Ágyás felülnézetben, a sorok irányával. Az ágyás hossza vízszintesen fut.
 * A sávos elhelyezés (4. lépés) ugyanezt a koordináta-rendszert használja: cm az ágyás bal felső sarkától.
 */
export function BedDiagram({ lengthCm, widthCm, rowDirection, color, rowSpacingCm = 30 }: Props) {
  const maxW = 640;
  const maxH = 220;
  const scale = Math.min(maxW / lengthCm, maxH / widthCm);
  const w = lengthCm * scale;
  const h = widthCm * scale;
  const pad = { left: 34, top: 8, right: 8, bottom: 30 };
  const across = rowDirection === 'keresztben';
  const axisLen = across ? lengthCm : widthCm;
  const rows = Math.max(1, Math.floor(axisLen / rowSpacingCm));
  const step = (across ? w : h) / rows;

  return (
    <figure className={s.figure} style={{ '--c': colorVar(color) } as CSSProperties}>
      <svg
        viewBox={`0 0 ${w + pad.left + pad.right} ${h + pad.top + pad.bottom}`}
        className={s.svg}
        role="img"
        aria-label={`Ágyás felülnézetben: ${nf.format(lengthCm / 100)} × ${nf.format(widthCm / 100)} m`}
      >
        <g transform={`translate(${pad.left} ${pad.top})`}>
          <rect className={s.bed} width={w} height={h} rx={6} />
          {Array.from({ length: rows }, (_, i) => {
            const pos = step * (i + 0.5);
            return across ? (
              <line key={i} className={s.row} x1={pos} y1={6} x2={pos} y2={h - 6} />
            ) : (
              <line key={i} className={s.row} x1={6} y1={pos} x2={w - 6} y2={pos} />
            );
          })}
          <text className={s.dim} x={w / 2} y={h + 20} textAnchor="middle">
            {nf.format(lengthCm / 100)} m
          </text>
          <text className={s.dim} x={-12} y={h / 2} textAnchor="middle" transform={`rotate(-90 -12 ${h / 2})`}>
            {nf.format(widthCm / 100)} m
          </text>
        </g>
      </svg>
      <figcaption className={s.caption}>
        Sorok {across ? 'keresztben' : 'hosszában'} – az ültetések sávokban követik egymást az ágyás{' '}
        {across ? 'hossza' : 'szélessége'} mentén (a vonalak {rowSpacingCm} cm-es szemléltető sortávot mutatnak).
      </figcaption>
    </figure>
  );
}
