# Handover — Warden-Leiter-Implementierung (Stand 2026-07-12, Nacht — T3+T4 fertig)

Nachfolge-Session: zuerst `.claude/plans/feature-plan-warden-ladder-armor.md` (Plan, alle
Entscheidungen owner-bestätigt) und `docs/adr/0017-warden-ladder-realms-and-armor.md` lesen.
Dieses Dokument trägt nur den SESSION-Zustand, der nirgendwo sonst steht.

## Stand: T0–T4 + T8 + Charakterfenster ALLE COMMITTED auf `master` (nicht gepusht)

Commits auf `master`: 3ea4115 (Docs/ADR/Plan/Handover), 63b8d0a (T0 WardenKit),
7712686 (Warden-Sheets), 0c78580 (Sammel-Commit: Swing-Pose + T1 Refiner-Kernel +
T2 Distrikte + Moor-Rework + Salzried-Kette + T8 Sentinel), 97de4dc (Handover-Doc),
**34b22d3 (T3 Rüstung + WoW-Charakterfenster + T4 Warden-Kampf — Sammel-Commit, weil
sich die Features types/backends/GameScene/hud/i18n teilen wie 0c78580).** NICHT
gepusht (Owner pusht selbst). Arbeitsbaum ist sonst sauber.

Migrationen 0012/0013/0014 (+ die Funktions-Nachzieh-Migration `equip_chest_slot`)
sind LIVE DEPLOYED auf irjxvtgrzkmvjomozyiv. Die 0013-Datei trägt bereits die finale
chest-Whitelist.

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

## T3 — Rüstungssystem: FERTIG + verifiziert (uncommitted)

