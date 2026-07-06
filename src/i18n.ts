/**
 * Internationalisation (i18n) for Jungle World.
 *
 * The Player picks a language in the settings; the choice is persisted and the
 * page reloads so every module — including the content tables that are built at
 * import time (items, node types, lore, avatar palettes) — is rebuilt in the new
 * language. That keeps call sites unchanged: `ITEMS[id].name`, `t.toast.…`, etc.
 * all read the language chosen for the session.
 *
 * This module must stay importable from node tools (like guardian.ts): every
 * browser access is guarded so `getLang()` resolves to 'en' outside a browser
 * instead of throwing. `setLang()` (the only thing that touches `location`) is
 * never called during import.
 */
export type Lang = 'en' | 'de';

const LANG_KEY = 'jungle-world:lang';

/** the saved choice, else the browser's preference, else English — node-safe */
function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'de' || saved === 'en') return saved;
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de')) return 'de';
  } catch {
    /* no localStorage (node/tests) — fall through to English */
  }
  return 'en';
}

let lang: Lang = detectLang();

export function getLang(): Lang {
  return lang;
}

/** persist the choice and reload so all import-time tables rebuild in `l` */
export function setLang(l: Lang): void {
  if (l === lang) return;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* storage unavailable — the reload below still applies the runtime choice */
  }
  lang = l;
  try {
    location.reload();
  } catch {
    /* not a browser — nothing to reload */
  }
}

/** pick the value for the current language (used by the content tables) */
export function pick<T>(en: T, de: T): T {
  return lang === 'de' ? de : en;
}

export const LANG_NAMES: Record<Lang, string> = { en: 'English', de: 'Deutsch' };

// ------------------------------------------------------------- zone display

/** English zone id (from world-data / code) → localized label shown in the HUD */
const ZONE_DE: Record<string, string> = {
  'North Quarry': 'Nördlicher Steinbruch',
  'South Quarry': 'Südlicher Steinbruch',
  'Spawn Clearing': 'Startlichtung',
  'Thundering Falls': 'Donnernde Wasserfälle',
  'Ancient Ruins': 'Uralte Ruinen',
  'Dense Grove': 'Dichter Hain',
  'Sunken Swamp': 'Versunkener Sumpf',
  'River Delta': 'Flussdelta',
  'Hidden Grove': 'Verborgener Hain',
  'Deep Jungle': 'Tiefer Dschungel',
  'The Delve': 'Der Schacht',
  'The Deep': 'Die Tiefe',
  'Jungle World': 'Dschungelwelt',
  'Ancient Tablet': 'Uralte Steintafel',
  // frontier zones (ADR-0009)
  'Highland Crags': 'Hochland-Klippen',
  'Highland Crags Summit': 'Gipfel der Hochland-Klippen',
  'Overgrown Temple': 'Überwucherter Tempel',
  'Mangrove Coast': 'Mangrovenküste',
  'The Cavern Mouth': 'Der Höhlenschlund',
};

/** translate a zone id for display; internal comparisons keep the English id */
export function zoneName(en: string): string {
  return lang === 'de' ? ZONE_DE[en] ?? en : en;
}

// ------------------------------------------------------------- UI strings

