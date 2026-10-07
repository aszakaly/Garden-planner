import { useSyncExternalStore } from 'react';

/** Van-e ujjal kezelt mutató (érintőképernyős laptopon is, egér mellett) */
const COARSE = '(any-pointer: coarse)';

function subscribeCoarse(cb: () => void) {
  const mql = window.matchMedia(COARSE);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

/** Ujjal is kezelhető eszköz-e (nagyobb érintési terület kell). */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);
}

function subscribeResize(cb: () => void) {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

/** Az ablak belső magassága CSS-képpontban (átméretezéskor, elforgatáskor frissül); `null`, ha nem ismert. */
export function useWindowHeight(): number | null {
  return useSyncExternalStore(
    subscribeResize,
    () => (window.innerHeight > 0 ? window.innerHeight : null),
    () => null,
  );
}