- src/content/armor.ts (node-pur): ARMOR_SLOTS/ARMOR_BUFFS (Boots +8% Tempo, **Brustpanzer
  (chest) +8% Angriffstempo**, Helm +2/+3 Band), armorBuff(), sanitizeEquipped(). Items
  tideglass_boots / **verdant_cuirass** / hushsteel_helm (kind 'armor', EN+DE, Icons,
  Codex-Card-Statzeilen).
  **AMENDMENT (Owner, 2026-07-12 Nacht):** Slot `gloves` → `chest` umbenannt, Teil
  `verdant_gloves` → `verdant_cuirass` (Grüngewebter Brustpanzer). Grund: die winzigen
  Handschuh-Overlays veränderten den Sprite optisch kaum; ein geplatteter Torso liest sich
  als klar anderer Charakter. **Das REVIDIERT ADR-0017 §3 („chest armor cut") — ADR + Plan
  sind noch NICHT nachgezogen (offener Doku-Punkt für den Owner).** Ein V-Ausschnitt lässt
  einen Streifen der Hemdfarbe durch (Identität bleibt).
- Avatar-Overlays in drawBlockheadSheet über ALLE 20 Frames: Boots (Füße), **Brustpanzer
  (großes Torso-Overlay: Frontplatte mit V-Ausschnitt/Grat/Nieten/Schulterstücken,
  Rückenplatte mit Wirbelgrat, Seitenprofil mit Kragen/Gürtel — bob/step-Offsets gefolgt)**,
  Helm (Kappe; Rückansicht-Vollhaar + Seiten-Haarsträhne). Pixelweise verifiziert.
- Migration **0013_armor_equip.sql LIVE DEPLOYED** (players.equipped jsonb + jw_equip +
  jw_join liefert 'equipped'). Whitelist per Folge-Migration **"equip_chest_slot" LIVE
  DEPLOYED** von ('boots','gloves','helm') → ('boots','chest','helm'); die 0013-Datei trägt
  den finalen Stand (chest) für frische Deploys. Nur besessene Items werden angelegt.
- Wire: `armor` auf PlayerPos/SelfPos (Backends injizieren selbst — sendPosition-Signatur
  unverändert), Look-Key = JSON([appearance, armor]), Presence-Re-Track bei Equip (einmalig,
  Rate-Limit-sicher). Peer-Pfad via upsertRemote-Simulation pixelweise verifiziert.
- Stats: moveSpeedFactor/atkCadence additiv zu Village-Buffs; Band-Delta in
  rollGuardianDamage + applyMobHit (Host liest das Band des TREFFENDEN aus dessen synced
  armor — armorBandOf()). Equip-UI im Inventar-Detail (Anlegen/Ablegen, ⛨-Badge).
- toggleArmor SERIALISIERT + koalesziert (equipChain/desiredEquip) — zwei schnelle Klicks
  überschrieben sich sonst gegenseitig (Race gefunden + gefixt + verifiziert).
- Dev-Flag `?armor` (alle drei Teile via Null-Kosten-jw_craft). Reload-Persistenz + Stats
  (1.08 / 463ms) im Browser verifiziert.

## T4 — Warden-Kampf-Backend + Altar: FERTIG + verifiziert (uncommitted)

- src/content/wardens.ts (node-pur): WardenDef-Registry (WARDENS.mire: Totem mire_totem,
  Gate-Key mire_key, realm 'sunken_mire' = District-ID!), MIRE_KIT (Platzhalter auf den
  Slam-Familien, eigene Seeds/Phasen — T5 authort Steigwasser+Geysire neu), kitOf(),
  wardenForRealm(). FightState.warden ('mire' | null = Guardian).
- Migration **0014_wardens.sql LIVE DEPLOYED** (apply_migration "wardens", kompletter
  Arc live smoke-getestet inkl. Mutex in BEIDE Richtungen): world.wardens jsonb +
  jw_contribute_warden (generischer Klammer-Loop, Client liefert Quoten) + jw_summon_warden
  (ALTAR_INTACT/FIGHT_IN_PROGRESS/NO_TOTEM, stempelt 'warden' ins fight-jsonb) +
  jw_open_realm_gate (einmalig, für immer). jw_guardian_hit/jw_knockdown UNVERÄNDERT
  (arbeiten generisch auf dem fight-jsonb; Drops laufen client-seitig übers Spoils-Fenster).
- Kit-Threading: GameScene-Fight-Layer (renderWave/slamWave/MeleeRing/Pose/Eye/Fury) +
  beide Backends adjudizieren über kitOf(fight.warden). Kampf-Panel/Toasts/Chat tragen den
  Warden-Namen (i18n t.warden/t.wardenAltar/t.system.warden*; Fury-Toasts endlich i18n).
- Altar-Offering = Siegel-Muster pro Rung: config.WARDEN_ALTAR_PER_HEAD (dev-klein unter
  FAST_SEAL), Bars-Panel #warden-panel (Seal-Bars-Skelett) nahe dem Altar.
- Tor-Schlüssel: mire_key (nicht verbraucht, Delve-Muster) dreht den Megalith-Bogen via
  realmGateAction → jw_open_realm_gate → realmOpened-Event → rebuildRealmGates()
  (Tore sind jetzt neu-aufbaubar; ACHTUNG: wardenForRealm matcht auf district.id,
  NICHT district.name — der Bug war drin und ist gefixt).
- Totem-Rezept: mire_totem (2 Hartholz + 2 Obsidian + 3 Fasern, an der Schmiede).
- Dev-Flag `?wardenfight`: Guardian-Altar dient als Mire-Altar, Grants für den ganzen
  Solo-Arc, DEV_FIGHT_HP + 90s-Fenster. Kompletter Arc im Browser (Mock) verifiziert:
  Opfern → Altar bricht → Beschwören (Totem weg, Panel „Der Moorwächter") → Kampf auf dem
  MIRE-Kit (8 Treffer / 6 Deflects außerhalb seiner Augenfenster) → Sieg → Spoils mit
  mire_key → Schlüssel dreht Tor → Betreten des Versunkenen Moors. Guardian-Regression
  (?fight) geprüft: warden=null, Kit 'guardian', altes Panel.

## Nächstes Ticket (T5)

T5 Mire-Vertikalschnitt (Details im Plan): authored Altar/Arena an der Mangrovenküste,
echtes Mire-Kit (Steigwasser-Wellenreihen + Geysir-Spalten), Mirefang-Drop (WEAPON_COMBAT
+ Tide-Passiv), Warden-Sprite in assetConfig registrieren (mire-warden.png liegt bereit),
Tide-Mechanik (~35-min-Periode, teilt 24h nicht), Brine Kiln (Refiner-Kernel!), Tideglass
Boots ans Ende der Kette, Quest-Steps, Lore-Tafel, i18n. Die T4-Dev-Brücken (?wardenfight
am Guardian-Altar, Altar-Panel-Anbindung) dann auf den echten Altar umziehen.

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