const en = {
  controlsHelp:
    'WASD/arrows move · E interact / left-click attack (hold to keep swinging) · X dismantle · C craft · I inventory · T chat · M mute · wheel zoom',
  online: (n: number) => `Online (${n})`,
  youSuffix: ' (you)',
  builtBy: (who: string, item: string) => `${who} built a ${item}`,

  settings: {
    title: '⚙ Settings',
    audio: 'Audio',
    language: 'Language',
    textSize: 'Text size',
    worldLabelSize: 'Name label size',
    muteAll: 'Mute all sound',
    close: 'Close',
    btnTitle: 'Settings',
  },

  volume: {
    master: '🔊 Master',
    ambience: '🌴 Jungle ambience',
    music: '🥁 Guardian drums',
    sfx: '🪓 Sound effects',
  },

  bottomBar: {
    craft: 'Craft [C]',
    inventory: 'Inventory [I]',
    muted: '🔇 Muted',
    sound: '🔊 Sound',
  },

  quest: {
    title:
      "Ancient tablets read · torn map pieces (3 reveal a treasure ✕ on the minimap) · the Seal's progress",
    digHint: ' — dig at the ✕!',
    sealOpen: '⛩ open',
  },

  seal: {
    title: '⛩ The Seal',
    hint: 'Stand close and press E to lay your Offerings.',
    broken: 'The Seal lies broken. The arena stands open, forever.',
  },

  village: {
    title: '🏛 The Village',
    hint: 'Stand by the Hall and press E to give resources & loot to the pool.',
    unfounded: 'Raise a Village Hall (Buildings tab) anywhere to found the Village.',
    tierName: (tier: number) => ['Wildland', 'Camp', 'Hamlet', 'Village', 'Town', 'Capital'][tier] ?? 'Village',
    tierTitle: (tier: number) => ['Wanderers', 'Settlers', 'Homesteaders', 'Villagers', 'Townsfolk', 'Citizens of the Capital'][tier] ?? '',
    poolLabel: 'Pool',
    milestoneDone: (name: string) => `✓ ${name} raised`,
    milestoneTodo: (name: string) => `○ Raise a ${name} in the zone`,
    capital: 'The grandest tier — decorate freely!',
  },

  villageGive: {
    title: '🏛 Give to the Village',
    shared: 'the shared pool',
    nothing: 'You carry nothing the pool accepts.',
    all: 'Max all',
    none: 'None',
    cancel: 'Cancel',
    give: 'Give',
    pts: (n: number) => `+${n}`,
    total: (n: number) => `Total: +${n} to the pool`,
  },

  fight: {
    title: '⚔ The Guardian',
    stirs: '⚔ The Guardian stirs',
    gatherParty: 'Gather your party, then STRIKE to begin the fight!',
    wardedParty: (n: number, names: string) => `Warded party (${n}): ${names}`,
    slumbersIn: (m: number, s: string) => `slumbers again in ${m}:${s}`,
    guardianHp: (hp: number, max: number) => `⚔ The Guardian · ${hp}/${max}`,
    bestedFloat: 'The Guardian is bested!',
    clang: 'clang',
  },

  buff: {
    swift: (m: number, s: string) => `💨 Swift +20% · ${m}:${s}`,
  },

  panels: {
    journey: '🌱 The Journey',
    intoDelve: '⛏ Into the Delve',
    crafting: 'Crafting',
    inventory: 'Inventory',
  },

  crate: {
    title: '📦 Supply Crate',
    shared: 'shared with everyone',
    inside: 'Inside',
    yourPack: 'Your pack',
    empty: 'empty',
    nothingToStore: 'nothing to store',
    take: 'Take',
    put: 'Put',
    close: 'Close',
  },

  sawmill: {
    title: '🪚 Sawmill',
    deposit: 'Deposit wood',
    collect: 'Collect planks',
    close: 'Close',
    milling: (wood: number) => `milling: ${wood} wood`,
    ready: (n: number) => `ready: ${n} plank${n === 1 ? '' : 's'}`,
    next: (s: number) => `next plank in ${s}s`,
  },

  sign: {
    title: '🪧 Signpost',
    placeholder: 'Write a short line...',
    place: 'Place',
    cancel: 'Cancel',
  },

  inv: {
    emptyGo: 'Empty — go harvest something! (E)',
    clickHint: 'Click an item for details · drag to arrange your pack.',
    place: 'Place',
    eat: 'Eat',
    loadoutBarTitle: 'Your Loadout — drag Tools here; press 1–3 to pick the one in your hand',
    slotHold: (name: string, i: number) => `${name} — press ${i} to hold it`,
    slotEmpty: (i: number) => `Loadout slot ${i} — drag a Tool here, press ${i} to select`,
    minimapTitle: 'Minimap — white: you, yellow: others',
  },

  recipe: {
    // one recipe card's hover tooltip: name, kind, description, cost and stats
    tooltip: (name: string, kind: string, desc: string, cost: string, stats: string) =>
      `${name} (${kind})\n${desc}\nCost: ${cost}${stats}`,
    needsTool: (name: string) => `needs ${name}`,
    kindTool: 'tool',
    kindBuilding: 'building',
    kindProp: 'prop',
    kindConsumable: 'consumable',
    // craft-panel tabs (structures split into Buildings ≥2×2 vs 1×1 Props)
    tabTool: 'Tools & Weapons',
    tabBuilding: 'Buildings',
    tabProp: 'Props',
    tabConsumable: 'Consumables',
    ingToolTip: (name: string, have: number) => `needs ${name} in your pack (not consumed) — you have ${have}`,
    ingTip: (name: string, count: number, have: number) => `${name} — need ${count}, you have ${have}`,
  },

  chat: {
    placeholder: 'Press T to chat...',
  },

  hint: {
    read: 'E — read',
    gather: 'E — gather',
    place: 'E place · Esc cancel',
  },

  join: {
    subtitle: 'one persistent jungle · gather, craft, build',
    playerName: 'Player name',
    namePlaceholder: 'e.g. Robin',
    pinLabel: '4-digit PIN (to reclaim your Player anywhere)',
    enter: 'Enter the Jungle',
    slotSkin: 'Skin',
    slotHair: 'Hair',
    slotShirt: 'Shirt',
    slotPants: 'Pants',
    errWrongPin: 'That name is taken and the PIN does not match.',
    errBadPin: 'PIN must be exactly 4 digits.',
    errBadName: 'Name must be 2–16 letters/numbers.',
  },

  intro: {
    hint: 'click or press Enter to begin',
  },

  boot: {
    loading: (pct: number) => `Loading jungle... ${pct}%`,
  },

  lore: {
    tabletFallbackTitle: 'Ancient Tablet',
    tabletFallbackText: 'The runes have faded beyond reading.',
  },

  weapon: {
    dmg: 'dmg',
    crit: 'crit',
    noCrit: 'no crit',
    dps: 'DPS',
  },

  toast: {
    sealBroken: '⚡ The Seal is broken — the arena stands open, forever!',
    guardianBested: '🏆 The Guardian sinks into slumber — every fighter earns its Scales!',
    guardianUnbeaten: 'The Guardian returns to slumber, unbeaten. The totem is spent.',
    knockedDown: (n: number) => `Knocked down! (${n}/3 — the third means Exhaustion)`,
    exhaustionHammock:
      'Exhaustion overtakes you — out for this fight, waking in your Hammock. Prior hits still count.',
    exhaustionSpawn:
      'Exhaustion overtakes you — out for this fight, waking at the spawn. Prior hits still count.',
    guardianSlumbersLay: 'The Guardian slumbers. Lay a Summoning Totem upon the altar to wake it.',
    guardianAlreadyAwake: 'The Guardian is already awake!',
    altarAwaitsTotem: 'The altar awaits a Summoning Totem (5 wood · 3 fiber · 2 fruit).',
    fightAlreadyRaging: 'A fight is already raging — join it!',
    needTotem: 'You need a Summoning Totem.',
    sealStillHolds: 'The Seal still holds.',
    sealBrokenArenaOpen: 'The Seal lies broken — the arena stands open.',
    laidOfferings: 'You lay your Offerings upon the Seal.',
    offerNothingNeeded:
      'The Seal asks for wood, stone, fiber and fruit — you carry nothing it still needs.',
    journeyComplete: '🌱 Your Journey is complete — the jungle is yours!',
    castLine: 'You cast your line... wait for the "!"',
    reelTooSoon: 'You reel in too soon — nothing on the hook.',
    fishTooLate: 'Too late — someone else landed it. It will return.',
    cookFish: 'You cook a fish over the fire. (Eat it from your inventory.)',
    crafted: (name: string) => `Crafted ${name}!`,
    notEnoughResources: 'Not enough resources.',
    missingTool: 'You are missing the required tool.',
    crateGone: 'Someone was quicker — the crate no longer holds that.',
    millFullOrNoWood: 'The mill is full or you carry no wood.',
    noPlankYet: 'No plank is finished yet — the mill works slowly.',
    collectPlanks: 'You collect the finished planks.',
    warmHearty: 'Warm and hearty — your step quickens! (+20% speed)',
    hostLeftCollapse: 'The host left — the Delve collapses around you. No loot.',
    groveOpen: 'The grove already stands open.',
    offeringAccepted: 'The offering is accepted — the vines part!',
    altarAsks2: 'The altar asks for 2 fruit and 2 fiber.',
    unearthedTreasure: 'You unearthed a buried treasure!',
    digCloser: 'Dig closer to the ✕.',
    needToolFor: (name: string) => `You need a ${name} for that.`,
    yieldTaken: 'Too late — someone else took the yield. It will regrow.',
    packFull: 'Your pack is full — it stays in the world. Make room, or found/grow the Village for more slots.',
    placing: (name: string) => `Placing ${name} — face a tile and press Enter`,
    tooFarDrop: 'Too far to reach — step closer to drop it there.',
    bridgesOnWater: 'Bridges must be placed on water.',
    cantBuildTile: "Can't build there — the ground won't take it.",
    blockedByNode: (name: string) => `${name} is in the way — the whole footprint must be clear.`,
    placed: (name: string) => `${name} placed!`,
    hammockSet: 'Your Hammock is set — Exhaustion and login bring you here.',
    villageFoundedYou: 'You found the Village — this is home now. Everyone without a Hammock wakes here.',
    villageContributed: (pts: number) => `You give to the Village — +${pts} to the pool!`,
    villageNothingToGive: 'You carry nothing the Village pool accepts.',
    hallAlreadyStands: 'A Hall already stands — dismantle it to re-found the Village elsewhere.',
    alreadyBuiltHere: 'Someone already built here — first placement wins. Item kept.',
    dismantled: (name: string, gained: string) => `${name} dismantled — ${gained}`,
    dismantledBare: (name: string) => `${name} dismantled.`,
    dismantleConfirm: (who: string, name: string) => `Press X again to dismantle ${who}'s ${name} (full refund to you).`,
    vistaRevealed: (zone: string) => `From the ${zone} vista the surrounding lands come into view.`,
    shaftSealed: 'The shaft is sealed by rubble — an Ancient Pickaxe could break it.',
    rubbleCollapses: 'The rubble collapses — the Delve lies open!',
    descendWithOthers: (n: number) => `You descend into the Delve with ${n} other${n === 1 ? '' : 's'}...`,
    descendAlone: 'You descend alone into the Delve...',
    followInto: (host: string) => `You follow ${host} into the Delve...`,
    climbOut: 'You climb back out of the Delve.',
    delveClearedNoHit: 'The Delve is cleared — but you landed no hit, so no loot.',
    deepGuardianFalls: (parts: string) => `The Deep Guardian falls! ${parts}`,
    exhaustionDelveHost: 'Exhaustion takes the host — the Delve collapses. (No host migration in v1.)',
    exhaustionDelveYou:
      'Exhaustion takes you — out of the Delve. Any hits you landed still count if the party wins.',
    knockedInDelve: (n: number, max: number) => `Knocked down in the Delve! (${n}/${max})`,
    partyOverwhelmed: 'The party is overwhelmed — the Delve resets. No loot.',
    mealFades: 'The warmth of the meal fades.',
    // ADR-0011 — the Deep (Stage 2)
    deepDoorOpens:
      'A hidden door grinds open in the far wall — press E there to descend into the Deep, or leave with your Stage-1 loot.',
    descendIntoDeep: (n: number) => `You descend into the Deep with ${n} other${n === 1 ? '' : 's'}...`,
    descendIntoDeepAlone: 'You descend alone into the Deep...',
    followIntoDeep: (host: string) => `You follow ${host} into the Deep...`,
    forgebornFalls: (parts: string) => `The Forgeborn falls! ${parts}`,
    deepClearedNoHit: 'The Deep is cleared — but you landed no hit, so no loot.',
    deepHostLeftCollapse: 'The host left — the Deep collapses around you. No Deep loot (your Stage-1 haul is safe).',
    deepPartyOverwhelmed: 'The party is overwhelmed — the Deep resets. No Deep loot (your Stage-1 haul is safe).',
    exhaustionDeepHost: 'Exhaustion takes the host — the Deep collapses. (No host migration in v1.)',
    exhaustionDeepYou:
      'Exhaustion takes you — out of the Deep. Any hits you landed still count if the party wins.',
    knockedInDeep: (n: number, max: number) => `Knocked down in the Deep! (${n}/${max})`,
    // ADR-0012 — open-world Wildlife
    cookMeat: 'You roast the meat over the fire. (Eat it from your inventory.)',
    foraged: (parts: string) => `You forage the wildlife — ${parts}.`,
    hunted: (parts: string) => `Felled! ${parts}.`,
    knockedInWild: (n: number, max: number) => `A predator knocks you down! (${n}/${max} — the third means Exhaustion)`,
    wildExhaustionHammock: 'Exhaustion overtakes you in the wilds — you wake in your Hammock, pack fully intact.',
    wildExhaustionSpawn: 'Exhaustion overtakes you in the wilds — you wake at the spawn, pack fully intact.',
  },

  delve: {
    descend: 'The Delve · press E to descend',
    sealed: 'Sealed rubble · an Ancient Pickaxe could clear it',
    leave: '⇱ leave',
    descendDeep: 'A door to the Deep · press E to descend',
  },

  // shared-world chat narration broadcast by the backend as "🌿 Jungle"
  system: {
    sender: '🌿 Jungle',
    tabletsAllRead: (who: string) => `${who} has read all the ancient tablets!`,
    groveOpened: (who: string) => `the vines part — ${who} has opened the Hidden Grove!`,
    treasureUnearthed: (who: string) => `${who} unearthed a buried treasure!`,
    sealWeakens: (pct: number) => `the Seal weakens — ${pct}% of the offerings are gathered!`,
    sealBroken:
      '⚡ THE SEAL IS BROKEN! The arena at the Ruins stands open — the Guardian awaits whoever dares bring an Offering to its altar.',
    guardianNoStrike: 'no one struck in time — the Guardian loses interest and sinks back into slumber. The totem is spent.',
    guardianUnbeaten: 'the Guardian returns to slumber, unbeaten. The arena falls silent — another Offering will wake it.',
    guardianStirs: (who: string) => `${who} laid an Offering on the altar — the Guardian STIRS! Gather at the arena and strike to begin.`,
    delveOpened: (who: string) => `the rubble gives way — ${who} has opened the Delve! A cold draught rises from the shaft.`,
    guardianBested: (who: string, scales: number) =>
      `🏆 THE GUARDIAN IS BESTED! ${who} carried the day — ${scales} Guardian Scales to every fighter. It sinks back into slumber.`,
    villageFounded: (who: string) => `🏛 ${who} founded the Village! Everyone without a Hammock now wakes at the Hall.`,
    villageGrew: (name: string) => `🏛 the Village has grown into a ${name}!`,
    exhaustionCollapse: (who: string, atHammock: boolean) =>
      `${who} collapses from Exhaustion — out for this fight, waking ${atHammock ? 'in their Hammock' : 'at the spawn'}. Hits already landed still count toward the loot.`,
  },

  // simulated party-mate chatter in the local single-player (Mock) backend
  botChatter: {
    Kiki: [
      'the waterfall is thundering today',
      'found a juicy fruit bush near the delta',
      'anyone seen the hidden grove?',
      'chopping some wood, brb',
      'these vines are impossible without a machete',
      'meet me at the ruins!',
    ],
    Bruno: [
      'the swamp smells... interesting',
      'stacking stones like a pro',
      'gonna build a hut wall around camp later',
      'watch out, I take the last hit >:)',
      'this jungle heals fast',
      'who put a crate in the river delta?',
    ],
  },
};

