/** A sávlista sorainak áthelyezése: mellékhatás nélküli segédek a húzáshoz és a billentyűzethez. */

/** Egy sor függőleges helye a képernyőn, képpontban. */
export interface RowBox {
  top: number;
  height: number;
}

const mid = (b: RowBox) => b.top + b.height / 2;

/**
 * Hányadik helyre kerül a húzott sor a kivétele utáni sorrendben (ahogy a `moveRow` várja):
 * ahány másik sor közepén túljutott a húzott sor közepe. Pontosan egy sor közepén még nem
 * cserélnek helyet. A `boxes` a húzás kezdetekor, még elmozdítás nélkül mért helyek, a `dy`
 * a mutató elmozdulása azóta (az elmozdított sort újramérve a `dy` kétszer számítana).
 * A nem mért sor a húzotthoz képest a helyén marad.
 */
export function targetIndex(boxes: readonly (RowBox | undefined)[], index: number, dy: number): number {
  const me = boxes[index];
  if (!me) return index;
  const center = mid(me) + dy;
  let to = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (i === index) continue;
    if (i < index ? !b || center >= mid(b) : b && center > mid(b)) to++;
  }
  return to;
}

/**
 * A nyílbillentyűvel kért új hely: a sor szélén önmaga (a billentyű ilyenkor se görgessen),
 * null, ha a billentyű nem mozgat.
 */
export function keyTarget(key: string, index: number, count: number): number | null {
  const step = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  if (!step) return null;
  return Math.min(Math.max(index + step, 0), count - 1);
}
