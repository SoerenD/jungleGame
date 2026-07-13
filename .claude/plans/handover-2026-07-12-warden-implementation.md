# Handover — Warden-Leiter-Implementierung (Stand 2026-07-12 — T5 gebaut, unverifiziert im Browser)

Nachfolge-Session: zuerst `.claude/plans/feature-plan-warden-ladder-armor.md` (Plan, alle
Entscheidungen owner-bestätigt) und `docs/adr/0017-warden-ladder-realms-and-armor.md` lesen.
Dieses Dokument trägt nur den SESSION-Zustand.

## SAFETY-CHECK (unverändert)
`git status` muss den T5-Arbeitsbaum zeigen (unten), `git log --oneline` muss `34b22d3`
("feat(warden-ladder): visible Armor + WoW character panel + Warden fight backend (T3/T4)")
auf `master` zeigen (HEAD = `3b5da57` Docs-Commit). Ist das nicht so → falscher Checkout;
Stand lebt im Haupt-Checkout `C:\Users\soeren.dierkes\littleGame` auf `master`.

## Stand: T0–T4 + T8 COMMITTED (34b22d3). T5 GEBAUT, aber UNCOMMITTED + NICHT browser-verifiziert.

T5 (Moorwächter-Vertikalschnitt) ist vollständig implementiert, `npm run build` ist GRÜN,
genmap byte-stabil bewiesen, node-pure Logik (Tide + Mire-Kit) verifiziert. NICHT committed
(Owner pusht/committed selbst) und NOCH NICHT im Browser durchgespielt (Dev-Server ist
owner-gated — nicht ohne Ansage starten).

**T5 braucht KEINE neue Migration/RPC** — reines Daten + Art + Scene, reitet auf 0012 (Refiner),
0013 (Armor), 0014 (Wardens). Die Tide ist pure Client-f(clock) (ADR-0001).

## T5 — was gebaut wurde (Arbeitsbaum, uncommitted)

**Content (node-pur):**
- `src/content/tide.ts` (NEU): Tide-Uhr, pure f(now, period). Periode `TIDE_PERIOD_MS`
  2_100_000ms (~35min, teilt 24h NICHT; dev-kurz, `?tide`=24s). `tideHeight/tideFloods/
  tideExposed/tideExposedWithin/isSpringTide/springSwell`.
- `guardian.ts`: `makeMireWaveTiles` (Steigwasser-Bänder + Geysir-Säulen + Tidal-Comb, klar
  vom Guardian verschieden) + `mirefang` WEAPON_COMBAT-Zeile (Schwert-Familie, ~9.4 DPS).
- `wardens.ts`: MIRE_KIT nutzt jetzt makeMireWaveTiles; drops = `{mire_key, mirefang}`.
- `items.ts`: `tideglass` (Resource), `mirefang` (Tool), `brine_kiln` (Structure) — Unions +
  EN + DE.
- `config.ts`: `BRINE_KILN` RefinerConfig (saltreed→tideglass), `TIDE_PERIOD_MS`,
  `WADE_SLOW_FACTOR` (0.6), `TIDE_EXPOSURE_SLACK_MS` (dev-skaliert), `DEV_TIDE` (`?tide`).
- `recipes.ts`: `brine_kiln` (Structure, Hammer) + `tideglass_boots` (kind:'tool', auto-equip).
- `village.ts`: `KILN_ART` (StructureArt kind 'kiln', Teal). `icons.ts`: `drawKiln` + kiln-Glyph
  + `tideglass`/`mirefang` GRIDs + itemIcon-Lookup.
- `journey.ts`: `MIRE_QUEST_STEPS` + `MireProgress` + `mireQuestComplete` (reine Prädikate,
  wie DELVE_QUEST_STEPS). **NOCH NICHT an einen HUD-Tracker gehängt** (siehe offene Punkte).
- `lore.ts`: t7 „Tablet of the Tide" EN+DE. `i18n.ts`: `toast.reedSubmerged` EN+DE.

**Karte (genmap):**
- `tools/generate-map.ts`: Mire-Arena an der Mangrovenküste bei **(110,236) 17×13** (Guardian-
  Arena-Anatomie repliziert: Cliff-Wandring, Mire-Flagstone-Boden, Süd-Gate-Lücke,
  MIRE_HOME 3×3 top-center, MIRE_ALTAR innen, MIRE_MONUMENT außen). Carve LÄUFT NACH aller
  Node-Generierung + Decor-Loops (kein RNG-Draw-Shift); Footprint-Nodes via `keptNodes`
  evakuiert (IDs bleiben stabil); Decor via `decorGid` NACH den pick-Loops geleert
  (nicht `decor=null` davor). `wardenArenas.mire {arena,home,altar,monument,sealGate}` emittiert.
  Mire-Home 3×3 als blocked=2 gestempelt. t7-Tafel bei (155,304) im Distrikt.
