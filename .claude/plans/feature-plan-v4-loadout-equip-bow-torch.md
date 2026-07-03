# Feature plan: Jungle World v4 — Loadout, Bow, Hand Torch, sprites

One round of changes: a three-slot Loadout equip system (equip-to-use), a ranged Bow against the
Guardian, a worn Hand Torch that replaces the automatic player-glow, fence removal, drag-to-place,
and two new sprites (Seal barrier, Ancient Tablet).

Resolved in a grilling session on 2026-07-03. CONTEXT.md was updated and ADR-0003 was written in
the same session — read them first; this file does not repeat the glossary. ADR-0002 (Guardian is
a pure function of `summonedAt`) is unchanged and still binding: nothing below alters the
Guardian's schedule. Damage *values* DO change this round (melee buffed to 2/3, `GUARDIAN_MAX_HP`
retuned upward 1500 → 2250), but the schedule and Eye-Window timing stay a pure function of
`summonedAt`.

## Resolved decisions

### A. Loadout equip system (the keystone — equip-to-use)

1. **A Tool acts only while it is the in-hand item.** Three Loadout quick-slots; keys 1–3 pick the
   single in-hand slot. Only the in-hand Tool works. Equippable set: `axe`, `pickaxe`, `machete`,
   `hammer`, `fishing_rod`, `ancient_axe`, `ancient_pickaxe`, `hand_torch`, `bow`. Resources,
   Structures, and consumables are NOT equippable.
2. **Bootstrap preserved.** Bare hands still harvest the basic Nodes (`tree`, `rock`, `fruit_bush`)
   at 1× so a new Player with an empty Loadout is never locked out. `requiredTool` Nodes
   (`fiber_vine`→machete, `hardwood_tree`→ancient axe, `obsidian_rock`→ancient pickaxe,
   `fishing_spot`→rod) require that Tool **in-hand**. The `bonusTool` ×2 on **Resource Nodes** (tree→axe, rock→pickaxe,
   tier-2 nodes) applies only when the matching Tool is **in-hand**. NOTE: the **Guardian** uses a
   DIFFERENT rule — a flat +1 for the matching in-hand Tool (2 bare → 3), not a ×2 — see item 3 and
   Section B.
3. **Server adjudication.** `hitNode(nodeId, withTool?)` and `hitGuardian(withTool?)` gain the
   in-hand Tool. Server validates: `requiredTool` satisfied only if `withTool` is that tool (or its
   tier-2 upgrade) AND the Player owns it; on **Resource Nodes** the `bonusTool` ×2 applies only if
   `withTool` matches AND owned. On the **Guardian**, the matching in-hand Tool (axe/pickaxe or its
   tier-2 upgrade, owned) instead adds a flat **+1** (base 2 → 3), and an in-hand `bow` deals 2 —
   the +1 divergence, NOT a doubling; do not port the ×2 to `hitGuardian`.
   Update `MockBackend.hitNode` (~L493/L496) and `hitGuardian` (~L874). `craft`'s `requiresTool`
   (hammer to build) stays an ownership check — building is not an in-hand action.
   `holdsBonusTool` in `nodeTypes.ts` gains an in-hand-aware variant (keep the ownership helper for
   the tier-2 upgrade mapping).
4. **Held item synced + shown.** Add `held?: ItemId` to `PlayerPos` (types.ts) and to
   `sendPosition(x, y, dir, moving, held)`. Render the in-hand item's icon just above the local
   player and every remote avatar (a small sprite/`itemIcon` above the head, depth above the
   avatar). Null when the in-hand slot is empty.
5. **Loadout UI.** A 3-slot bar in the HUD (near `#bottom-bar`). Drag Tools from the inventory grid
   into slots (reuse the existing HTML5 drag infra in `hud.ts`). Keys 1–3 select the in-hand slot;
   the selected slot is highlighted. Loadout contents + selected index persist per-player in
   localStorage (like `invOrder`), NOT on the backend. Emit the selected in-hand item to GameScene
   via `bus` so it can be broadcast and used on hit RPCs.

### B. The Bow (ranged Guardian weapon)

6. **`bow` — new tier-1 Tool.** Recipe: basic Resources only, no Guardian drops —
   `wood: 2, fiber: 3, stone: 1` (stave, string, arrowhead; tune freely; craftable before the first
   fight so a group can bring it to the first Guardian). Self-contained, infinite shots, no arrow item.
7. **Ranged hit.** With the Bow in-hand and within ~8 tiles of the Guardian, the interact action
   looses an arrow (visual projectile toward the Guardian). On landing it calls
   `hitGuardian('bow')`. Damage is **2** (equal to bare melee, below the 3 of tool-melee — the Bow
   is the safe-but-weaker option), gated to the Eye Window exactly like melee (server validates the
   window at server time). Outside a window: 0 / bounce.
