# Handover — Warden-Leiter-Implementierung (Stand 2026-07-12, Abend)

Nachfolge-Session: zuerst `.claude/plans/feature-plan-warden-ladder-armor.md` (Plan, alle
Entscheidungen owner-bestätigt) und `docs/adr/0017-warden-ladder-realms-and-armor.md` lesen.
Dieses Dokument trägt nur den SESSION-Zustand, der nirgendwo sonst steht.

## Stand ist COMMITTED (Owner-freigegeben, 2026-07-12 spät)

Vier Commits auf `master`: 3ea4115 (Docs/ADR/Plan/Handover), 63b8d0a (T0 WardenKit),
7712686 (Warden-Sheets), 0c78580 (Sammel-Commit: Swing-Pose + T1 Refiner-Kernel +
T2 Distrikte + Moor-Rework + Salzried-Kette + T8 Sentinel — die Features teilen sich
types.ts/backends/GameScene/i18n und shippen deshalb zusammen). Arbeitsbaum sauber.
**Frischer Worktree?** Der Stand ist im selben Repo erreichbar: `git merge master`
(oder auf master wechseln) holt alles.

## Was fertig und verifiziert ist (alles im Arbeitsbaum)

- **T0**: `WardenKit`-Interface + `GUARDIAN_KIT` in src/content/guardian.ts; byte-identisch
  bewiesen (Sampler-SHA identisch) + unabhängiges Review ohne Findings.
- **T1**: generischer Refiner-Kernel. Migration **0012_refiners.sql ist LIVE DEPLOYED**
  (irjxvtgrzkmvjomozyiv, apply_migration "refiners") und live smoke-getestet. Mock-Spiegel +
  generisches HUD-Panel (#refiner-panel; CSS-Sichtbarkeits-Bug in styles.css behoben —
  war der "Geister-Menüleiste"-Bug). Dev-Flag `?refinertest`. Sawmill unberührt.
- **T2**: Karte 384×384 (Kern 300×300 pinned, mehrfach byte-stabil bewiesen), Distrikt
  `sunken_mire` (100,300 108×72), Tor Mangrovenküste (152,290) ⇄ (153,303), Kamera-Clamp,
  Minimap-Crop, Dot-Filter, Fog-Restride akzeptiert (ADR-0009-Disziplin). Dev-Flag `?realmtest`;
  `realmGateOpen()` ist der T4/T5-Stub.
- **Moor-Rework** (Owner-Feedback "boring"): eigener Tile-Streifen mire-tiles.png (Ids 11–19,
  tools/compose-mire-tiles.ts; BootScene komponiert ihn bei x=176 in die Canvas-Tileset),
  Torf/Schwarzwasser/Schlamm/Dammplatten + Ried-Dekor, See + Kanäle + Damm (Begehbarkeits-
  regel: nie zwei Lücken, BFS Tor→Insel MUSS begehbar bleiben!), Ruineninsel (T5-Altar-Ort),
  tote Bäume (foliage 'dead_tree'), Ambiente (mireVeil + mirePuffs in GameScene, nacht-
  kompensiert), animiertes Schwarzwasser (Slot 14 im Water-Anim-Callback), Minimap-Farben,
  Megalith-Torbogen (buildRealmGate).
- **Salzried-Kette** (Owner: "keine neuen Ressourcen sichtbar"): NodeType `salt_reed_bed`
  (3 HP, 2× `saltreed`, Machete-Bonus, bare-hand ok) + Item + Icon + DE-Namen + Chip-Tints +
  14 authored Betten. Sichtbarkeits-Fix: Dekor-Riede gedimmt, Node-Büschel größer mit
  Teal-Kristallen (#63e0b8 = Realm-Signalfarbe). Ernte end-to-end in Mock verifiziert.
  SQL braucht KEINE Migration (jw_hit_node ist generisch, Client liefert Tuning).
- **T8**: i18n "the Warden"→"the Sentinel" / "die Schildwache" (Kit-Id 'warden' unverändert).
- **Warden-Sprites**: mire-/echo-/verdant-warden.png in public/assets/objects/ (je 768×96,
  8 Frames im Guardian-Vertrag; compose-Scripts in tools/). NOCH NICHT in assetConfig
  registriert — kommt mit T5–T7. Kodex-Artefakt:
  https://claude.ai/code/artifact/f2b52226-4f0d-45bc-9f8b-027a5b4a8e3a
  (Generator: Session-Scratchpad build-warden-codex.ts — Scratchpad ist flüchtig).

## Nächste Tickets (Task-Tracker #5/#6 pending)

T3 Rüstungssystem (Boots/Gloves/Helm, ARMOR_BUFFS, players.equipped + jw_equip-Migration,
Avatar-Overlays über alle 20 Frames, `armor` auf pos/presence + look-Key) → T4 Kampf-Backend
(world.fight.warden-Mutex, generische Altar-RPC in jw_contribute_village-Form, Gate-Keys,
Totem-Rezepte, eine Migration) → T5 Mire-Vertikalschnitt (Details im Plan).

## Session-Learnings (nicht im Repo dokumentiert)

- NIE mehrzeilige `npx tsx -e "…"` auf dieser Maschine — hängt stumm im Hintergrund.
  Immer Script-Datei schreiben und ausführen.
- Byte-Stabilitäts-Beweis nach jedem genmap: Vorher-JSONs kopieren, Diff auf gepinnte Region
  (x<300 ∧ y<300) == 0, Nicht-Distrikt-Node-Ids unverändert, BFS Tor→Insel begehbar.
- Owner-Sprache: Deutsch. Visueller Anspruch: jede neue Zone braucht eigene Palette +
  Ambiente (Memory art-style-mature-pixelart), Signalfarbe je Realm; erntbare Nodes müssen
  sich vom Dekor abheben.
- Spend-Limit kann Subagenten killen: Workflows fail-fast bauen, inline-Fallback bereithalten.
- Dev-Server nur auf Owner-Wunsch starten, danach STOPPEN (explizite Ansage).