- `assetConfig.ts`: `mire_warden` (mire-warden.png, 96×96×8) registriert.
- **Byte-Stabilitäts-Beweis** (Skript, bestanden): überlebende Node-IDs 0 geändert; 10 Nodes
  im Footprint evakuiert; groundData/decorData/blocked Diffs 285/14/74 — ALLE 0 außerhalb des
  Footprints; BFS spawn→monument→altar + gate→islet begehbar; t7 begehbar.

**GameScene + Backends (Slice 3, der große Umbau):**
- `WardenArena`-Typ + `wardenArenas` in WorldData. Neuer `KIT_ART`-Table (ersetzt FURY_TINTS):
  pro-Kit Sprite/Anim-Keys + Palette (Guardian = exakte alte Literale = No-op; Mire = Teal).
- **`activeBoss()` / `activeWarden`**: pro-Boss-BossVisual (guardianSprite… vs mireSprite…),
  gewählt per fight.warden. activeWarden wird bei startFight/beginEngaged gesetzt und ERST am
  Ende von endFight genullt (damit Wrack/Reset auf den richtigen Boss fällt). Alle Fight-
  Render/Adjudikations-Stellen (place/blockers/renderWave/slamWave/meleeRing/render-loop/
  shatter/restore/guardianAction/looseArrow/fireGuardianHit/hit-flash) routen durch activeBoss.
  **Beide Wächter sind ab Tag 1 sichtbar schlafend** (eigene dormant Sprites, MP-korrekt).
- Dormanter Mire-Boss + Altar + Monument im Init-Block (nur wenn wardenArenas.mire da).
  BootScene: `mire-idle`/`mire-eye` Anims.
- Echter Mire-Altar: `mireAltarAction()` (in der Interaktionskette, ohne Dev-Flag) →
  generisches `wardenAltarAction('mire')`. `warden-altar-near`-Emit auf mireAltarPos.
  `?wardenfight` gewährt jetzt nur noch Waren + 90s-Fenster (Grant lebt in beiden Backends).
- Brine Kiln: KILN_ART im bakeVillageTextures-Spread + nearbyStructure-Branch → openRefiner.
- Tide-Hooks: `moveSpeedFactor` Wade-Slow (nur sunken_mire + Flut; Mirefang ignoriert),
  `reedSubmerged` Ernte-Gate (+ Backstop in swingAtNode), `tideVeil` Steigwasser-Overlay
  (im mire-ambience-Block + Teardown).
- Backends: `arenaAnatomy(warden)` (Mock) / `arenaRectOf(warden)` (Supabase) — Roster-Snapshot,
  liveRoster, Knockdown-Adjudikation wählen die Arena per fight.warden. Victory-Drops sind
  bereits generisch (`wardenDef(warden).drops` → Spoils) — mire_key + mirefang landen korrekt.

## Verifikation
- `npm run build` GRÜN (tsc && vite build).
- genmap Byte-Stabilität bewiesen (Skript: 0 gepinnte Diffs außerhalb Footprint, IDs stabil).
- Node-Logik-Check bestanden (Tide-Bereiche/Perioden, Mire-Kit deterministisch + dodgebar +
  Eye-Windows, Mirefang-Drop/Band).
- **Adversariale Review** (4-Agenten-Workflow, high-effort): 1 bestätigter Befund, 0 unsicher,
  0 false positives. Befund (behoben): Mirefang-Tide-Immunität hing an `heldTool()` (in-hand),
  der Item-Text verspricht sie aber „getragen" → auf `(inventory['mirefang'] ?? 0) <= 0` (Besitz)
  umgestellt. Alle anderen Pfade (Altar-Kette, Roster/HP, Knockdown-Arena-Routing, Victory-Drops,
  mire_key→Tor, Guardian-No-op, genmap) als korrekt bestätigt.
- **BROWSER-DURCHLAUF (Solo, Mock, `?pump&canvas&wardenfight&tide`) — VOLLER LOOP VERIFIZIERT:**
  Mire-Altar-Beschwörung (Arena an der Mangrovenküste, mire_warden-Sprite, „Der Moorwächter
  regt sich") → Kampf im Mire-Arena (Roster korrekt aus der Mire-Arena, HP 30, Steigwasser-
  Danger/Knockdowns/Exhaustion/Eye-Windows funktionieren) → Sieg → Drops `{mire_key, mirefang}`
  in Spoils, entnommen → **authentisches** Tor-Öffnen (dormant→mire_key→openRealmGate→offen,
  Client+Backend) → Betreten des Versunkenen Moors → **Tide-Gate beidseitig** (Ernte bei Flut
  VERWEIGERT / bei Ebbe erlaubt → saltreed) → **Sole-Ofen** (saltreed→tideglass) → Stiefel
  gecraftet → angelegt → **+8% Tempo im Charakterfenster + Gezeitenglas-Stiefel am Avatar-
  Paperdoll sichtbar**. Screenshots gemacht.
