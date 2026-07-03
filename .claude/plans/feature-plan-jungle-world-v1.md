# Feature plan: Jungle World v1

A pixel-art multiplayer browser game: one persistent, Claude-authored jungle World that a
friend group (~8 concurrent Players) inhabits together — gathering Resources, crafting Tools,
and placing Structures. Peaceful in v1.

## Resolved decisions

### Game design
- Core loop: gather Resources → craft Tools → unlock better/faster gathering → craft and place
  Structures into the World.
- v1 is peaceful: no combat, no enemies, no hunger, no health, no death.
- ~10–15 Recipes total. All Recipes are visible from the start; progression is gated purely by
  materials and Tools (e.g. no machete → can't cut vines → no fiber → no bridge).
- Resources in v1: wood, stone, fiber, fruit (exact list may be tuned during map authoring).
- Resource Nodes (trees, rocks, bushes) deplete visibly when harvested (e.g. tree → stump) and
  regrow after a real-time delay. Regrowth is computed lazily from timestamps — there is no
  ticking process.

### World
- Perspective: 3/4 top-down — square tile grid, art drawn with depth illusion (Stardew-style).
  NOT true diamond-grid isometric.
- Exactly one World, persistent forever on the backend; it survives all Players logging off.
- Size ~200×200 tiles, loaded as one map — no chunk streaming, no procedural generation.
- The map is a fixed authored asset: Claude writes a one-time map-building script (output: Tiled
  JSON), then the map is iterated with the user until it "feels epic", then frozen. The
  generator does not ship in the game.
- The World is divided into named Zones (e.g. river delta, waterfall, dense grove, ruins,
  swamp, hidden groves) that give exploration its identity.

### Multiplayer
- Up to ~8 concurrent Players; naive full-broadcast of positions is acceptable at this scale
  (no interest management, no spatial partitioning).
- Entry: shared invite link. Identity: unique Player name + 4-digit PIN, reclaimable on any
  device. Accepted risk: weak security, fine for a trusted friend group.
- Communication: one global chat window. No speech bubbles, no emotes.
- Players pick from a set of preset avatars (must be distinguishable; walk animations needed).
- Conflict rules (server-ordered, atomic):
  - The finishing hit on a Resource Node gets the yield.
  - The first Structure placement on a tile wins; the second is rejected.

### Tech stack
- Client: Phaser 3 + Vite, TypeScript. Desktop browser only.
- Controls: WASD/arrow keys to move, E to interact/harvest, UI for inventory/crafting.
- Backend: Supabase only — no dedicated game server (see ADR-0001):
  - Realtime broadcast channels: player positions, chat, presence.
  - Postgres: all persistent state (players, inventories, node harvest timestamps, structures).
  - Postgres functions (RPCs): atomic mutations enforcing the conflict rules (harvest, craft,
    place).
- Client-side movement is trusted (no anti-cheat) — acceptable for the friend group.

### Content
- Art: free-only asset packs sourced online by Claude (CC0 preferred; free-with-attribution
  allowed). Every asset's license and source recorded in CREDITS.md. Needed: jungle terrain
  tileset, layered foliage with canopy depth, preset avatars with walk animations, Resource
  Node states (full/depleted), sprites for every Tool and Structure.
- Audio: one ambient jungle loop + basic SFX (chop, harvest, craft success, structure placed,
  chat blip), all free assets, with a mute button.

## Acceptance criteria

### Joining and identity
- Given a person with the invite link, when they open it and choose an unused name, a PIN, and
  an avatar, then they enter the World as a new Player at the spawn point.
- Given an existing Player name, when someone enters that name with the correct PIN on any
  device/browser, then they resume that Player with inventory and position intact.
- Given an existing Player name, when someone enters that name with a wrong PIN, then joining
  is refused and no Player data is revealed.

### Presence and movement
- Given two Players online, when one moves, then the other sees the movement smoothly within
  ~250ms perceived latency.
- Given a Player disconnects (tab close, network drop), then their avatar disappears for others
  within a few seconds and their inventory/position is preserved for next login.
- Given 8 concurrent Players moving simultaneously, then movement sync remains smooth for all.

### Gathering
- Given a Player next to a harvestable Resource Node with the required Tool (or none required),
  when they interact until the finishing hit, then the yield enters their inventory and every
  online Player sees the Node switch to its depleted state.
- Given two Players hitting the same Node, when it depletes, then exactly one Player — the one
  whose finishing hit the server ordered first — receives the yield.
- Given a depleted Node, when its regrow delay has passed (even if nobody was online), then any
  Player who next sees it finds it harvestable and visually regrown.
- Given a Player without the required Tool (e.g. vines without a machete), when they try to
  harvest, then the attempt fails with clear UI feedback.

### Crafting and building
- Given a Player with sufficient Resources for a Recipe, when they craft it, then the Resources
  are deducted and the Tool/Structure appears in their inventory — atomically (no partial
  outcome, no dupes under concurrency).
- Given a Player with insufficient Resources, when they view the Recipe, then it is visible but
  clearly shown as uncraftable.
- Given a Player placing a Structure on a valid free tile, then all online Players see it
  appear immediately, and it still exists after everyone logs off and returns.
- Given two Players placing a Structure on the same tile at the same time, then exactly one
  placement succeeds and the loser gets clear feedback (item retained).

### Chat
- Given a Player sends a chat message, then all online Players see it in the global chat window
  with the sender's name.

### Persistence
- Given all Players log off, when anyone returns later (hours/days), then all Structures,
  inventories, and Node regrowth states are exactly as the rules dictate.

### Atmosphere
- Given the game loads, then the ambient jungle loop plays and the mute button silences all
  audio (state remembered per device).

## Scope boundaries — do NOT build in v1

- No combat, enemies, or enemy AI; no hunger/health/death systems.
- No mobile/touch support or responsive phone UI.
- No emotes, pings, or speech-bubble chat (global chat window only).
- No recipe discovery, unlock tiers, or per-player recipe state.
- No procedural generation at runtime; no chunk streaming; the map generator is a build-time
  tool only.
- No day/night cycle, weather, or zone-specific soundscapes.
- No multiple worlds, no public access, no moderation tooling, no anti-cheat.
- No avatar customization beyond choosing a preset.
- Do NOT introduce a dedicated game server — Supabase only (ADR-0001).

## Constraints and gotchas

- No authoritative tick loop exists: every time-based mechanic (regrowth) must be derived
  lazily from persisted timestamps at read/mutation time.
- All mutation rules must live in Postgres RPCs and be atomic — the client must never compute
  yields, deduct resources, or decide placement wins.
- Supabase Realtime broadcast is fire-and-forget: position updates may drop; the client must
  interpolate and tolerate gaps. Chat and mutations must go through persistent paths, not
  broadcast alone.
- "Isometric" in early discussion meant the 3/4 top-down look — do not build diamond-grid
  isometric math.
- Depth illusion requires per-sprite depth sorting by Y coordinate (Phaser: depth = y) so
  Players walk behind/in front of trees correctly.
- Asset licenses must be verified free (CC0 or attribution) before integration; record each in
  CREDITS.md.
- The 200×200 Tiled map loads whole; keep tileset image sizes reasonable so initial load stays
  acceptable.

## References

- [CONTEXT.md](../../CONTEXT.md) — glossary: World, Player, Zone, Resource, Resource Node,
  Recipe, Tool, Structure; relationships and conflict rules.
- [ADR-0001](../../docs/adr/0001-supabase-as-entire-backend.md) — Supabase as the entire
  backend, no dedicated game server.
