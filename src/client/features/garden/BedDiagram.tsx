import { useId, type CSSProperties, type ReactNode } from 'react';
import type { RowDirection } from '@shared/labels.ts';
import type { Placement } from '@shared/domain/geometry.ts';
import { colorVar } from '../../lib/colors.ts';
import { rectOf } from './canvasGeometry.ts';
import s from './BedDiagram.module.css';

/** Egy ültetés sávja felülnézetben. */
export interface Strip {
  key: string | number;
  placement: Placement;
  label?: string;
  /** CSS szín */
  color: string;
  /** current: épp szerkesztett · muted: más ültetés · clash: ütköző · ghost: sorozat további tagja */
  variant?: 'normal' | 'current' | 'muted' | 'clash' | 'ghost';
  onClick?: () => void;
}

interface Props {
  lengthCm: number;
  widthCm: number;
  rowDirection: RowDirection;
  color: string;
  /** Szemléltető sortáv a sorvonalakhoz */
  rowSpacingCm?: number;
  strips?: Strip[];
  /** false: nincs felirat; egyébként a megadott vagy az alapértelmezett magyarázat */
  caption?: ReactNode | false;
  maxHeight?: number;
}

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });

/**
 * Ágyás felülnézetben, a sorok irányával. Az ágyás hossza vízszintesen fut; a sávok
 * az ágyás bal felső sarkától mért cm-koordinátákban (tengely + keresztirány) jelennek meg.
 */
export function BedDiagram({ lengthCm, widthCm, rowDirection, color, rowSpacingCm = 30, strips, caption, maxHeight = 220 }: Props) {
  const clipId = `bed-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const maxW = 640;
  const scale = Math.min(maxW / lengthCm, maxHeight / widthCm);
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
        style={{ maxHeight: maxHeight + 60 }}
        role="img"
        aria-label={`Ágyás felülnézetben: ${nf.format(lengthCm / 100)} × ${nf.format(widthCm / 100)} m`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect width={w} height={h} rx={6} />
          </clipPath>
        </defs>
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
          <g clipPath={`url(#${clipId})`}>
            {strips?.map((strip) => {
              const r = rectOf(strip.placement, across, scale);
              const vertical = r.w < 70 && r.h > r.w;
              const cx = r.x + r.w / 2;
              const cy = r.y + r.h / 2;
              return (
                <g
                  key={strip.key}
                  className={`${s.strip} ${s[strip.variant ?? 'normal']} ${strip.onClick ? s.clickable : ''}`}
                  style={{ '--sc': strip.color } as CSSProperties}
                  onClick={strip.onClick}
                >
                  <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={4} />
                  {strip.label && (
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
                    >
                      {strip.label}
                    </text>
                  )}
                  {strip.label && <title>{strip.label}</title>}
                </g>
              );
            })}
          </g>
          <text className={s.dim} x={w / 2} y={h + 20} textAnchor="middle">
            {nf.format(lengthCm / 100)} m
          </text>
          <text className={s.dim} x={-12} y={h / 2} textAnchor="middle" transform={`rotate(-90 -12 ${h / 2})`}>
            {nf.format(widthCm / 100)} m
          </text>
        </g>
      </svg>
      {caption !== false && (
        <figcaption className={s.caption}>
          {caption ?? (
            <>
              Sorok {across ? 'keresztben' : 'hosszában'} – az ültetések sávokban követik egymást az ágyás{' '}
              {across ? 'hossza' : 'szélessége'} mentén (a vonalak {rowSpacingCm} cm-es szemléltető sortávot mutatnak).
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