type Strings = typeof en;

const de: Strings = {
  controlsHelp:
    'WASD/Pfeile bewegen · E interagieren / Linksklick angreifen (halten zum Weiterschlagen) · X abbauen · C herstellen · I Inventar · T Chat · M stumm · Rad zoomen',
  online: (n) => `Online (${n})`,
  youSuffix: ' (du)',
  builtBy: (who, item) => `${who} hat ${item} gebaut`,

  settings: {
    title: '⚙ Einstellungen',
    audio: 'Audio',
    language: 'Sprache',
    textSize: 'Textgröße',
    worldLabelSize: 'Namensschild-Größe',
    muteAll: 'Alle Geräusche stumm',
    close: 'Schließen',
    btnTitle: 'Einstellungen',
  },

  volume: {
    master: '🔊 Gesamt',
    ambience: '🌴 Dschungel-Atmosphäre',
    music: '🥁 Wächtertrommeln',
    sfx: '🪓 Soundeffekte',
  },

  bottomBar: {
    craft: 'Herstellen [C]',
    inventory: 'Inventar [I]',
    muted: '🔇 Stumm',
    sound: '🔊 Ton',
  },

  quest: {
    title:
      'Gelesene Steintafeln · zerrissene Kartenfetzen (3 zeigen ein Schatz-✕ auf der Minikarte) · der Fortschritt des Siegels',
    digHint: ' — grabe am ✕!',
    sealOpen: '⛩ offen',
  },

  seal: {
    title: '⛩ Das Siegel',
    hint: 'Stell dich nah heran und drücke E, um deine Opfergaben darzubringen.',
    broken: 'Das Siegel ist gebrochen. Die Arena steht offen, für immer.',
  },

  village: {
    title: '🏛 Das Dorf',
    hint: 'Stell dich zur Halle und drücke E, um Ressourcen & Beute in den Vorrat zu geben.',
    unfounded: 'Errichte irgendwo eine Dorfhalle (Reiter Gebäude), um das Dorf zu gründen.',
    tierName: (tier: number) => ['Wildnis', 'Lager', 'Weiler', 'Dorf', 'Stadt', 'Hauptstadt'][tier] ?? 'Dorf',
    tierTitle: (tier: number) => ['Wanderer', 'Siedler', 'Gehöftler', 'Dörfler', 'Städter', 'Bürger der Hauptstadt'][tier] ?? '',
    poolLabel: 'Vorrat',
    milestoneDone: (name: string) => `✓ ${name} errichtet`,
    milestoneTodo: (name: string) => `○ Errichte ${name} in der Zone`,
    capital: 'Die höchste Stufe — schmücke nach Herzenslust!',
  },

  villageGive: {
    title: '🏛 Dem Dorf geben',
    shared: 'der geteilte Vorrat',
    nothing: 'Du trägst nichts, was der Vorrat annimmt.',
    all: 'Alles',
    none: 'Nichts',
    cancel: 'Abbrechen',
    give: 'Geben',
    pts: (n: number) => `+${n}`,
    total: (n: number) => `Gesamt: +${n} für den Vorrat`,
  },

  fight: {
    title: '⚔ Der Wächter',
    stirs: '⚔ Der Wächter regt sich',
    gatherParty: 'Sammle deine Gruppe, dann SCHLAG ZU, um den Kampf zu beginnen!',
    wardedParty: (n, names) => `Gebannte Gruppe (${n}): ${names}`,
    slumbersIn: (m, s) => `schlummert wieder in ${m}:${s}`,
    guardianHp: (hp, max) => `⚔ Der Wächter · ${hp}/${max}`,
    bestedFloat: 'Der Wächter ist bezwungen!',
    clang: 'kling',
  },

  buff: {
    swift: (m, s) => `💨 Flink +20% · ${m}:${s}`,
  },

  panels: {
    journey: '🌱 Die Reise',
    intoDelve: '⛏ In den Schacht',
    crafting: 'Herstellung',
    inventory: 'Inventar',
  },

  crate: {
    title: '📦 Vorratskiste',
    shared: 'für alle geteilt',
    inside: 'Inhalt',
    yourPack: 'Dein Rucksack',
    empty: 'leer',
    nothingToStore: 'nichts zum Verstauen',
    take: 'Nehmen',
    put: 'Ablegen',
    close: 'Schließen',
  },

  sawmill: {
    title: '🪚 Sägewerk',
    deposit: 'Holz einlegen',
    collect: 'Bretter holen',
    close: 'Schließen',
    milling: (wood) => `sägt: ${wood} Holz`,
    ready: (n) => `fertig: ${n} Brett${n === 1 ? '' : 'er'}`,
    next: (s) => `nächstes Brett in ${s}s`,
  },

  sign: {
    title: '🪧 Wegweiser',
    placeholder: 'Schreib eine kurze Zeile...',
    place: 'Aufstellen',
    cancel: 'Abbrechen',
  },

  inv: {
    emptyGo: 'Leer — geh und ernte etwas! (E)',
    clickHint: 'Klick ein Item für Details · zieh, um deinen Rucksack zu ordnen.',
    place: 'Platzieren',
    eat: 'Essen',
    loadoutBarTitle: 'Deine Ausrüstung — zieh Werkzeuge hierher; drücke 1–3, um eines in die Hand zu nehmen',
    slotHold: (name, i) => `${name} — drücke ${i}, um es in die Hand zu nehmen`,
    slotEmpty: (i) => `Ausrüstungsplatz ${i} — zieh ein Werkzeug hierher, drücke ${i} zum Auswählen`,
    minimapTitle: 'Minikarte — weiß: du, gelb: andere',
  },

  recipe: {
    tooltip: (name, kind, desc, cost, stats) => `${name} (${kind})\n${desc}\nKosten: ${cost}${stats}`,
    needsTool: (name) => `benötigt ${name}`,
    kindTool: 'Werkzeug',
    kindBuilding: 'Gebäude',
    kindProp: 'Deko',
    kindConsumable: 'Verbrauchsgut',
    tabTool: 'Werkzeuge & Waffen',
    tabBuilding: 'Gebäude',
    tabProp: 'Deko',
    tabConsumable: 'Verbrauchsgüter',
    ingToolTip: (name, have) => `benötigt ${name} im Rucksack (wird nicht verbraucht) — du hast ${have}`,
    ingTip: (name, count, have) => `${name} — benötigt ${count}, du hast ${have}`,
  },

  chat: {
    placeholder: 'Drücke T zum Chatten...',
  },

  hint: {
    read: 'E — lesen',
    gather: 'E — ernten',
    place: 'E platzieren · Esc abbrechen',
  },

  join: {
    subtitle: 'ein beständiger Dschungel · sammeln, herstellen, bauen',
    playerName: 'Spielername',
    namePlaceholder: 'z. B. Robin',
    pinLabel: '4-stellige PIN (um deinen Spieler überall zurückzuholen)',
    enter: 'Betritt den Dschungel',
    slotSkin: 'Haut',
    slotHair: 'Haare',
    slotShirt: 'Hemd',
    slotPants: 'Hose',
    errWrongPin: 'Der Name ist vergeben und die PIN stimmt nicht.',
    errBadPin: 'Die PIN muss genau 4 Ziffern haben.',
    errBadName: 'Der Name muss 2–16 Buchstaben/Zahlen haben.',
  },

  intro: {
    hint: 'klicke oder drücke Enter, um zu beginnen',
  },

  boot: {
    loading: (pct) => `Dschungel wird geladen... ${pct}%`,
  },

  lore: {
    tabletFallbackTitle: 'Uralte Steintafel',
    tabletFallbackText: 'Die Runen sind bis zur Unlesbarkeit verblasst.',
  },

  weapon: {
    dmg: 'Schaden',
    crit: 'Krit',
    noCrit: 'kein Krit',
    dps: 'DPS',
  },

  toast: {
    sealBroken: '⚡ Das Siegel ist gebrochen — die Arena steht offen, für immer!',
    guardianBested: '🏆 Der Wächter sinkt in den Schlummer — jeder Kämpfer erhält seine Schuppen!',
    guardianUnbeaten: 'Der Wächter kehrt in den Schlummer zurück, unbesiegt. Das Totem ist verbraucht.',
    knockedDown: (n) => `Niedergeschlagen! (${n}/3 — der dritte bedeutet Erschöpfung)`,
    exhaustionHammock:
      'Erschöpfung übermannt dich — raus aus diesem Kampf, du erwachst in deiner Hängematte. Frühere Treffer zählen weiter.',
    exhaustionSpawn:
      'Erschöpfung übermannt dich — raus aus diesem Kampf, du erwachst am Startpunkt. Frühere Treffer zählen weiter.',
    guardianSlumbersLay: 'Der Wächter schlummert. Lege ein Beschwörungstotem auf den Altar, um ihn zu wecken.',
    guardianAlreadyAwake: 'Der Wächter ist bereits erwacht!',
    altarAwaitsTotem: 'Der Altar wartet auf ein Beschwörungstotem (5 Holz · 3 Fasern · 2 Frucht).',
    fightAlreadyRaging: 'Ein Kampf tobt bereits — schließ dich an!',
    needTotem: 'Du brauchst ein Beschwörungstotem.',
    sealStillHolds: 'Das Siegel hält noch.',
    sealBrokenArenaOpen: 'Das Siegel ist gebrochen — die Arena steht offen.',
    laidOfferings: 'Du legst deine Opfergaben auf das Siegel.',
    offerNothingNeeded:
      'Das Siegel verlangt Holz, Stein, Fasern und Frucht — du trägst nichts, was es noch braucht.',
    journeyComplete: '🌱 Deine Reise ist vollendet — der Dschungel gehört dir!',
    castLine: 'Du wirfst deine Leine aus... warte auf das „!“',
    reelTooSoon: 'Du holst zu früh ein — nichts am Haken.',
    fishTooLate: 'Zu spät — jemand anderes hat ihn gelandet. Er kehrt zurück.',
    cookFish: 'Du brätst einen Fisch über dem Feuer. (Iss ihn aus deinem Inventar.)',
    crafted: (name) => `${name} hergestellt!`,
    notEnoughResources: 'Nicht genug Ressourcen.',
    missingTool: 'Dir fehlt das benötigte Werkzeug.',
    crateGone: 'Jemand war schneller — die Kiste enthält das nicht mehr.',
    millFullOrNoWood: 'Das Werk ist voll oder du trägst kein Holz.',
    noPlankYet: 'Noch kein Brett fertig — das Werk arbeitet langsam.',
    collectPlanks: 'Du sammelst die fertigen Bretter ein.',
    warmHearty: 'Warm und herzhaft — dein Schritt wird schneller! (+20% Tempo)',
    hostLeftCollapse: 'Der Host ist gegangen — der Schacht stürzt um dich herum ein. Keine Beute.',
    groveOpen: 'Der Hain steht bereits offen.',
    offeringAccepted: 'Die Opfergabe wird angenommen — die Ranken teilen sich!',
    altarAsks2: 'Der Altar verlangt 2 Frucht und 2 Fasern.',
    unearthedTreasure: 'Du hast einen vergrabenen Schatz ausgegraben!',
    digCloser: 'Grabe näher am ✕.',
    needToolFor: (name) => `Dafür brauchst du ${name}.`,
    yieldTaken: 'Zu spät — jemand anderes hat den Ertrag genommen. Es wächst nach.',
    packFull: 'Dein Rucksack ist voll — es bleibt in der Welt. Schaff Platz oder gründe/vergrößere das Dorf für mehr Slots.',
    placing: (name) => `${name} wird platziert — blick auf ein Feld und drücke Enter`,
    tooFarDrop: 'Zu weit weg — geh näher heran, um es dort abzulegen.',
    bridgesOnWater: 'Brücken müssen auf Wasser platziert werden.',
    cantBuildTile: 'Hier lässt sich nicht bauen — der Boden trägt es nicht.',
    blockedByNode: (name) => `${name} ist im Weg — die ganze Grundfläche muss frei sein.`,
    placed: (name) => `${name} platziert!`,
    hammockSet: 'Deine Hängematte steht — Erschöpfung und Anmeldung bringen dich hierher.',
    villageFoundedYou: 'Du hast das Dorf gegründet — jetzt ist hier Heimat. Jeder ohne Hängematte erwacht hier.',
    villageContributed: (pts: number) => `Du gibst dem Dorf — +${pts} für den Vorrat!`,
    villageNothingToGive: 'Du trägst nichts, was der Dorfvorrat annimmt.',
    hallAlreadyStands: 'Eine Halle steht bereits — bau sie ab, um das Dorf woanders neu zu gründen.',
    alreadyBuiltHere: 'Hier hat schon jemand gebaut — die erste Platzierung gewinnt. Item behalten.',
    dismantled: (name, gained) => `${name} abgebaut — ${gained}`,
    dismantledBare: (name) => `${name} abgebaut.`,
    dismantleConfirm: (who, name) => `Drücke erneut X, um ${who}s ${name} abzubauen (volle Erstattung an dich).`,
    vistaRevealed: (zone) => `Vom Aussichtspunkt ${zone} kommt das umliegende Land in Sicht.`,
    shaftSealed: 'Der Schacht ist von Geröll versiegelt — eine Uralte Spitzhacke könnte es aufbrechen.',
    rubbleCollapses: 'Das Geröll bricht zusammen — der Schacht liegt offen!',
    descendWithOthers: (n) => `Du steigst mit ${n} ${n === 1 ? 'anderen' : 'anderen'} in den Schacht hinab...`,
    descendAlone: 'Du steigst allein in den Schacht hinab...',
    followInto: (host) => `Du folgst ${host} in den Schacht...`,
    climbOut: 'Du kletterst wieder aus dem Schacht heraus.',
    delveClearedNoHit: 'Der Schacht ist bezwungen — doch du hast keinen Treffer gelandet, also keine Beute.',
    deepGuardianFalls: (parts) => `Der Tiefenwächter fällt! ${parts}`,
    exhaustionDelveHost: 'Erschöpfung übermannt den Host — der Schacht stürzt ein. (Kein Host-Wechsel in v1.)',
    exhaustionDelveYou:
      'Erschöpfung übermannt dich — raus aus dem Schacht. Deine gelandeten Treffer zählen weiter, wenn die Gruppe gewinnt.',
    knockedInDelve: (n, max) => `Im Schacht niedergeschlagen! (${n}/${max})`,
    partyOverwhelmed: 'Die Gruppe ist überwältigt — der Schacht setzt sich zurück. Keine Beute.',
    mealFades: 'Die Wärme der Mahlzeit verfliegt.',
    // ADR-0011 — die Tiefe (Stufe 2)
    deepDoorOpens:
      'Eine verborgene Tür knirscht in der fernen Wand auf — drücke dort E, um in die Tiefe hinabzusteigen, oder geh mit deiner Stufe-1-Beute.',
    descendIntoDeep: (n) => `Du steigst mit ${n} ${n === 1 ? 'weiteren' : 'weiteren'} in die Tiefe hinab...`,
    descendIntoDeepAlone: 'Du steigst allein in die Tiefe hinab...',
    followIntoDeep: (host) => `Du folgst ${host} in die Tiefe...`,
    forgebornFalls: (parts) => `Der Schmiedegeborene fällt! ${parts}`,
    deepClearedNoHit: 'Die Tiefe ist bezwungen — doch du hast keinen Treffer gelandet, also keine Beute.',
    deepHostLeftCollapse: 'Der Host ist gegangen — die Tiefe stürzt um dich herum ein. Keine Tiefen-Beute (deine Stufe-1-Ausbeute ist sicher).',
    deepPartyOverwhelmed: 'Die Gruppe ist überwältigt — die Tiefe setzt sich zurück. Keine Tiefen-Beute (deine Stufe-1-Ausbeute ist sicher).',
    exhaustionDeepHost: 'Erschöpfung übermannt den Host — die Tiefe stürzt ein. (Kein Host-Wechsel in v1.)',
    exhaustionDeepYou:
      'Erschöpfung übermannt dich — raus aus der Tiefe. Deine gelandeten Treffer zählen weiter, wenn die Gruppe gewinnt.',
    knockedInDeep: (n, max) => `In der Tiefe niedergeschlagen! (${n}/${max})`,
    // ADR-0012 — Wildnis
    cookMeat: 'Du röstest das Fleisch über dem Feuer. (Iss es aus deinem Inventar.)',
    foraged: (parts) => `Du sammelst vom Wild — ${parts}.`,
    hunted: (parts) => `Erlegt! ${parts}.`,
    knockedInWild: (n, max) => `Ein Raubtier schlägt dich nieder! (${n}/${max} — der dritte bedeutet Erschöpfung)`,
    wildExhaustionHammock: 'Erschöpfung übermannt dich in der Wildnis — du erwachst in deiner Hängematte, Rucksack unversehrt.',
    wildExhaustionSpawn: 'Erschöpfung übermannt dich in der Wildnis — du erwachst am Startpunkt, Rucksack unversehrt.',
  },

  delve: {
    descend: 'Der Schacht · drücke E zum Hinabsteigen',
    sealed: 'Versiegeltes Geröll · eine Uralte Spitzhacke könnte es räumen',
    leave: '⇱ verlassen',
    descendDeep: 'Eine Tür zur Tiefe · drücke E zum Hinabsteigen',
  },

  system: {
    sender: '🌿 Dschungel',
    tabletsAllRead: (who) => `${who} hat alle uralten Steintafeln gelesen!`,
    groveOpened: (who) => `die Ranken teilen sich — ${who} hat den Verborgenen Hain geöffnet!`,
    treasureUnearthed: (who) => `${who} hat einen vergrabenen Schatz ausgegraben!`,
    sealWeakens: (pct) => `das Siegel schwächt sich — ${pct}% der Opfergaben sind gesammelt!`,
    sealBroken:
      '⚡ DAS SIEGEL IST GEBROCHEN! Die Arena bei den Ruinen steht offen — der Wächter erwartet jeden, der es wagt, eine Opfergabe auf seinen Altar zu bringen.',
    guardianNoStrike: 'niemand schlug rechtzeitig zu — der Wächter verliert das Interesse und sinkt zurück in den Schlummer. Das Totem ist verbraucht.',
    guardianUnbeaten: 'der Wächter kehrt in den Schlummer zurück, unbesiegt. Die Arena verstummt — eine weitere Opfergabe wird ihn wecken.',
    guardianStirs: (who) => `${who} legte eine Opfergabe auf den Altar — der Wächter REGT SICH! Sammelt euch an der Arena und schlagt zu, um zu beginnen.`,
    delveOpened: (who) => `das Geröll gibt nach — ${who} hat den Schacht geöffnet! Ein kalter Luftzug steigt aus der Tiefe auf.`,
    guardianBested: (who, scales) =>
      `🏆 DER WÄCHTER IST BEZWUNGEN! ${who} haben den Sieg errungen — ${scales} Wächterschuppen für jeden Kämpfer. Er sinkt zurück in den Schlummer.`,
    villageFounded: (who: string) => `🏛 ${who} hat das Dorf gegründet! Jeder ohne Hängematte erwacht nun an der Halle.`,
    villageGrew: (name: string) => `🏛 das Dorf ist zu ${name} herangewachsen!`,
    exhaustionCollapse: (who, atHammock) =>
      `${who} bricht vor Erschöpfung zusammen — raus aus diesem Kampf, erwacht ${atHammock ? 'in der Hängematte' : 'am Startpunkt'}. Bereits gelandete Treffer zählen weiter zur Beute.`,
  },

  botChatter: {
    Kiki: [
      'der Wasserfall donnert heute richtig',
      'hab einen saftigen Obststrauch beim Delta gefunden',
      'hat jemand den verborgenen Hain gesehen?',
      'hacke etwas Holz, bin gleich zurück',
      'diese Ranken sind ohne Machete unmöglich',
      'treffen wir uns bei den Ruinen!',
    ],
    Bruno: [
      'der Sumpf riecht... interessant',
      'stapel Steine wie ein Profi',
      'bau später eine Hüttenwand ums Lager',
      'pass auf, ich hol mir den letzten Treffer >:)',
      'dieser Dschungel heilt schnell',
      'wer hat eine Kiste ins Flussdelta gestellt?',
    ],
  },
};

/** the resolved string table for the session's language */
export const t: Strings = pick(en, de);
