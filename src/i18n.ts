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
  // Realm districts (ADR-0017)
  'The Sunken Mire': 'Das Versunkene Moor',
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
    // ADR-0015 — the one-line Depth Record teaser on the Hall panel
    record: (depth: number, names: string) => `🗿 Deepest Descent: Depth ${depth} — ${names}`,
    recordNone: '🗿 No Descent recorded yet — the Delve awaits.',
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

  trade: {
    title: '🛖 Trade Post',
    give: 'Give',
    get: 'Get',
    max: 'Max',
    cancel: 'Cancel',
    confirm: 'Trade',
    rate: (cost: number, giveName: string, getName: string) => `Rate: ${cost} ${giveName} → 1 ${getName}`,
    youGet: (n: number, name: string) => `→ you get ${n} ${name}`,
    needAtLeast: (cost: number, giveName: string, getName: string) =>
      `Give at least ${cost} ${giveName} for 1 ${getName}.`,
    nothing: 'Not enough for a whole unit.',
  },

  fountain: {
    title: '⛲ Wishing Well',
    progress: (have: number, need: number) => `Wishes: ${have} / ${need} fruit`,
    festival: '🎉 A festival is under way!',
    have: (n: number) => `you have ${n}`,
    amount: 'Toss',
    toss: 'Toss in',
    cancel: 'Close',
    badge: (m: number, s: string) => `🎉 Festival ${m}:${s}`,
  },

  vname: {
    title: '🚩 Name the Village',
    placeholder: 'A name…',
    cancel: 'Cancel',
    save: 'Save',
  },

  chron: {
    title: '📖 Village Chronicle',
    placeholder: 'Add a line…',
    close: 'Close',
    add: 'Add',
    empty: 'The chronicle is empty.',
    became: (name: string) => `— the Village reached “${name}”`,
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
    // ADR-0017 — a Warden fight re-titles the same panel (fight.warden names it)
    wardenStirs: (name: string) => `⚔ ${name} stirs`,
    wardenHp: (name: string, hp: number, max: number) => `⚔ ${name} · ${hp}/${max}`,
    wardenBestedFloat: (name: string) => `${name} is bested!`,
    furyRestless: 'The colossus grows restless — the runes burn hotter!',
    furyFury: 'FURY — the runes blaze red!',
  },

  // ADR-0017 — the Warden ladder's display names (ids stay english-internal)
  warden: {
    name: (id: string) => (({ mire: 'the Mire Warden', echo: 'the Echo Warden', reverb: 'the Reverberant' }) as Record<string, string>)[id] ?? id,
    realmName: (id: string) => (({ mire: 'the Sunken Mire', echo: 'the Hushdark' }) as Record<string, string>)[id] ?? id,
  },

  // ADR-0017 — a Warden altar's Offering-bars panel (the Seal panel, per rung)
  wardenAltar: {
    title: (name: string) => `⚑ The altar of ${name}`,
    hint: 'Lay the demanded goods here (E at the altar) — the Offering is communal and breaks once, forever.',
    broken: 'The Offering is complete — a Warden Totem wakes it.',
  },

  // the WoW-style character panel: paperdoll slots + derived attributes (ADR-0017 §4)
  character: {
    title: 'Character',
    bag: 'Bag',
    slot: { helm: 'Helm', chest: 'Chest', boots: 'Boots', weapon: 'Weapon' },
    slotIcon: { helm: '🪖', chest: '🛡', boots: '👢', weapon: '⚔' },
    emptySlot: (name: string) => `${name} slot — drag ${name} here`,
    unequipHint: 'click to unequip',
    attrMove: 'Move speed',
    attrAttack: 'Attack speed',
    attrDamage: 'Damage',
    attrCrit: 'Crit',
    attrDps: 'DPS',
    attrWeapon: 'Weapon',
    noWeapon: 'bare hands',
  },

  buff: {
    swift: (m: number, s: string) => `💨 Swift +20% · ${m}:${s}`,
  },

  panels: {
    journey: '🌱 The Journey',
    intoDelve: '⛏ Into the Delve',
    crafting: 'Crafting',
    inventory: 'Inventory',
    toggle: 'Collapse / expand',
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

  // the boss Spoils window: a read-only loot bag you take drops out of (every boss)
  loot: {
    title: '💰 Spoils',
    fromGuardian: 'from the Guardian',
    fromDeepGuardian: 'from the Deep Guardian',
    fromForgeborn: 'from the Forgeborn',
    fromDepthBoss: (boss: string) => `from ${boss}`,
    fromWarden: (name: string) => `from ${name}`,
    hint: 'Click an item to take it into your pack',
    take: 'Take',
    takeAll: 'Take all',
    empty: 'all claimed',
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

  // the generic Refiner panel (ADR-0017 §6): one skeleton for every Refiner
  // family — the station name and item names arrive as parameters
  refiner: {
    title: (name: string) => `⚗️ ${name}`,
    deposit: (item: string) => `Deposit ${item}`,
    collect: (item: string) => `Collect ${item}`,
    close: 'Close',
    refining: (n: number, item: string) => `refining: ${n} ${item}`,
    ready: (n: number, item: string) => `ready: ${n} ${item}`,
    next: (s: number, item: string) => `next ${item} in ${s}s`,
    /** the ?refinertest dev station's display name */
    testName: 'Test Refiner',
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
    // kind subtitle on the hover popup for non-weapon items
    kind: { resource: 'Resource', tool: 'Tool', structure: 'Structure', consumable: 'Consumable', food: 'Food', armor: 'Armor' },
    equip: 'Equip',
    unequip: 'Unequip',
    wornBadge: 'worn — every friend sees it on you',
  },

  // ADR-0017 §3/§4: the Codex Card's Armor stat rows
  armor: {
    moveSpeed: 'Move speed',
    attackSpeed: 'Attack speed',
    band: 'Damage band',
    worn: 'worn',
    slot: { boots: 'Boots', chest: 'Chest', helm: 'Helm' },
  },

  recipe: {
    // one recipe card's hover tooltip: name, kind, description, cost and stats
    tooltip: (name: string, kind: string, desc: string, cost: string, stats: string) =>
      `${name} (${kind})\n${desc}\nCost: ${cost}${stats}`,
    needsTool: (name: string) => `needs ${name}`,
    atForge: 'at a Forge',
    forgeTip: (near: boolean): string =>
      near ? 'A Forge is nearby — you can forge this here.' : 'Only forged at a Forge — build one and stand beside it.',
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
    worldLabel: 'World (share the name to play together — blank = the main world)',
    worldPlaceholder: 'default',
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
    // full-length row labels for the inventory hover popup (Codex Card)
    physDmg: 'Physical damage',
    critChance: 'Critical strike chance',
    critMult: 'Critical strike multiplier',
    atkSpeed: 'Attacks per second',
    dpsFull: 'Damage per second',
    weaponKind: 'weapon',
    rarFabled: 'Fabled',
    rarReward: 'Reward',
    rarAncient: 'Ancient',
    rarBasic: 'Basic',
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
    // ADR-0017 — the Warden altars + Realm gates
    wardenBested: (name: string) => `🏆 ${name} sinks into the mire of slumber — bested!`,
    wardenUnbeaten: (name: string) => `${name} returns to slumber, unbeaten. The totem is spent.`,
    wardenAltarLaid: 'You lay your Offerings upon the Warden altar.',
    wardenAltarNeeds: (needs: string) => `The Warden altar asks for ${needs} — you carry nothing it still needs.`,
    wardenAwaitsTotem: (totem: string) => `The Offering is complete — the altar awaits a ${totem}.`,
    realmGateKeyTurn: (realm: string) => `The key fits — ${realm} stands open, forever!`,
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
    forgeRequired: 'That can only be forged at a Forge — stand beside one.',
    crateGone: 'Someone was quicker — the crate no longer holds that.',
    millFullOrNoWood: 'The mill is full or you carry no wood.',
    noPlankYet: 'No plank is finished yet — the mill works slowly.',
    collectPlanks: 'You collect the finished planks.',
    refinerFullOrEmpty: (item: string) => `The refiner is full or you carry no ${item}.`,
    refinerNotReady: 'Nothing is finished yet — the refiner works slowly.',
    refinerCollected: (item: string) => `You collect the finished ${item}.`,
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
    recalled: 'Recalled home to the Village.',
    recallNoHome: 'No Village yet — found the Hall first.',
    recallNoFight: 'You can’t recall during a Guardian fight.',
    bellRung: 'You ring the Village bell — everyone is called to gather.',
    traded: (n: number, name: string) => `Traded for ${n} ${name}.`,
    tradeFailed: 'The market can’t make that trade.',
    villageNamed: (name: string) => `The Village is now ${name}.`,
    flowersTended: 'You tend the flowers — they brighten.',
    wished: (n: number) => `You toss ${n} fruit into the well.`,
    wishFailed: 'The well won’t take that.',
    festivalRunning: 'A festival is already under way.',
    festivalStarted: '🎉 The wishes are answered — a festival begins!',
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
    // ADR-0015 — the endless generated Depths
    depthDoorOpens: (zone: string) =>
      `Another door grinds open in the far wall — press E there to descend into ${zone}, or leave with everything banked.`,
    descendIntoDepth: (zone: string, n: number) => `You descend into ${zone} with ${n} other${n === 1 ? '' : 's'}...`,
    descendIntoDepthAlone: (zone: string) => `You descend alone into ${zone}...`,
    followIntoDepth: (host: string, zone: string) => `You follow ${host} into ${zone}...`,
    depthBossFalls: (boss: string, parts: string) => `${boss.charAt(0).toUpperCase()}${boss.slice(1)} falls! ${parts}`,
    depthClearedNoHit: (zone: string) => `${zone} is cleared — but you landed no hit, so no loot.`,
    knockedInDepth: (n: number, max: number) => `Knocked down in the Depths! (${n}/${max})`,
    depthHostLeftCollapse: 'The host left — the Depth collapses around you. Everything already banked is safe.',
    depthPartyOverwhelmed: 'The party is overwhelmed — the Descent ends here. Everything already banked is safe.',
    exhaustionDepthHost: 'Exhaustion takes the host — the Descent collapses. (No host migration in v1.)',
    exhaustionDepthYou:
      'Exhaustion takes you — out of the Descent. Any hits you landed still count if the party wins.',
    // ADR-0012 — open-world Wildlife
    cookMeat: 'You roast the meat over the fire. (Eat it from your inventory.)',
    foraged: (parts: string) => `You forage the wildlife — ${parts}.`,
    hunted: (parts: string) => `Felled! ${parts}.`,
    knockedInWild: (n: number, max: number) => `A predator knocks you down! (${n}/${max} — the third means Exhaustion)`,
    wildExhaustionHammock: 'Exhaustion overtakes you in the wilds — you wake in your Hammock, pack fully intact.',
    wildExhaustionSpawn: 'Exhaustion overtakes you in the wilds — you wake at the spawn, pack fully intact.',
    // ADR-0017 — Realm gates (T2 stub; the Warden gate-key gating arrives with T4/T5)
    realmGateDormant: 'The gate is dormant — what lies beyond still slumbers.',
    realmEntered: (name: string) => `You step through the gate — ${name}.`,
    realmLeft: 'You step back through the gate into the World.',
    // ADR-0017 rung 1 — the Tide gates the salt-reed banks
    reedSubmerged: 'The tide has drowned the reeds — wait for the ebb to cut them.',
    // ADR-0017 rung 2 — the Echoes: recorded movement shades open the Hushdark vaults
    echoArmed: '🔊 Recording your echo — walk your path, and a shade of you will loop it forever.',
    echoCaptured: 'Your echo is set — it walks this loop forever now.',
    echoNeedsCharm: 'You need a Chime Charm to arm a recording — ring one from hushsteel.',
    echoTooStill: 'That echo barely moved — a still shade holds nothing. Walk a real path.',
    reliquaryEarned: '🏆 An Echo Reliquary is yours — raise it where all can see the Reverberant fell!',
    reverbEpicHelm: '👑 You take the Reverberant Helm — your Hushsteel Helm, transfigured. Same weight, epic style.',
    reverbWeekly: 'The Reverberant yields this week: an Echo Sigil, echo crystal and hushsteel.',
    greetingLeft: 'Your greeting shade will walk the Hushdark forever, for all who come after.',
    greetingLocked: 'Master the deep vault first — then the memorial will take your mark.',
  },

  delve: {
    descend: 'The Delve · press E to descend',
    sealed: 'Sealed rubble · an Ancient Pickaxe could clear it',
    leave: '⇱ leave',
    descendDeep: 'A door to the Deep · press E to descend',
    descendDepth: (zone: string) => `A door downward · press E to descend into ${zone}`,
  },

  // ADR-0017 — the Realm gates' floating labels (the districts beyond the World's far edge)
  realm: {
    gateTo: (name: string) => `Realm gate · press E to enter ${name}`,
    dormant: 'A dormant Realm gate',
    return: 'Realm gate · press E to return to the World',
  },

  // ADR-0017 rung 2 — the Hushdark's Echoes: pedestal + vault floating labels
  echo: {
    pedestal: 'Echo pedestal · press E to arm a recording (spends a Chime Charm)',
    recording: (s: number) => `Recording your echo… ${s}s`,
    memorial: 'Memorial plinth · press E to leave your greeting shade',
    memorialLocked: 'Memorial plinth · master the deep vault to leave your mark',
  },

  // ADR-0015 — the generated Depths' naming word lists. Names are COMPOSED from
  // these per Depth number (deterministic — identical in every run and World);
  // the lists live here so no English string is ever baked into content code.
  depth: {
    adjectives: ['Umbral', 'Sunken', 'Howling', 'Verdant', 'Ashen', 'Gloaming', 'Riven', 'Silent', 'Thorned', 'Smouldering', 'Frostbound', 'Echoing'],
    nouns: ['Halls', 'Hollows', 'Galleries', 'Vaults', 'Warrens', 'Chasms', 'Barrows', 'Reaches'],
    zone: (n: number, adj: string, noun: string) => `Depth ${n} · the ${adj} ${noun}`,
    huskFamily: (adj: string) => `${adj} Husks`,
    bossColossus: (adj: string) => `the ${adj} Colossus`,
    bossForgeborn: (adj: string) => `the ${adj} Forgeborn`,
    // ADR-0016 — the five Depth boss kits
    bossRam: (adj: string) => `the ${adj} Juggernaut`,
    bossWarden: (adj: string) => `the ${adj} Sentinel`,
    bossWhirl: (adj: string) => `the ${adj} Whirlwind`,
    bossBulwark: (adj: string) => `the ${adj} Bulwark`,
    bossBrood: (adj: string) => `the ${adj} Broodmother`,
  },

  // ADR-0015 — the Grand Monument's engraved Depth Record board
  records: {
    title: '🗿 Depth Records',
    sub: 'engraved at the Grand Monument',
    tabDescents: 'Deepest Descents',
    tabPlayers: 'By Player',
    empty: 'Nothing is engraved yet — no Descent has felled a Stage boss.',
    depth: (n: number) => `Depth ${n}`,
    close: 'Close',
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
    // ADR-0017 — the Warden ladder's narration
    wardenStirs: (name: string, who: string) => `${who} set a Warden Totem upon the altar — ${name} STIRS! Gather at the arena and strike to begin.`,
    reverbRises: (who: string) => `⚡ the pedestals align — ${who} has solved the court, and THE REVERBERANT rises! Strike to begin.`,
    wardenBested: (name: string, who: string) => `🏆 ${name.toUpperCase()} IS BESTED! ${who} carried the day — the Spoils hold each fighter's due.`,
    wardenAltarComplete: (name: string) => `⚡ the altar's Offering is complete — a Warden Totem will wake ${name}!`,
    wardenNoStrike: (name: string) => `no one struck in time — ${name} loses interest and sinks back into slumber. The totem is spent.`,
    wardenUnbeaten: (name: string) => `${name} returns to slumber, unbeaten. Another Totem will wake it.`,
    realmOpened: (realm: string, who: string) => `⚡ the gate glyphs wake — ${who} has opened ${realm}, for everyone, forever!`,
    villageFounded: (who: string) => `🏛 ${who} founded the Village! Everyone without a Hammock now wakes at the Hall.`,
    villageGrew: (name: string) => `🏛 the Village has grown into a ${name}!`,
    festivalStarted: '🎉 The village wishes are answered — a Dorffest begins! Everyone is swift.',
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
    // ADR-0015 — der einzeilige Tiefenrekord-Hinweis auf der Hallen-Tafel
    record: (depth: number, names: string) => `🗿 Tiefster Abstieg: Tiefe ${depth} — ${names}`,
    recordNone: '🗿 Noch kein Abstieg verzeichnet — der Schacht wartet.',
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

  trade: {
    title: '🛖 Handelsposten',
    give: 'Geben',
    get: 'Erhalten',
    max: 'Max',
    cancel: 'Abbrechen',
    confirm: 'Tauschen',
    rate: (cost, giveName, getName) => `Kurs: ${cost} ${giveName} → 1 ${getName}`,
    youGet: (n, name) => `→ du erhältst ${n} ${name}`,
    needAtLeast: (cost, giveName, getName) => `Mindestens ${cost} ${giveName} für 1 ${getName} geben.`,
    nothing: 'Nicht genug für eine ganze Einheit.',
  },

  fountain: {
    title: '⛲ Wunschbrunnen',
    progress: (have, need) => `Wünsche: ${have} / ${need} Frucht`,
    festival: '🎉 Ein Dorffest läuft!',
    have: (n) => `du hast ${n}`,
    amount: 'Werfen',
    toss: 'Hineinwerfen',
    cancel: 'Schließen',
    badge: (m, s) => `🎉 Dorffest ${m}:${s}`,
  },

  vname: {
    title: '🚩 Dorf benennen',
    placeholder: 'Ein Name…',
    cancel: 'Abbrechen',
    save: 'Speichern',
  },

  chron: {
    title: '📖 Dorfchronik',
    placeholder: 'Zeile hinzufügen…',
    close: 'Schließen',
    add: 'Hinzufügen',
    empty: 'Die Chronik ist leer.',
    became: (name) => `— Das Dorf erreichte die Stufe „${name}“`,
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
    wardenStirs: (name) => `⚔ ${name} regt sich`,
    wardenHp: (name, hp, max) => `⚔ ${name} · ${hp}/${max}`,
    wardenBestedFloat: (name) => `${name} ist bezwungen!`,
    furyRestless: 'Der Koloss wird rastlos — die Runen glühen heißer!',
    furyFury: 'RASEREI — die Runen glühen rot!',
  },

  warden: {
    name: (id) => (({ mire: 'Der Moorwächter', echo: 'Der Echowächter', reverb: 'Der Nachhall' }) as Record<string, string>)[id] ?? id,
    realmName: (id) => (({ mire: 'das Versunkene Moor', echo: 'das Stilldunkel' }) as Record<string, string>)[id] ?? id,
  },

  wardenAltar: {
    title: (name) => `⚑ Der Altar: ${name}`,
    hint: 'Lege die verlangten Güter hier nieder (E am Altar) — die Opfergabe ist gemeinschaftlich und bricht einmal, für immer.',
    broken: 'Die Opfergabe ist vollbracht — ein Wächter-Totem weckt ihn.',
  },

  character: {
    title: 'Charakter',
    bag: 'Rucksack',
    slot: { helm: 'Helm', chest: 'Rüstung', boots: 'Stiefel', weapon: 'Waffe' },
    slotIcon: { helm: '🪖', chest: '🛡', boots: '👢', weapon: '⚔' },
    emptySlot: (name) => `Platz „${name}“ — ${name} hierher ziehen`,
    unequipHint: 'zum Ablegen klicken',
    attrMove: 'Tempo',
    attrAttack: 'Angriffstempo',
    attrDamage: 'Schaden',
    attrCrit: 'Krit',
    attrDps: 'DPS',
    attrWeapon: 'Waffe',
    noWeapon: 'bloße Hände',
  },

  buff: {
    swift: (m, s) => `💨 Flink +20% · ${m}:${s}`,
  },

  panels: {
    journey: '🌱 Die Reise',
    intoDelve: '⛏ In den Schacht',
    crafting: 'Herstellung',
    inventory: 'Inventar',
    toggle: 'Ein-/Ausklappen',
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

  loot: {
    title: '💰 Beute',
    fromGuardian: 'vom Wächter',
    fromDeepGuardian: 'vom Tiefenwächter',
    fromForgeborn: 'vom Schmiedegeborenen',
    // the composed boss name stays nominative ("der Aschene Koloss") — no
    // preposition, so no case declension can go wrong
    fromDepthBoss: (boss: string) => boss,
    fromWarden: (name) => name,
    hint: 'Klick ein Item an, um es in den Rucksack zu nehmen',
    take: 'Nehmen',
    takeAll: 'Alles nehmen',
    empty: 'alles eingesammelt',
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

  refiner: {
    title: (name) => `⚗️ ${name}`,
    deposit: (item) => `${item} einlegen`,
    collect: (item) => `${item} holen`,
    close: 'Schließen',
    refining: (n, item) => `veredelt: ${n} ${item}`,
    ready: (n, item) => `fertig: ${n} ${item}`,
    next: (s, item) => `${item}: nächste Einheit in ${s}s`,
    testName: 'Test-Veredler',
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
    // kind subtitle on the hover popup for non-weapon items
    kind: { resource: 'Ressource', tool: 'Werkzeug', structure: 'Bauwerk', consumable: 'Verbrauchsgut', food: 'Nahrung', armor: 'Rüstung' },
    equip: 'Anlegen',
    unequip: 'Ablegen',
    wornBadge: 'angelegt — alle Freunde sehen es an dir',
  },

  armor: {
    moveSpeed: 'Tempo',
    attackSpeed: 'Angriffstempo',
    band: 'Schadensband',
    worn: 'angelegt',
    slot: { boots: 'Stiefel', chest: 'Rüstung', helm: 'Helm' },
  },

  recipe: {
    tooltip: (name, kind, desc, cost, stats) => `${name} (${kind})\n${desc}\nKosten: ${cost}${stats}`,
    needsTool: (name) => `benötigt ${name}`,
    atForge: 'an einer Schmiede',
    forgeTip: (near) =>
      near ? 'Eine Schmiede ist in der Nähe — du kannst dies hier schmieden.' : 'Nur an einer Schmiede zu schmieden — bau eine und stell dich daneben.',
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
    worldLabel: 'Welt (teile den Namen, um zusammen zu spielen — leer = Hauptwelt)',
    worldPlaceholder: 'default',
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
    // full-length row labels for the inventory hover popup (Codex Card)
    physDmg: 'Physischer Schaden',
    critChance: 'Kritische Trefferchance',
    critMult: 'Kritischer Schadensmultiplikator',
    atkSpeed: 'Angriffe pro Sekunde',
    dpsFull: 'Schaden pro Sekunde',
    weaponKind: 'Waffe',
    rarFabled: 'Sagenhaft',
    rarReward: 'Belohnung',
    rarAncient: 'Uralt',
    rarBasic: 'Einfach',
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
    wardenBested: (name) => `🏆 ${name} sinkt bezwungen in den Schlummer!`,
    wardenUnbeaten: (name) => `${name} kehrt in den Schlummer zurück, unbesiegt. Das Totem ist verbraucht.`,
    wardenAltarLaid: 'Du legst deine Opfergaben auf den Wächter-Altar.',
    wardenAltarNeeds: (needs) => `Der Altar verlangt ${needs} — du trägst nichts, was er noch braucht.`,
    wardenAwaitsTotem: (totem) => `Die Opfergabe ist vollbracht — der Altar wartet auf ein ${totem}.`,
    realmGateKeyTurn: (realm) => `Der Schlüssel passt — ${realm} steht offen, für immer!`,
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
    forgeRequired: 'Das lässt sich nur an einer Schmiede schmieden — stell dich daneben.',
    crateGone: 'Jemand war schneller — die Kiste enthält das nicht mehr.',
    millFullOrNoWood: 'Das Werk ist voll oder du trägst kein Holz.',
    noPlankYet: 'Noch kein Brett fertig — das Werk arbeitet langsam.',
    collectPlanks: 'Du sammelst die fertigen Bretter ein.',
    refinerFullOrEmpty: (item) => `Der Veredler ist voll oder dir fehlt: ${item}.`,
    refinerNotReady: 'Noch nichts fertig — der Veredler arbeitet langsam.',
    refinerCollected: (item) => `Du sammelst die fertige Ware ein: ${item}.`,
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
    recalled: 'Zurück ins Dorf gerufen.',
    recallNoHome: 'Noch kein Dorf — gründe zuerst die Halle.',
    recallNoFight: 'Während eines Wächterkampfs kannst du dich nicht zurückrufen.',
    bellRung: 'Du läutest die Dorfglocke — alle werden zum Sammeln gerufen.',
    traded: (n, name) => `Für ${n} ${name} getauscht.`,
    tradeFailed: 'Der Markt kann diesen Tausch nicht machen.',
    villageNamed: (name) => `Das Dorf heißt jetzt ${name}.`,
    flowersTended: 'Du pflegst die Blumen — sie leuchten auf.',
    wished: (n) => `Du wirfst ${n} Frucht in den Brunnen.`,
    wishFailed: 'Der Brunnen nimmt das nicht.',
    festivalRunning: 'Es läuft bereits ein Dorffest.',
    festivalStarted: '🎉 Die Wünsche sind erhört — ein Dorffest beginnt!',
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
    // ADR-0015 — die endlosen erzeugten Tiefen
    depthDoorOpens: (zone) =>
      `Eine weitere Tür knirscht in der fernen Wand auf — drücke dort E, um in ${zone} hinabzusteigen, oder geh mit allem bereits Gesicherten.`,
    descendIntoDepth: (zone, n) => `Du steigst mit ${n} ${n === 1 ? 'weiteren' : 'weiteren'} in ${zone} hinab...`,
    descendIntoDepthAlone: (zone) => `Du steigst allein in ${zone} hinab...`,
    followIntoDepth: (host, zone) => `Du folgst ${host} in ${zone}...`,
    depthBossFalls: (boss, parts) => `${boss.charAt(0).toUpperCase()}${boss.slice(1)} fällt! ${parts}`,
    depthClearedNoHit: (zone) => `${zone} ist bezwungen — doch du hast keinen Treffer gelandet, also keine Beute.`,
    knockedInDepth: (n, max) => `In den Tiefen niedergeschlagen! (${n}/${max})`,
    depthHostLeftCollapse: 'Der Host ist gegangen — die Tiefe stürzt um dich herum ein. Alles bereits Gesicherte ist sicher.',
    depthPartyOverwhelmed: 'Die Gruppe ist überwältigt — der Abstieg endet hier. Alles bereits Gesicherte ist sicher.',
    exhaustionDepthHost: 'Erschöpfung übermannt den Host — der Abstieg stürzt ein. (Kein Host-Wechsel in v1.)',
    exhaustionDepthYou:
      'Erschöpfung übermannt dich — raus aus dem Abstieg. Deine gelandeten Treffer zählen weiter, wenn die Gruppe gewinnt.',
    // ADR-0012 — Wildnis
    cookMeat: 'Du röstest das Fleisch über dem Feuer. (Iss es aus deinem Inventar.)',
    foraged: (parts) => `Du sammelst vom Wild — ${parts}.`,
    hunted: (parts) => `Erlegt! ${parts}.`,
    knockedInWild: (n, max) => `Ein Raubtier schlägt dich nieder! (${n}/${max} — der dritte bedeutet Erschöpfung)`,
    wildExhaustionHammock: 'Erschöpfung übermannt dich in der Wildnis — du erwachst in deiner Hängematte, Rucksack unversehrt.',
    wildExhaustionSpawn: 'Erschöpfung übermannt dich in der Wildnis — du erwachst am Startpunkt, Rucksack unversehrt.',
    // ADR-0017 — Reichstore (T2-Stummel; die Wächter-Schlüssel-Freischaltung kommt mit T4/T5)
    realmGateDormant: 'Das Tor ruht — was dahinter liegt, schlummert noch.',
    realmEntered: (name) => `Du trittst durch das Tor — ${name}.`,
    realmLeft: 'Du trittst durch das Tor zurück in die Welt.',
    // ADR-0017 rung 1 — die Gezeit versperrt die Salzried-Bänke
    reedSubmerged: 'Die Flut hat die Riede ertränkt — warte auf die Ebbe, um sie zu schneiden.',
    // ADR-0017 rung 2 — die Echoes: aufgezeichnete Schatten öffnen die Stilldunkel-Gewölbe
    echoArmed: '🔊 Dein Echo wird aufgezeichnet — geh deinen Pfad, und ein Schatten deiner selbst läuft ihn für immer.',
    echoCaptured: 'Dein Echo steht — es läuft diese Schleife nun für immer.',
    echoNeedsCharm: 'Du brauchst ein Klang-Amulett, um eine Aufnahme scharf zu stellen — läutere eins aus Stillstahl.',
    echoTooStill: 'Dieses Echo hat sich kaum bewegt — ein stiller Schatten hält nichts. Geh einen echten Pfad.',
    reliquaryEarned: '🏆 Eine Echo-Reliquie ist dein — richte sie auf, wo alle sehen, dass der Nachhall fiel!',
    reverbEpicHelm: '👑 Du nimmst den Nachhall-Helm — dein Stillstahl-Helm, verklärt. Gleiches Gewicht, epischer Stil.',
    reverbWeekly: 'Der Nachhall gibt diese Woche her: ein Echo-Sigel, Echokristall und Stillstahl.',
    greetingLeft: 'Dein Begrüßungs-Schatten wird das Stilldunkel für immer durchwandern, für alle, die nach dir kommen.',
    greetingLocked: 'Meistere erst das tiefe Gewölbe — dann nimmt das Mahnmal dein Zeichen an.',
  },

  delve: {
    descend: 'Der Schacht · drücke E zum Hinabsteigen',
    sealed: 'Versiegeltes Geröll · eine Uralte Spitzhacke könnte es räumen',
    leave: '⇱ verlassen',
    descendDeep: 'Eine Tür zur Tiefe · drücke E zum Hinabsteigen',
    descendDepth: (zone) => `Eine Tür abwärts · drücke E, um in ${zone} hinabzusteigen`,
  },

  // ADR-0017 — die schwebenden Beschriftungen der Reichstore
  realm: {
    gateTo: (name) => `Reichstor · drücke E, um ${name} zu betreten`,
    dormant: 'Ein ruhendes Reichstor',
    return: 'Reichstor · drücke E zur Rückkehr in die Welt',
  },

  // ADR-0017 rung 2 — die Echoes des Stilldunkels: Podest- und Gewölbe-Beschriftungen
  echo: {
    pedestal: 'Echo-Podest · drücke E, um eine Aufnahme scharf zu stellen (kostet ein Klang-Amulett)',
    recording: (s) => `Dein Echo wird aufgezeichnet… ${s}s`,
    memorial: 'Mahnmal · drücke E, um deinen Begrüßungs-Schatten zu hinterlassen',
    memorialLocked: 'Mahnmal · meistere das tiefe Gewölbe, um dein Zeichen zu hinterlassen',
  },

  // ADR-0015 — Wortlisten der erzeugten Tiefen. Namen werden pro Tiefenzahl aus
  // ihnen KOMPONIERT (deterministisch — identisch in jedem Zug und jeder Welt);
  // die Adjektive stehen in der schwachen -e-Form, damit jede Fügung passt.
  depth: {
    adjectives: ['Schattenhafte', 'Versunkene', 'Heulende', 'Grünende', 'Aschene', 'Dämmernde', 'Geborstene', 'Stille', 'Dornige', 'Schwelende', 'Frostgebundene', 'Hallende'],
    nouns: ['Hallen', 'Höhlungen', 'Galerien', 'Gewölbe', 'Gänge', 'Klüfte', 'Grüfte', 'Weiten'],
    zone: (n, adj, noun) => `Tiefe ${n} · ${adj} ${noun}`,
    huskFamily: (adj) => `${adj} Hüllen`,
    bossColossus: (adj) => `der ${adj} Koloss`,
    bossForgeborn: (adj) => `der ${adj} Schmiedegeborene`,
    // ADR-0016 — die fünf Tiefen-Boss-Bausätze (schwache Adjektivform wie oben)
    bossRam: (adj) => `der ${adj} Rammbock`,
    bossWarden: (adj) => `die ${adj} Schildwache`,
    bossWhirl: (adj) => `der ${adj} Wirbelwind`,
    bossBulwark: (adj) => `das ${adj} Bollwerk`,
    bossBrood: (adj) => `die ${adj} Brutmutter`,
  },

  // ADR-0015 — die gravierte Tiefenrekord-Tafel des Großen Monuments
  records: {
    title: '🗿 Tiefenrekorde',
    sub: 'graviert am Großen Monument',
    tabDescents: 'Tiefste Abstiege',
    tabPlayers: 'Nach Spieler',
    empty: 'Noch nichts graviert — kein Abstieg hat einen Stufenboss gefällt.',
    depth: (n) => `Tiefe ${n}`,
    close: 'Schließen',
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
    wardenStirs: (name, who) => `${who} setzte ein Wächter-Totem auf den Altar — ${name} REGT SICH! Sammelt euch an der Arena und schlagt zu, um zu beginnen.`,
    reverbRises: (who) => `⚡ die Podeste richten sich aus — ${who} hat den Hof gelöst, und DER NACHHALL erhebt sich! Schlagt zu, um zu beginnen.`,
    wardenBested: (name, who) => `🏆 ${name.toUpperCase()} IST BEZWUNGEN! ${who} trug den Sieg davon — die Beute hält jedes Kämpfers Anteil bereit.`,
    wardenAltarComplete: (name) => `⚡ die Opfergabe des Altars ist vollbracht — ein Wächter-Totem weckt ${name}!`,
    wardenNoStrike: (name) => `niemand schlug rechtzeitig zu — ${name} verliert das Interesse und sinkt zurück in den Schlummer. Das Totem ist verbraucht.`,
    wardenUnbeaten: (name) => `${name} kehrt unbesiegt in den Schlummer zurück. Ein weiteres Totem wird ihn wecken.`,
    realmOpened: (realm, who) => `⚡ die Tor-Glyphen erwachen — ${who} hat ${realm} geöffnet, für alle, für immer!`,
    guardianBested: (who, scales) =>
      `🏆 DER WÄCHTER IST BEZWUNGEN! ${who} haben den Sieg errungen — ${scales} Wächterschuppen für jeden Kämpfer. Er sinkt zurück in den Schlummer.`,
    villageFounded: (who: string) => `🏛 ${who} hat das Dorf gegründet! Jeder ohne Hängematte erwacht nun an der Halle.`,
    villageGrew: (name: string) => `🏛 das Dorf ist zu ${name} herangewachsen!`,
    festivalStarted: '🎉 Die Dorfwünsche sind erhört — ein Dorffest beginnt! Alle sind schneller.',
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
