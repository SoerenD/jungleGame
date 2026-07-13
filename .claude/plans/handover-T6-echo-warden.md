# Handover — T6: Echowächter + Das Stilldunkel (Echoes), Rung 2

Für eine PARALLELE T6-Session. Zuerst lesen: `.claude/plans/feature-plan-warden-ladder-armor.md`
(Plan, Ticket T7-Kontext), `docs/adr/0017-warden-ladder-realms-and-armor.md`, und
`.claude/plans/handover-2026-07-12-warden-implementation.md` (T5-Detail — T6 kopiert dessen
Muster fast 1:1 für Arena/Kette/Wächter).

## ⚠️ VORAUSSETZUNG: T6 baut DIREKT auf T5 auf — T5 muss auf master sein
T6 = der ZWEITE Wächter und nutzt das komplette T5-Gerüst: `activeBoss()`/`activeWarden`,
`wardenArenas`, `KIT_ART`, das Zwei-Arena-/dormant-Zweitsprite-Muster, den generischen Refiner,
die genmap-Distrikt-/Arena-Anatomie, die Backend-`arenaAnatomy(warden)`/`arenaRectOf(warden)`,
`WARDENS`-Registry, Quest-/Lore-/i18n-Muster. **T5 ist aktuell UNCOMMITTED** (18 Dateien +
`src/content/tide.ts`, build-grün, byte-stabil, browser-verifiziert). Bevor T6 startet, muss T5
auf **master** committet sein (Muster laut Memory: „worktree sessions merge master"). Sonst hat
T6 kein Fundament. → Erst T5 committen/mergen, dann T6-Worktree master mergen.

## Was T6 ist (ADR-0017, Plan-Zeile Rung 2)
| Wächter | Altar/Arena | Realm | Node → roh | Refiner → veredelt | Rüstung | Signaturmechanik |
|---|---|---|---|---|---|---|
| **Echowächter** | Der Höhlenschlund (Oberfläche) | **Das Stilldunkel** | Echokristall-Ader → Echokristall | **Klang-Ofen** → Stillstahl | **Stillstahl-Helm** (+2/+3 Band) | **Echoes** — nimm einen 20s-Geist deiner Bewegung auf, der ewig loopt; Mehr-Podest-Torschlösser löst man, indem man Geister ABWESENDER Freunde überlagert (async Koop) |

## 🔑 DER GROSSE UNTERSCHIED ZU T5: Echoes braucht SERVER-STATE (→ eine Migration!)
Die Tide (T5) war reine Client-`f(clock)` ohne Server. **Echoes NICHT:** aufgezeichnete Geister
loopen ewig UND werden GETEILT (async Koop — man legt Geister abwesender Freunde übereinander,
um Podest-Vaults zu öffnen). Also müssen die Aufnahmen persistiert werden.
- **Neue Migration** (nächste Nummer, aktuell wären das `0015_echoes.sql`): eine Tabelle für
  aufgezeichnete Geister (`world_id, ghost_id, who, recorded_at, samples jsonb`) + Vault-/Podest-
  Zustand, plus RPCs (`jw_echo_record`, `jw_echo_list`, ggf. `jw_pedestal_set`) im `p_world`-Muster.
  Migrationen LIVE deployen (MCP apply_migration auf irjxvtgrzkmvjomozyiv) BEVOR der Client sich
  drauf verlässt; zum Smoke-Testen Wegwerf-World, nie 'default'.
- **Design-Fixes aus der Refutation (Plan T6, PFLICHT):**
  - **Quantisierung**: Aufnahme-Starts auf `serverNow mod 20_000` runden, damit Geister-Phasen
    alignen (sonst laufen Loops nie synchron übereinander).
  - **Anti-Parking**: verhindere, dass ein am Podest geparkter Geist trivial ein Vault offenhält
    (z.B. Geist muss aktiv AUF dem Podest stehen im Loop-Fenster; kein Dauer-Halten).
  - Ghost-Replay = **reine f(loop-phase)** aus `(recordedAt, samples[])` — kein Tick, ADR-0002-Stil.
  - **Wöchentlicher Reseed** der Vault-Configs (nutzt eine week-abgeleitete Zahl; ACHTUNG: „Woche"
    darf keine echte Nacht/kein 24h-Teiler-Problem wie bei der Tide erben — week = `floor(now /
    7d)` ist ok, ist kein Zyklus mit Phasen).
- Node-Modul (wie `tide.ts`): eine `src/content/echoes.ts`, node-pur, `ghostPoseAt(now, ghost,
  periodMs)` als reine Funktion; `serverNow` wird reingereicht.

## Was T6 vom T5-Kochbuch 1:1 übernimmt (der mechanische Teil)
Fast alles außer Echoes ist „Daten + Art + zweite Arena/Distrikt", exakt wie T5:
1. **Items** (`content/items.ts`): `echo_crystal` (Resource), `hushsteel` (Resource, veredelt),
   `chime_kiln` (Structure), evtl. `echo_totem` (Consumable), `chime_charm` (der erneuerbare
   Konsum-Sink). Unions + BASE_ITEMS + ITEMS_DE (alle drei — DE ist exhaustiv, sonst tsc rot).
   **`hushsteel_helm` (Armor) existiert schon** (T3): Item + ARMOR_BUFFS (`slot:'helm'`, band 2/3).
   Nur das **Rezept** fehlt (kind:'tool', wie tideglass_boots).
2. **guardian.ts**: `makeEchoWaveTiles(w,h,seed)` (eigene Geometrie: expandierende Schall-Ringe +
   verzögerter „Echo-Repeat" der Vorwelle — Plan §Fight-kits; deutlich von Mire/Guardian
   verschieden). node-pur, keine Browser-Globals, kein ../config. Optional eine Echo-Waffe? (Plan
   nennt nur den Mirefang für Mire; für Echo keine Waffe → drops = nur der gateKey `hushdark_key`).
3. **wardens.ts**: `ECHO_KIT` (nutzt makeEchoWaveTiles) + `WARDENS.echo` (totem `echo_totem`,
   gateKey `hushdark_key`, realm `the_hushdark`, drops `{hushdark_key:1}`).
4. **config.ts**: `CHIME_KILN` RefinerConfig (echo_crystal→hushsteel), `WARDEN_ALTAR_PER_HEAD.echo`
   (fordert MIRE-Waren: saltreed/tideglass etc.), Echoes-Tuning (`ECHO_PERIOD_MS = 20_000`,
   `?echotest` Dev-Flag).
5. **recipes.ts**: `chime_kiln` (Structure), `hushsteel_helm` (kind:'tool'), `echo_totem`
   (requiresForge, aus Mire-Waren), `chime_charm` (Konsum-Sink).
6. **village.ts** `CHIME_KILN_ART` (StructureArt kind neu, z.B. `'chime'`, Hushdark-Signalfarbe —
   kaltes Blaustahl `#5a6b85`/`#93a8c9`, siehe hushsteel-PAL i/I). **icons.ts**: `drawChimeKiln`
   + Glyph + `echo_crystal`/`hushsteel`/`chime_charm` GRIDs + itemIcon-Lookup + STRUCTURE_DRAWERS.
   `GameScene.bakeVillageTextures`-Spread + nearbyStructure-Branch → openRefiner(CHIME_KILN).
7. **assetConfig.ts**: `echo_warden` (echo-warden.png, 96×96×8, liegt bereit). **BootScene**:
   `echo-idle`/`echo-eye` Anims. **GameScene KIT_ART.echo** (Sprite-Keys + Hushdark-Palette;
   `spriteKey:'echo_warden'`, `idle:'echo-idle'`, `eye:'echo-eye'`, kalte Blaustahl-Tints).
8. **genmap** (`tools/generate-map.ts`): **zweite Arena** am Höhlenschlund (Zone 16,222 80×74;
   die Delve-Shaft bei 56,260 NICHT stören!) — exakt T5s Muster: Arena NACH aller Node-Gen +
   Decor-Loops carven, Footprint-Nodes via `keptNodes` (`inEchoArenaOuter`) evakuieren, Decor via
   `decorGid` NACH den pick-Loops leeren, `wardenArenas.echo {arena,home,altar,monument,sealGate}`
   emittieren, Echo-Home 3×3 blocked=2. **Dritter Distrikt** `the_hushdark` (südl. Höhlenschlund,
   x≈16–96, y≥300 — freier Raum!) mit eigenem Tile-Streifen/Palette (wie mire-tiles), Echokristall-
   Adern (neuer NodeType `echo_crystal_seam`), Podest-Vault-Struktur(en), `rng2`-Stream, RNG-freie
   Node-Platzierung. t8-Lore-Tafel im Distrikt. **BYTE-STABILITÄT wie T5 beweisen** (gepinnte
   Region x<300∧y<300 Diff==0 außerhalb neuem Footprint; IDs stabil; BFS begehbar).
9. **Backends**: `arenaAnatomy('echo')`/`arenaRectOf('echo')` greifen automatisch, sobald
   `wardenArenas.echo` da ist — KEIN Backend-Umbau für die Arena. NUR die Echoes-RPCs sind neu.
10. **content/journey.ts**: `HUSHDARK_QUEST_STEPS` (reine Prädikate, wie MIRE_QUEST_STEPS).
    **lore.ts**: t8-Tafel EN+DE. **i18n.ts**: neue Strings EN+DE (Echo-spezifische UI/Toasts).

## Geografie
- **Echo-Arena**: im Höhlenschlund (16,222 80×74), Guardian-Arena-Anatomie repliziert, klar vom
  Delve-Shaft (56,260) UND der Cavern-Mouth-Obsidian bei (44,252)/(72,266)/(80,248)/(38,274)
  weg platzieren. Der Echowächter schläft ab Tag 1 sichtbar (zweiter dormant Sprite, MP-korrekt).
- **Distrikt Das Stilldunkel**: südlich, x≈16–96, y≥300 (freier Realm-Raum). Distrikt-Tor
  (findGateSpot nahe Höhlenschlund-Südkante) ⇄ Distrikt-Landung. Podest-Vaults im Distrikt.

## Erneuerbare Nachfrage (ADR-0017 §7, AC pro Rung)
Wöchentlich reseedete Vault-Configs + kuratierte „Begrüßungs-Geister"; `chime_charm` als
repeatable Konsum-Sink für hushsteel; Village-Contribution-Werte für Echokristall/hushsteel.

## Constraints/Gotchas (wie T5 + Echoes-spezifisch)
- `guardian.ts`/`wardens.ts`/`echoes.ts`/`stats.ts`/`armor.ts` node-importierbar: keine
  Browser-Globals, kein `../config`.
- genmap Byte-Stabilität: Arena NACH Node+Decor-Loops carven (Ground-Writes ändern pick-Ergebnis,
  nicht -Anzahl); Footprint-Nodes via keptNodes evakuieren; Decor per decorGid NACH pick-Loops
  leeren (NIE decor=null davor — verschiebt den pick-Stream). Distrikt-Randomness nur `rng2`,
  Distrikt-Nodes RNG-frei (placeNodeNear). `npm run genmap` nach Edits; JSON nie handeditieren.
- Zweite Arena = zweiter dormant Boss-Sprite via `activeBoss()`-Bundle (nicht ein geteilter,
  der umzieht — sonst verschwindet der andere Wächter im MP). KIT_ART.echo für die Optik.
- **Presence-Limit**: Echoes-Sync über bestehende Broadcasts/RPC-Reads, NIE extra presence-
  `track()` (>~0.5/s → phx_closed). Geister werden gelistet (jw_echo_list), nicht ge-presenced.
- Jede RPC braucht `p_world`; Migration LIVE deployen vor Client-Abhängigkeit; Wegwerf-World zum
  Testen, nie 'default'.
- **Dismantle-Refund**: Podest-Vaults / werthaltige Hushdark-Strukturen beim Abbau banken
  („kein Item-Verlust je" ist unantastbar).
- Dev-Server nur auf Owner-Wunsch, headless `?pump&canvas`, über `__jw`/`resolveEAction().run()`
  treiben, danach STOPPEN. `?echotest` als Dev-Flag (kurze Echo-Periode / Vault offen).
- npm/npx IMMER `--registry https://registry.npmjs.org/`. `npm run build` (tsc && vite build) =
  Korrektheitsprüfung. NIE mehrzeilige `npx tsx -e` (hängt) — Script-Datei.

## AC (T6)
Voller Loop solo in Mock UND live: am Höhlenschlund opfern (Mire-Waren) → beschwören → Echowächter
besiegen (eigenes Kit/Optik in SEINER Arena) → hushdark_key → Tor öffnen → Stilldunkel betreten →
Echokristall abbauen → Chime Kiln → hushsteel → Helm craften → anlegen (+2/+3 Band, am Paperdoll
sichtbar) → **Echoes**: 20s-Geist aufnehmen, der loopt; ein Mehr-Podest-Vault mit überlagerten
Geistern öffnen (auch mit dem Geist eines abwesenden „Freundes" = eigener zweiter Geist).

## Empfohlene Reihenfolge in der T6-Session
1. Understand-Workflow über die T5-Dateien (activeBoss/wardenArenas/KIT_ART/refiner/genmap-Arena/
   backends) — T5 ist die Blaupause.
2. Migration 0015_echoes (Tabelle + RPCs) entwerfen + LIVE deployen (Wegwerf-World-Smoke).
3. Content-Daten (items/guardian-kit/wardens/config/recipes/echoes.ts/village/icons/journey/lore).
4. genmap (Echo-Arena + Hushdark-Distrikt + Podest-Vaults), byte-stabil beweisen.
5. GameScene/BootScene/Backends (KIT_ART.echo, echo-Sprite/Anims, Chime Kiln, Echoes-Mechanik:
   Aufnahme/Ghost-Replay/Podest-Vault-Logik), i18n.
6. Build grün, adversariale Review, Browser-Loop verifizieren.

## Danach: T7
T7 = Verdant-Wächter + Grüne Terrassen (Cultivation: Pflanz-/Pflege-Stufen, tend-RPC, Dormanz nie
Verlust, Husking Mill, `verdant_cuirass` existiert schon als Item+Buff). Selbes Gerüst.