8. **Slower cadence.** Bow fires on `BOW_CADENCE_MS ≈ 500` (vs. melee `SWING_CADENCE_MS = 300`), so
   axe-melee (3 dmg/300ms) out-DPSes the Bow (2 dmg/500ms) by a wide margin — risky-fast vs.
   safe-slow. At 500ms a Bow user contributes ~16% of a mixed 4-player fight (~360 of 2250); do NOT
   tighten toward 300ms (collapses the ladder) or raise Bow damage to 3 (erases the 2-vs-3 gap). Add
   the constant to `config.ts`.
9. **Bow is available from the first fight + melee buff + HP retune.** The Bow is tier-1
   (basic-resource recipe, no Guardian drops), so a group can bring it to the very first Guardian —
   the first fight is NOT melee-only. To keep melee-range risk worth it, **buff Guardian melee +1**:
   `guardianDamage` returns **2** bare / **3** with an in-hand axe or pickaxe (was 1/2; Resource
   Node damage is unchanged). To absorb that ×1.5 melee ceiling, retune **`GUARDIAN_MAX_HP` 1500 →
   2250** in `config.ts` — this preserves the axe-group time-to-kill (3 axe friends ≈ 2430 ≥ 2250,
   solo ≈ 810 stays near-impossible) while a pure-bow group (4 × 360 = 1440 < 2250) can't solo-clear,
   so the Bow stays a safe support weapon. Numbers verified against the awake window + eye-window
   uptime; scale HP with `GUARDIAN_MAX_HP` if that changes.

### C. Hand Torch (worn light) + remove the auto glow

10. **`hand_torch` — new tier-1 Tool.** Recipe: `wood: 1, fiber: 1` (cheap, early). Kind `tool`,
    equippable. Distinct from the placed `torch` Structure, which is untouched.
11. **Light behaviour.** While the Hand Torch is the in-hand item, cast a warm **orange** light
    around the Player at night (bigger/more saturated than the old glow, e.g. tint ~`0xff8a3a`).
    **Remove the automatic `playerGlow`** (GameScene.ts ~L453 create, ~L1727 update) — light now
    comes only from a held Hand Torch (plus existing placed light sources). Remote players holding a
    Hand Torch also cast light. Night overlay is unchanged (never fully black).

### D. Remove the fence

12. Delete `fence` from `items.ts` (`StructureId` + `ITEMS`), its recipe in `recipes.ts`, and
    `st_fence` in `assetConfig.ts`. Remove/retire `public/assets/objects/fence.png` and its
    generation in `tools/compose-assets.ts` + `tools/make-placeholders.ts`. On world load, filter
    out any structure whose `type` is not a known `StructureId` (defensive — old placed fences
    vanish, no crash, future-proofs later removals). Soften the tablet lore line in `lore.ts`
    (`'...every fence, fire and wall...'` → drop "fence"). Update the seed chat line in
    `MockBackend.ts` (~L161) and any `CREDITS.md` fence mention.

### E. Drag-to-place (in addition to Enter)

13. Dragging an inventory Structure onto the game canvas places it on the **tile under the cursor**
    if that tile is valid (`canPlaceLocal`) AND within a short reach of the player (a few tiles;
    else a toast, no placement). Map screen→world tile via the camera. Signposts still open the
    text prompt on drop. The existing select→face→Enter/E flow (`enterPlaceMode`/`confirmPlace`)
    stays fully working.

### F. Sprites

14. **Seal barrier.** Replace the generated flat violet shimmer (`BootScene.ts` ~L108,
    `seal-barrier` 16×32 canvas) with an authored rune-stone gate sprite: carved stone segments
    with a glowing violet seal sigil, kept violet-toned and 16×32-tileable so the epic break FX
    (`epicSealBreak`) and the minimap dot still read the same. Author via a `tools/compose-*.ts`
    script (PNG asset) or richer canvas drawing — prefer a checked-in PNG + `assetConfig` entry for
    consistency with other objects.
15. **Ancient Tablet.** New upright carved rune stele sprite (standing slab, glowing engraved
    runes, readable at gameplay zoom, distinct from rocks). Author via a new `tools/compose-*.ts`
    script writing `public/assets/objects/tablet.png`. Keep the existing `tablet` key + `~0.55`
    scale in GameScene.

## Acceptance criteria

- **Equip gates gathering.** Given the axe is owned but the Hand Torch is in-hand, when I swing at
  a tree, then it chops at 1× (no bonus); when I switch the axe in-hand (press its slot key), then
  it chops at 2×.
