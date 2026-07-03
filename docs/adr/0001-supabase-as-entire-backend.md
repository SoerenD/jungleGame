# Supabase as the entire backend — no dedicated game server

The game is a peaceful (v1: no combat, no hunger) multiplayer crafting world for ~8 concurrent
players, requiring persistent World state and realtime sync of positions and chat. We decided to
run the whole backend on Supabase: Realtime broadcast channels for positions/chat/presence,
Postgres for all persistent state, and Postgres functions (RPCs) to enforce mutation rules
atomically (finishing hit on a Resource Node gets the yield; first Structure placement on a tile
wins). There is deliberately no game-server process to deploy or operate.

## Considered Options

- Dedicated Node.js WebSocket server — the classic authoritative architecture; rejected for v1
  because it adds hosting cost and ops burden that a peaceful, low-tick game does not need.
- Colyseus — room-based state sync fights the "one eternal persistent world" model.

## Consequences

- There is no authoritative tick loop. Time-based mechanics (Resource Node regrowth) must be
  computed lazily from timestamps on read/harvest, not by a ticking process.
- If a future version adds fast-paced combat or physics, a dedicated authoritative server will
  need to be introduced at that point; this ADR should then be revisited.
- Client-side movement is trusted (no server-side anti-cheat) — acceptable for a trusted friend
  group behind an invite link.
