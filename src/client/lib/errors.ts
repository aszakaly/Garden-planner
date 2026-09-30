import { ApiError } from './api.ts';

/** Hibaüzenet a felhasználónak (a szerver validációs üzeneteivel együtt). */
export function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof ApiError) {
    return err.issues?.length ? err.issues.map((i) => i.message).join(' · ') : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