- **LIVE-SMOKE (SupabaseBackend, Wegwerf-World `t5smoke`, danach aufgeräumt + Env restauriert):**
  Client bootet gegen live (`[jw] backend: Supabase`), **`jw_join` + `jw_craft` (der
  ?wardenfight-Totem-Grant) feuern live und persistieren** (Spieler `SmokeT5` in `t5smoke` mit
  mire_totem angelegt — via MCP `execute_sql` verifiziert; `default` unberührt, 19 Spieler). Der
  **volle Realtime-Loop ist im HEADLESS-Preview NICHT fahrbar** (mit `?pump` stockt der Realtime-
  Channel; ohne `?pump` friert der Tab ein — dokumentierte Env-Grenze, kein T5-Bug). Die T5-
  Live-Pfad-Änderung (SupabaseBackend `arenaRectOf(warden)`/`playersInArena(warden)` +
  `wardenArenas` in WorldData) ist minimal, build-grün und logisch identisch zum Mock (dort voll
  browserverifiziert). Aufräumen: alle world_id='t5smoke'-Zeilen + world-Zeile gelöscht; Env-
  Overrides (blank = Mock) zurückgesetzt.
- OFFEN (niedriges Restrisiko): der **finale Live-Loop in einem ECHTEN Browser** (deine
  normale Live-Session — der Headless-Preview kann den Realtime-Channel nicht) + der echte
  2-Browser-Boots-Sichtbarkeitstest (Solo-Mock zeigt nur Bots; `armor`-Wire ist T3-pixelverifiziert).

## Offene Punkte für den Owner
1. **Live-Smoke** auf einer Wegwerf-World (nie 'default' anfassen) + echter 2-Browser-Sichtbar-
   keitstest der Boots, wenn gewünscht. Solo-Mock ist voll durch.
2. **~~Doku-Punkt Chest-Cuirass~~ ERLEDIGT:** Während dieser Session ist `f38e73d`
   („docs(adr-0017): Amendment 1 — rung-3 armor is a chest Cuirass, not Gloves") auf master
   gelandet und ist jetzt HEAD (sauberer Docs-Only-Nachfahre von 34b22d3; T5-Änderungen liegen
   unberührt darüber). ADR-0017 (Amendment 1) + die Plan-Tabelle sind auf den Brustpanzer
   nachgezogen. Kein offener Doku-Punkt mehr. (HINWEIS: HEAD war bei Session-Start 3b5da57;
   der Owner hat f38e73d parallel committet.)
3. **MIRE_QUEST_STEPS an den HUD-Tracker hängen?** Die Daten sind da (reine Prädikate). Wiring
   braucht (a) die wardens-Snapshot-State in hud.ts (altar.broken + gateOpen), (b) eine UX-
   Entscheidung, WANN der dritte Tracker erscheint (nach dem Delve-Quest?). Bewusst deferred.
4. **Tuning-Werte** (owner-facing): Brine-Kiln-Kosten (plank4/stone6/obsidian2), Boots
   (tideglass6/plank2/fiber2), Tide-Periode/Wade-Slow, Mirefang-Band — alle im Code, änderbar.

## Nächste Tickets
- Nach der Browser-Verifikation von T5: **T6** (Echowächter + Hushdark, Echoes-Mechanik) →
  **T7** (Verdant-Wächter + Grüne Terrassen). Der `activeBoss`/`wardenArenas`/`KIT_ART`/
  Refiner-Rahmen ist jetzt so gebaut, dass T6/T7 überwiegend Daten + Art + je eine zweite
  Arena/Distrikt-Anlage sind.

## Session-Learnings (Repo-relevant)
- NIE mehrzeilige `npx tsx -e` (hängt stumm) — Script-Datei.
- genmap-Arena-in-gepinnter-Zone geht byte-stabil NUR wenn: (a) Terrain NACH Node+Decor-Loops
  carven (Ground-Writes ändern pick-Ergebnis, nicht -Anzahl), (b) Footprint-Nodes via keptNodes
  evakuieren (IDs bleiben), (c) Decor per decorGid NACH den pick-Loops leeren (nie decor=null
  davor — das verschiebt den pick-Stream). Beweis-Skript: gepinnte Diffs == 0 außerhalb Footprint.
- Zweite Arena = zweiter dormant Boss-Sprite (nicht ein geteilter, der umzieht) — sonst
  verschwindet der andere Wächter im MP, während anderswo gekämpft wird. `activeBoss()`-Bundle
  gewählt per `activeWarden` ist das Muster.