- **Gated node needs the tool in-hand.** Given I own a machete but it is not in-hand, when I try to
  cut a fiber vine, then harvesting is refused (`TOOL_REQUIRED`) until the machete is in-hand.
- **Bare hands bootstrap.** Given an empty Loadout, when I swing at a tree or rock, then it still
  harvests at 1×.
- **Ranged Bow.** Given the Bow — a tier-1 Tool craftable before the first fight — in-hand and I
  stand outside the danger tiles within ~8 tiles, when I loose during an Eye Window, then the
  Guardian takes 2 and I am recorded as a participant; outside a window, 0.
- **Melee keeps a niche.** Melee deals 2 bare / 3 with an in-hand axe or pickaxe (vs. the Bow's flat
  2), and Bow cadence (~500ms) is slower than melee (300ms); axe-melee out-DPSes the Bow on both
  damage-per-hit and cadence.
- **Held item is shared.** Given a friend equips a Hand Torch at night, then I see the torch icon
  above their avatar and their orange light; when they switch to the axe, the overhead icon
  updates for me.
- **Auto-glow gone.** Given no Hand Torch in-hand at night, then there is no glow following the
  Player (only placed lights / dim overlay).
- **Fence removed.** The fence is absent from crafting and inventory; loading a save that contained
  a placed fence shows no fence and throws no error.
- **Drag-to-place.** Given I drag a campfire onto a valid tile within reach, then it places there
  without pressing Enter; dropping on an invalid/out-of-reach tile shows a toast and places
  nothing. The Enter flow still works.
- **Sprites.** The arena barrier renders as the new rune-stone gate (still breaks/animates), and
  Ancient Tablets render as upright rune steles.
- **Melee buff + HP retune.** A bare Guardian melee hit in an Eye Window deals 2 (was 1); with an
  in-hand axe or pickaxe it deals 3 (was 2) — a flat +1, NOT a doubling; Resource Node damage is
  unchanged (1 bare, 2 with the matching Tool). `GUARDIAN_MAX_HP` is 2250 (was 1500) so total
  time-to-kill stays in the intended band.
- `npm run build` (`tsc && vite build`) passes — the correctness check (no tests).

## Scope boundaries — do NOT build

- No huntable animals, creature AI, spawn tables, or any new enemy. The World stays enemy-free;
  the Bow's only target is the Guardian.
- No arrow ammo item or economy.
- No change to the Guardian's schedule, waves, lunges, fury timing, Eye-Window math, or ADR-0002.
  Damage *values* DO change this round: melee is buffed to 2/3 and `GUARDIAN_MAX_HP` is retuned
  1500 → 2250. The schedule and Eye-Window timing stay a pure function of `summonedAt`.
- Do NOT touch the placed `torch` Structure, crafting flow, crate storage, Sawmill/planks, Seal
  quotas, Journey, fishing/cooking, or the Avatar composer beyond adding the overhead held-item.
- Loadout arrangement is NOT persisted server-side — client localStorage only; just the in-hand
  `held` item crosses the wire.

## Constraints and gotchas

- `src/content/guardian.ts` must stay node-importable (no `../config`, no browser globals):
  `guardianDamage` takes the in-hand Tool as an argument instead of reading inventory/config, and
  returns 2 for bare hands or the Bow, 3 for an in-hand axe/pickaxe (a flat +1, not a ×2 — diverges
  from Resource Node damage). `GUARDIAN_MAX_HP` (2250) lives in `config.ts`, never in `guardian.ts`.
- All state still flows through the `Backend` interface and must stay Supabase-shaped (ADR-0001):
  `held` on presence is a Realtime-broadcast field; the in-hand Tool on hit RPCs is a validated
  argument. Never trust the client's claimed Tool beyond what the Player owns.
- The hidden-preview RAF freeze still applies — drive dev via `?pump&canvas` and the `__jw`/`__game`
  handles.
- Keep `holdsBonusTool`'s tier-2 upgrade mapping (`TOOL_UPGRADES`) when converting the bonus/gate
  checks to in-hand: an in-hand `ancient_axe` must satisfy an `axe` bonus/requirement.

## References

- CONTEXT.md — new terms: **Loadout**, **Hand Torch**, **Bow** (tier-1, basic-resource recipe);
  updated **Tool**; new **Equip rule** and updated **Guardian damage rule** relationships (melee
  2/3, a +1 tool bonus that diverges from the Node ×2 rule).
- docs/adr/0003-loadout-equip-and-ranged-bow.md — the pivot and how it preserves ADR-0002.
- docs/adr/0002-guardian-runs-on-deterministic-schedule.md — unchanged; the schedule invariant.
- docs/adr/0001-supabase-as-entire-backend.md — no game server; lazy timestamps; Backend interface.
