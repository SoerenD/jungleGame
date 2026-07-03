import type { Backend } from './types';
import { MockBackend } from './MockBackend';
import { SupabaseBackend } from './SupabaseBackend';

/**
 * Pick the backend from the environment: a configured Supabase project yields
 * the real shared-world backend (ADR-0001); otherwise the game falls back to
 * the single-player MockBackend so `npm run dev` still works with no secrets.
 */
export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    console.info('[jw] backend: Supabase (shared multiplayer world)');
    return new SupabaseBackend(url, key);
  }
  console.info('[jw] backend: Mock (local single-player — no VITE_SUPABASE_* configured)');
  return new MockBackend();
}
