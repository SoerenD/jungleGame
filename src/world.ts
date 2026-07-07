/**
 * Multi-world identity (ADR-0014). A "world" is one isolated instance of the
 * persistent jungle — its own players, structures, nodes, chat, Seal, Village,
 * and Guardian — living in the SAME backend, scoped by a `world_id` slug. The
 * shared static map (public/map/*.json) is common to every world; only mutable
 * runtime state is per-world.
 *
 * The world name a Player types on the join screen becomes this slug: an unknown
 * slug is created on first join, a known one is joined. A world is an ISOLATION
 * boundary, not a security one (ADR-0005): anyone who knows the slug can join.
 *
 * The canonical existing world is `default` — a blank join field, `?world=` with
 * no value, or the literal `default` all resolve to it, so every pre-existing
 * link and the live shared world keep working unchanged.
 */
export const WORLD_ID_DEFAULT = 'default';
export const WORLD_ID_MAX_LEN = 24;

/**
 * Fold a free-typed world name into a URL/channel-safe slug: lowercase, with
 * runs of anything non-alphanumeric collapsed to single hyphens and the ends
 * trimmed. Empty (or a bare `default`) yields the default world. Deterministic,
 * so the same name always maps to the same world for everyone who types it.
 */
export function normalizeWorldId(raw: string | null | undefined): string {
  const slug = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, WORLD_ID_MAX_LEN)
    .replace(/-+$/g, ''); // a trailing hyphen the length cap may have exposed
  return slug || WORLD_ID_DEFAULT;
}
