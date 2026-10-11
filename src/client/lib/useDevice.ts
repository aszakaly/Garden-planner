import { useSyncExternalStore } from 'react';

/** Médialekérdezés hookként: egyetlen, első használatkor létrehozott `MediaQueryList` lekérdezésenként. */
function mediaHook(query: string): () => boolean {
  let mql: MediaQueryList | null = null;
  const get = () => (mql ??= window.matchMedia(query));
  const subscribe = (cb: () => void) => {
    const m = get();
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  };
  return () => useSyncExternalStore(subscribe, () => get().matches, () => false);
}

/** Ujjal is kezelhető eszköz-e (érintőképernyős laptopon is, egér mellett): nagyobb érintési terület kell. */
export const useCoarsePointer = mediaHook('(any-pointer: coarse)');

/** Telefonos elrendezés (keskeny ablak). */
export const useIsMobile = mediaHook('(max-width: 760px)');

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
