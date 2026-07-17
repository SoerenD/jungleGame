import { ITEMS, isBuilding, type ItemId, type StructureId, type ToolId } from '../content/items';
import {
  applyUiScale,
  FOG_CHUNK,
  loadUiScale,
  loadVolumes,
  loadWorldLabelScale,
  saveUiScale,
  saveWorldLabelScale,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  WORLD_LABEL_SCALE_MAX,
  WORLD_LABEL_SCALE_MIN,
  WORLD_LABEL_SCALE_STEP,
  WORLD_VIEW_H,
  WORLD_VIEW_W,
  type AudioChannel,
} from '../config';
import { GUARDIAN_DISPLAY_SCALE, WEAPON_COMBAT, weaponStatLine, weaponStatParts } from '../content/guardian';
import { armorDef, gearOwns, isWeapon, type ArmorSlot, type EquippedGear, type WeaponSlot } from '../content/armor';
import { characterSheet } from '../content/stats';
import { drawBlockheadSheet, AVATAR_W, AVATAR_H } from '../avatars';
import type { Appearance, WardenAltarState, WardenWorldState } from '../backend/types';
import { itemIcon } from './icons';
import {
  delveQuestComplete,
  DELVE_QUEST_STEPS,
  hintRetired,
  hushdarkQuestComplete,
  HUSHDARK_QUEST_STEPS,
  journeyComplete,
  JOURNEY_STEPS,
  legacyQuestComplete,
  LEGACY_QUEST_STEPS,
  mireQuestComplete,
  MIRE_QUEST_STEPS,
  terraceQuestComplete,
  TERRACE_QUEST_STEPS,
} from '../content/journey';
import { RECIPES } from '../content/recipes';
import { inventoryCapacity, invKindCount, milestoneForTier, tierThreshold, TRADEABLE, tradeUnitCost, tradeYield, VILLAGE_CONTRIB, VILLAGE_MAX_TIER, type VillageRecord } from '../content/village';
import type {
  ChatMsg,
  DepthDescentRecord,
  DepthRecords,
  Inventory,
  JourneyState,
  QuestState,
  RefinerConfig,
  RefinerState,
  SawmillState,
  SealResourceId,
  SealState,
} from '../backend/types';
import { bus } from './bus';
import { asset } from '../paths';
import { t, getLang, setLang, LANG_NAMES, zoneName, type Lang } from '../i18n';

let meName = '';
/** this Player's Avatar palette picks — drives the character-panel paperdoll */
let myAppearance: Appearance = { skin: 1, hair: 1, shirt: 1, pants: 0 };
let inv: Inventory = {};
// true once the Backend's first inventory snapshot has arrived; until then the loadout
// must not be reconciled against the (still-empty) inv, or a reload would wipe the saved
// arrangement before the real inventory shows up.
let invReady = false;
let treasureLoc: { tx: number; ty: number } | null = null;
let quest: QuestState | null = null;
let seal: SealState | null = null;
/** does a Sawmill stand in the World? (Into-the-Delve step, from GameScene) */
let sawmillBuilt = false;
/** the communal Village record (ADR-0010) — drives the tier panel + recipe gating */
let village: VillageRecord | null = null;
let villageTier = 0;
/** standing beside a Forge — the heavy forged gear is only craftable then */
let nearForge = false;
/** the worn gear (ADR-0017 §4 + the two weapon slots) — mirrors GameScene's record via the 'equipped' event */
let equippedGear: EquippedGear = {};
/** per-Warden altar Offering state + which altar panel is showing (ADR-0017) */
const wardenAltars: Record<string, WardenAltarState> = {};
let wardenPanelId: string | null = null;
/** the full per-Warden altar/gate record — the Chapter-2 tracker phases (Mire/
 *  Hushdark/Terraces) tick off altar.broken + gateOpen (ADR-0017) */
let wardens: Record<string, WardenWorldState> | null = null;
/** a Warden fight re-titles the fight panel; null = the Guardian */
let fightTitle: string | null = null;
let journey: JourneyState | null = null;
let placingNow = false;
/** the four craft tabs: Tools & Weapons, Buildings (≥2×2), Props (1×1), Consumables */
type CraftTab = 'tool' | 'building' | 'prop' | 'consumable';
/** the open craft tab — defaults to Tools & Weapons (B4) */
let craftTab: CraftTab = 'tool';
/** which tab a recipe belongs to: structures split by footprint into Building vs Prop */
function recipeTab(r: (typeof RECIPES)[number]): CraftTab {
  if (r.kind === 'structure') return isBuilding(r.output as StructureId) ? 'building' : 'prop';
  return r.kind;
}
let fightTimer: number | undefined;
let buffTimer: number | undefined;
let festivalTimer: number | undefined;
// ADR-0015: the World's current deepest Descent (the Hall panel's one-line
// teaser — tracked from the first Descent even while the Monument is unbuilt)
let depthTeaser: DepthDescentRecord | null = null;
/** the Grand Monument's open record board + its active view */
let depthRecords: DepthRecords | null = null;
let recordsTab: 'descents' | 'players' = 'descents';
/** fog-of-war layer for the minimap: 1px per chunk, rebuilt on fog events */
let fogLayer: HTMLCanvasElement | null = null;
/** the full-screen world-map renderer (set by initMinimap so it can reuse the
 *  pre-baked terrain + fog + landmarks); null until the minimap has initialized */
let drawWorldMap: (() => void) | null = null;

/** open/close the full-screen world map (M / Escape / backdrop click) */
function setWorldMapOpen(open: boolean): void {
  const ov = document.getElementById('worldmap-overlay');
  if (!ov) return;
  ov.classList.toggle('open', open);
  if (open) drawWorldMap?.();
}

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** let a floating panel be dragged around by a handle element (e.g. its header) */
function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  handle.style.cursor = 'move';
  handle.style.touchAction = 'none';
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    // pin to explicit left/top so it moves freely regardless of its CSS anchor
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    sx = e.clientX;
    sy = e.clientY;
    ox = rect.left;
    oy = rect.top;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — dragging still works via move events */
    }
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const nx = Math.max(0, Math.min(window.innerWidth - 40, ox + (e.clientX - sx)));
    const ny = Math.max(0, Math.min(window.innerHeight - 40, oy + (e.clientY - sy)));
    panel.style.left = `${nx}px`;
    panel.style.top = `${ny}px`;
  });
  const end = (e: PointerEvent) => {
    dragging = false;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* nothing captured */
    }
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  // keep a moved panel on-screen when the window shrinks
  window.addEventListener('resize', () => {
    if (!panel.style.left) return; // never dragged — still on its CSS anchor
    const left = Math.max(0, Math.min(window.innerWidth - 40, parseFloat(panel.style.left) || 0));
    const top = Math.max(0, Math.min(window.innerHeight - 40, parseFloat(panel.style.top) || 0));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });
}

const SEAL_BAR_ORDER: SealResourceId[] = ['wood', 'stone', 'fiber', 'fruit'];

export function initHud(name: string, muted: boolean, appearance?: Appearance): void {
  meName = name;
  if (appearance) myAppearance = appearance;
  document.documentElement.lang = getLang(); // keep <html lang> in sync for a11y
  loadInvOrder();
  loadLoadout();
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="zone-label" data-testid="zone-label">${zoneName('Jungle World')}</div>
    <div id="controls-help">${t.controlsHelp}</div>
    <div id="quest-label" data-testid="quest-label" title="${t.quest.title}">📜 0/? · 🗺 0/3</div>
    <div id="seal-panel" class="panel" data-testid="seal-panel">
      <h3>${t.seal.title}</h3>
      <div id="seal-bars"></div>
      <div id="seal-hint">${t.seal.hint}</div>
    </div>
    <div id="warden-panel" class="panel" data-testid="warden-panel">
      <h3 id="warden-title"></h3>
      <div id="warden-bars"></div>
      <div id="warden-hint"></div>
    </div>
    <div id="village-panel" class="panel" data-testid="village-panel">
      <h3>${t.village.title}</h3>
      <div id="village-tier"></div>
      <div class="seal-bar"><div id="village-fill" class="seal-fill village-fill" style="width:0%"></div></div>
      <div id="village-pool"></div>
      <div id="village-milestone"></div>
      <div id="village-record" data-testid="village-record">${t.village.recordNone}</div>
      <div id="village-hint">${t.village.hint}</div>
    </div>
    <div id="fight-panel" data-testid="fight-panel">
      <div id="fight-title">${t.fight.title}</div>
      <div id="fight-hpbar"><div id="fight-hpfill"></div></div>
      <div id="fight-roster"></div>
      <div id="fight-timer"></div>
    </div>
    <div id="buff-label" data-testid="buff-label"></div>
    <div id="festival-label" data-testid="festival-label"></div>
    <div id="lore-panel" class="panel" data-testid="lore-panel">
      <h3 id="lore-title"></h3>
      <p id="lore-text"></p>
      <button class="ui-btn" id="lore-close">${t.crate.close}</button>
    </div>
    <div id="zone-banner" data-testid="zone-banner"></div>
    <div id="online" class="panel" data-testid="online-list"></div>
    <div id="journey-panel" class="panel" data-testid="journey-panel">
      <div class="panel-head">
        <h3 id="journey-title">${t.panels.journey}</h3>
        <button id="journey-min" class="panel-min" title="${t.panels.toggle}" aria-label="${t.panels.toggle}">▾</button>
      </div>
      <div id="journey-steps"></div>
    </div>
    <div id="toasts"></div>
    <div id="place-hint">${t.hint.place}</div>
    <div id="craft-panel" class="panel" data-testid="craft-panel">
      <h3>${t.panels.crafting}</h3>
      <div id="craft-tabs" data-testid="craft-tabs">
        <button class="craft-tab" data-tab="tool" data-testid="craft-tab-tool">${t.recipe.tabTool}</button>
        <button class="craft-tab" data-tab="building" data-testid="craft-tab-building">${t.recipe.tabBuilding}</button>
        <button class="craft-tab" data-tab="prop" data-testid="craft-tab-prop">${t.recipe.tabProp}</button>
        <button class="craft-tab" data-tab="consumable" data-testid="craft-tab-consumable">${t.recipe.tabConsumable}</button>
      </div>
      <div id="recipe-list"></div>
    </div>
    <div id="crate-panel" class="panel" data-testid="crate-panel">
      <h3>${t.crate.title} <span class="sub-note">${t.crate.shared}</span></h3>
      <div class="crate-cols">
        <div><div class="col-title">${t.crate.inside}</div><div id="crate-contents"></div></div>
        <div><div class="col-title">${t.crate.yourPack}</div><div id="crate-pack"></div></div>
      </div>
      <button class="ui-btn" id="crate-close">${t.crate.close}</button>
    </div>
    <div id="records-panel" class="panel" data-testid="records-panel">
      <h3>${t.records.title} <span class="sub-note">${t.records.sub}</span></h3>
      <div id="records-tabs">
        <button class="craft-tab" id="records-tab-descents" data-testid="records-tab-descents">${t.records.tabDescents}</button>
        <button class="craft-tab" id="records-tab-players" data-testid="records-tab-players">${t.records.tabPlayers}</button>
      </div>
      <div id="records-list" data-testid="records-list"></div>
      <button class="ui-btn" id="records-close">${t.records.close}</button>
    </div>
    <div id="loot-panel" class="panel" data-testid="loot-panel">
      <h3>${t.loot.title} <span class="sub-note" id="loot-sub"></span></h3>
      <div id="loot-grid"></div>
      <div class="loot-hint">${t.loot.hint}</div>
      <div class="loot-btns">
        <button class="ui-btn" id="loot-takeall" data-testid="loot-takeall">${t.loot.takeAll}</button>
        <button class="ui-btn" id="loot-close">${t.loot.close}</button>
      </div>
    </div>
    <div id="village-give-panel" class="panel" data-testid="village-give-panel">
      <h3>${t.villageGive.title} <span class="sub-note">${t.villageGive.shared}</span></h3>
      <div id="village-give-rows"></div>
      <div id="village-give-total" class="village-give-total"></div>
      <div class="village-give-btns">
        <button class="ui-btn" id="village-give-all">${t.villageGive.all}</button>
        <button class="ui-btn" id="village-give-none">${t.villageGive.none}</button>
        <span class="village-give-spacer"></span>
        <button class="ui-btn" id="village-give-cancel">${t.villageGive.cancel}</button>
        <button class="ui-btn" id="village-give-confirm" data-testid="village-give-confirm">${t.villageGive.give}</button>
      </div>
    </div>

    <div id="trade-panel" class="panel" data-testid="trade-panel">
      <h3>${t.trade.title}</h3>
      <div class="trade-row"><span class="trade-lbl">${t.trade.give}</span><select id="trade-give"></select><input id="trade-amt" type="number" min="1" value="1" /><button class="ui-btn trade-max" id="trade-max">${t.trade.max}</button></div>
      <div class="trade-row"><span class="trade-lbl">${t.trade.get}</span><select id="trade-get"></select></div>
      <div id="trade-rate" class="trade-rate"></div>
      <div id="trade-out" class="village-give-total"></div>
      <div class="village-give-btns">
        <span class="village-give-spacer"></span>
        <button class="ui-btn" id="trade-cancel">${t.trade.cancel}</button>
        <button class="ui-btn" id="trade-confirm" data-testid="trade-confirm">${t.trade.confirm}</button>
      </div>
    </div>

    <div id="vname-panel" class="panel" data-testid="vname-panel">
      <h3>${t.vname.title}</h3>
      <input id="vname-input" type="text" maxlength="24" placeholder="${t.vname.placeholder}" />
      <div id="vname-crests" class="vname-crests"></div>
      <div class="village-give-btns">
        <span class="village-give-spacer"></span>
        <button class="ui-btn" id="vname-cancel">${t.vname.cancel}</button>
        <button class="ui-btn" id="vname-save">${t.vname.save}</button>
      </div>
    </div>

    <div id="chron-panel" class="panel" data-testid="chron-panel">
      <h3>${t.chron.title}</h3>
      <div id="chron-list" class="chron-list"></div>
      <input id="chron-input" type="text" maxlength="60" placeholder="${t.chron.placeholder}" />
      <div class="village-give-btns">
        <span class="village-give-spacer"></span>
        <button class="ui-btn" id="chron-close">${t.chron.close}</button>
        <button class="ui-btn" id="chron-add">${t.chron.add}</button>
      </div>
    </div>

    <div id="fountain-panel" class="panel" data-testid="fountain-panel">
      <h3>${t.fountain.title}</h3>
      <div id="fountain-status" class="fountain-status"></div>
      <div class="fountain-bar"><div id="fountain-fill" class="fountain-fill"></div></div>
      <div class="trade-row"><span class="trade-lbl">${t.fountain.amount}</span><input id="fountain-amt" type="number" min="1" value="1" /><span id="fountain-note" class="trade-lbl"></span></div>
      <div class="village-give-btns">
        <span class="village-give-spacer"></span>
        <button class="ui-btn" id="fountain-cancel">${t.fountain.cancel}</button>
        <button class="ui-btn" id="fountain-throw" data-testid="fountain-throw">${t.fountain.toss}</button>
      </div>
    </div>
    <div id="sawmill-panel" class="panel" data-testid="sawmill-panel">
      <h3>${t.sawmill.title}</h3>
      <div id="sawmill-status"></div>
      <div class="sawmill-btns">
        <button class="ui-btn" id="sawmill-deposit" data-testid="sawmill-deposit">${t.sawmill.deposit}</button>
        <button class="ui-btn" id="sawmill-collect" data-testid="sawmill-collect">${t.sawmill.collect}</button>
        <button class="ui-btn" id="sawmill-close">${t.sawmill.close}</button>
      </div>
    </div>
    <div id="refiner-panel" class="panel" data-testid="refiner-panel">
      <h3 id="refiner-title"></h3>
      <div id="refiner-status"></div>
      <div class="sawmill-btns">
        <button class="ui-btn" id="refiner-deposit" data-testid="refiner-deposit"></button>
        <button class="ui-btn" id="refiner-collect" data-testid="refiner-collect"></button>
        <button class="ui-btn" id="refiner-close">${t.refiner.close}</button>
      </div>
    </div>
    <div id="sign-panel" class="panel" data-testid="sign-panel">
      <h3>${t.sign.title}</h3>
      <input id="sign-input" data-testid="sign-input" maxlength="40" placeholder="${t.sign.placeholder}" autocomplete="off" />
      <div class="sawmill-btns">
        <button class="ui-btn" id="sign-ok" data-testid="sign-ok">${t.sign.place}</button>
        <button class="ui-btn" id="sign-cancel">${t.sign.cancel}</button>
      </div>
    </div>
    <div id="inventory-panel" class="panel" data-testid="inventory-panel">
      <h3>${t.character.title}</h3>
      <!-- WoW-style paperdoll: the Avatar (wearing its Armor) flanked by
           equipment slots, with the derived attributes below (ADR-0017 §4) -->
      <div id="char-sheet">
        <div class="char-slots" id="char-slots-left"></div>
        <div id="char-doll"><canvas id="char-doll-canvas" data-testid="char-doll"></canvas></div>
        <div class="char-slots" id="char-slots-right"></div>
      </div>
      <div id="char-attrs" data-testid="char-attrs"></div>
      <div class="char-sep">${t.character.bag}</div>
      <div id="inv-grid"></div>
      <div id="inv-detail">
        <div id="inv-detail-name"></div>
        <div id="inv-detail-desc"></div>
        <div id="inv-detail-actions"></div>
      </div>
    </div>
    <div id="chat" data-testid="chat">
      <div id="chat-messages" class="panel" data-testid="chat-messages"></div>
      <input id="chat-input" data-testid="chat-input" placeholder="${t.chat.placeholder}" maxlength="200" autocomplete="off" />
    </div>
    <canvas id="minimap" width="150" height="150" data-testid="minimap" title="${t.inv.minimapTitle}"></canvas>
    <div id="worldmap-overlay" data-testid="worldmap-overlay">
      <div id="worldmap-box">
        <div id="worldmap-title">${t.inv.worldmapTitle}</div>
        <canvas id="worldmap-canvas" data-testid="worldmap-canvas"></canvas>
        <div id="worldmap-hint">${t.inv.worldmapHint}</div>
      </div>
    </div>
    <div id="loadout-bar" data-testid="loadout-bar" title="${t.inv.loadoutBarTitle}"></div>
    <div id="settings-panel" class="panel" data-testid="settings-panel">
      <h3>${t.settings.title}</h3>
      <div class="settings-section">${t.settings.language}</div>
      <div class="settings-row">
        <select id="settings-lang" data-testid="settings-lang" class="settings-lang">
          ${(['en', 'de'] as Lang[]).map((l) => `<option value="${l}"${getLang() === l ? ' selected' : ''}>${LANG_NAMES[l]}</option>`).join('')}
        </select>
      </div>
      <div class="settings-section">${t.settings.textSize}</div>
      <div class="settings-row">
        <input type="range" id="settings-textsize" data-testid="settings-textsize"
          min="${Math.round(UI_SCALE_MIN * 100)}" max="${Math.round(UI_SCALE_MAX * 100)}" step="${Math.round(UI_SCALE_STEP * 100)}"
          value="${Math.round(loadUiScale() * 100)}" />
        <span class="settings-val" id="settings-textsize-val">${Math.round(loadUiScale() * 100)}%</span>
      </div>
      <div class="settings-section">${t.settings.worldLabelSize}</div>
      <div class="settings-row">
        <input type="range" id="settings-worldlabel" data-testid="settings-worldlabel"
          min="${Math.round(WORLD_LABEL_SCALE_MIN * 100)}" max="${Math.round(WORLD_LABEL_SCALE_MAX * 100)}" step="${Math.round(WORLD_LABEL_SCALE_STEP * 100)}"
          value="${Math.round(loadWorldLabelScale() * 100)}" />
        <span class="settings-val" id="settings-worldlabel-val">${Math.round(loadWorldLabelScale() * 100)}%</span>
      </div>
      <div class="settings-section">${t.settings.audio}</div>
      <div id="settings-sliders"></div>
      <label class="settings-mute">
        <input type="checkbox" id="settings-mute" data-testid="settings-mute" ${muted ? 'checked' : ''} />
        ${t.settings.muteAll}
      </label>
      <button class="ui-btn" id="settings-close">${t.settings.close}</button>
    </div>
    <div id="bottom-bar">
      <button class="ui-btn" id="btn-craft" data-testid="btn-craft">${t.bottomBar.craft}</button>
      <button class="ui-btn" id="btn-inv" data-testid="btn-inventory">${t.bottomBar.inventory}</button>
      <button class="ui-btn" id="btn-mute" data-testid="btn-mute">${muted ? t.bottomBar.muted : t.bottomBar.sound}</button>
      <button class="ui-btn" id="btn-settings" data-testid="btn-settings" title="${t.settings.btnTitle}">⚙</button>
    </div>
    <div id="item-tooltip" role="tooltip" aria-hidden="true" data-testid="item-tooltip"></div>
  `;
  document.body.appendChild(hud);

  // the inventory window can be dragged around by its header
  const invPanel = el('inventory-panel');
  const invHeader = invPanel.querySelector('h3');
  if (invHeader) makeDraggable(invPanel, invHeader as HTMLElement);

  el('btn-craft').onclick = () => togglePanel('craft-panel');
  el('btn-inv').onclick = () => togglePanel('inventory-panel');
  // craft-panel tabs (B4): click switches the visible recipe kind
  for (const tabBtn of Array.from(document.querySelectorAll<HTMLElement>('#craft-tabs .craft-tab'))) {
    tabBtn.onclick = () => setCraftTab(tabBtn.dataset.tab as typeof craftTab);
  }
  el('btn-mute').onclick = () => bus.emit('toggle-mute');
  el('btn-settings').onclick = () => togglePanel('settings-panel');
  el('settings-close').onclick = () => el('settings-panel').classList.remove('open');
  el<HTMLInputElement>('settings-mute').onchange = () => bus.emit('toggle-mute');
  // switching language persists the choice and reloads so every import-time
  // string table (items, lore, this HUD…) rebuilds in the new language
  el<HTMLSelectElement>('settings-lang').onchange = (e) => setLang((e.target as HTMLSelectElement).value as Lang);
  // text-size slider: live-scales every HUD font via the --ui-scale CSS var and
  // persists the choice (value is a percentage; the multiplier is value / 100)
  const sizeSlider = el<HTMLInputElement>('settings-textsize');
  sizeSlider.addEventListener('input', () => {
    const pct = Number(sizeSlider.value);
    el('settings-textsize-val').textContent = `${pct}%`;
    applyUiScale(pct / 100);
    saveUiScale(pct / 100);
  });
  // world-label-size slider: scales the in-canvas name tags (Node hover
  // tooltips + Player name plates). GameScene listens for 'world-label-scale'
  // and re-scales its live labels; the value persists like the text size.
  const labelSlider = el<HTMLInputElement>('settings-worldlabel');
  labelSlider.addEventListener('input', () => {
    const pct = Number(labelSlider.value);
    el('settings-worldlabel-val').textContent = `${pct}%`;
    saveWorldLabelScale(pct / 100);
    bus.emit('world-label-scale', pct / 100);
  });
  renderSettings();

  const input = el<HTMLInputElement>('chat-input');
  input.addEventListener('focus', () => bus.emit('chat-focus'));
  input.addEventListener('blur', () => bus.emit('chat-blur'));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (text) bus.emit('send-chat', text);
      input.value = '';
      input.blur();
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });

  window.addEventListener('keydown', (e) => {
    const typing = document.activeElement instanceof HTMLInputElement;
    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && el('worldmap-overlay').classList.contains('open')) {
      setWorldMapOpen(false);
      return;
    }
    if (k === 't') {
      e.preventDefault();
      input.focus();
    } else if (k === 'c') {
      togglePanel('craft-panel');
    } else if (k === 'i') {
      togglePanel('inventory-panel');
    } else if (k === 'm') {
      // M opens the full-screen world map (find "The Cavern Mouth" & every region).
      // Mute lives on the bottom-bar button + the settings checkbox.
      setWorldMapOpen(!el('worldmap-overlay').classList.contains('open'));
    } else if (k >= '1' && k <= '5') {
      selectLoadout(Number(k) - 1); // the five uniform quick-slots
    }
  });
  // dim backdrop click closes the world map
  el('worldmap-overlay').addEventListener('click', (e) => {
    if (e.target === el('worldmap-overlay')) setWorldMapOpen(false);
  });

  bus.on('inventory', (next: Inventory) => {
    inv = next;
    invReady = true; // the real inventory is now known — the loadout may reconcile safely
    renderInventory();
    renderRecipes();
    renderLoadout();
    emitHeld();
    renderJourney(); // Delve-quest steps tick off inventory (Scales, pickaxe, drops)
    if (openCrateId) renderCrate();
    migrateWeaponSlots(); // join emits 'equipped' first — invReady arrives HERE
  });
  // ADR-0017 §4: the worn gear changed (join restore or an equip round-trip)
  bus.on('equipped', (eq: EquippedGear) => {
    equippedGear = eq;
    renderInventory(); // the ⛨ badge + the detail bar's Equip/Unequip label
    renderCharacter(); // re-dress the paperdoll + its slots + attributes
    renderJourney(); // the Legacy's Reverberant step accepts the epic helm WORN
    renderLoadout(); // gear ownership feeds the quick-slot reconcile
    emitHeld(); // a returned/migrated weapon changes what the hand holds
    migrateWeaponSlots(); // drain weapons an old client left in the gear record
  });
  bus.on('chat', (msg: ChatMsg) => appendChat(msg));
  bus.on('chatlog', (msgs: ChatMsg[]) => {
    el('chat-messages').innerHTML = '';
    msgs.forEach(appendChat);
  });
  bus.on('zone', (zone: string) => {
    setZone(zone);
    // the atlas bakes the "you are here" label tint — re-bake on region crossing
    if (el('worldmap-overlay').classList.contains('open')) drawWorldMap?.();
  });
  bus.on('presence', (names: string[]) => {
    el('online').innerHTML =
      `<b>${t.online(names.length)}</b><br>` +
      names.map((n) => `<span class="who">${n === meName ? n + t.youSuffix : n}</span>`).join('<br>');
  });
  bus.on('toast', (text: string, kind: 'info' | 'good' | 'bad' = 'info') => toast(text, kind));
  bus.on('ground-drop-request', (id: ItemId) => openDropModal(id));
  bus.on('mute', (m: boolean) => {
    el('btn-mute').textContent = m ? t.bottomBar.muted : t.bottomBar.sound;
    el<HTMLInputElement>('settings-mute').checked = m;
  });
  bus.on('place-mode', (on: boolean) => {
    placingNow = on;
    // the placement hint is a contextual Journey hint — it retires after a few placements
    const retired = journey !== null && hintRetired(journey, 'place');
    el('place-hint').classList.toggle('open', on && !retired);
  });
  bus.on('journey', (j: JourneyState) => {
    journey = j;
    renderJourney();
    if (placingNow && hintRetired(j, 'place')) el('place-hint').classList.remove('open');
  });
  bus.on('quest', (q: QuestState) => {
    treasureLoc = q.treasureLocation;
    quest = q;
    renderQuestLabel();
    renderJourney(); // the 'shaft cleared' step ticks off quest.delveOpen
    // the treasure ✕ is baked into the atlas — re-bake while it is open
    if (el('worldmap-overlay').classList.contains('open')) drawWorldMap?.();
  });
  bus.on('sawmill-built', (built: boolean) => {
    sawmillBuilt = built;
    renderJourney(); // the 'Build a Sawmill' step ticks off
  });
  bus.on('seal', (s: SealState) => {
    seal = s;
    renderQuestLabel();
    renderSealBars();
    renderJourney(); // the 'break the Seal' step ticks off seal.broken
  });
  bus.on('seal-near', (near: boolean) => {
    el('seal-panel').classList.toggle('open', near);
  });
  // ADR-0017: a Warden altar's Offering bars (near its altar), Seal-panel style
  bus.on('warden-altar', (id: string, altar: WardenAltarState) => {
    wardenAltars[id] = altar;
    if (wardenPanelId === id) renderWardenBars();
  });
  // the full altar/gate record — the Chapter-2 tracker phases tick off it
  bus.on('wardens', (w: Record<string, WardenWorldState>) => {
    wardens = w;
    renderJourney();
  });
  bus.on('warden-altar-near', (id: string | null) => {
    wardenPanelId = id;
    el('warden-panel').classList.toggle('open', !!id);
    if (id) renderWardenBars();
  });
  bus.on('village', (v: VillageRecord) => {
    village = v;
    villageTier = v.tier;
    renderInventory(); // ADR-0013: pack capacity grows a row when the Village is founded
    renderVillagePanel();
    renderRecipes(); // tier-locked Buildings unlock as the Village grows (villageMin)
    renderCharacter(); // the Village's collective buffs feed the attributes block
    renderJourney(); // the Into-the-Delve 'Found a Village' step ticks off hall!==null
    // the Hall pin is baked into the atlas — re-bake while it is open
    if (el('worldmap-overlay').classList.contains('open')) drawWorldMap?.();
  });
  bus.on('village-near', (near: boolean) => {
    el('village-panel').classList.toggle('open', near);
  });
  // beside a Forge the heavy forged gear becomes craftable — re-render so those
  // cards flip between locked and craftable as the Player steps up to it
  bus.on('forge-near', (near: boolean) => {
    nearForge = near;
    renderRecipes();
  });
  // E at the Forge opens the craft menu on the Tools & Weapons tab
  bus.on('open-forge', () => {
    el('craft-panel').classList.add('open');
    setCraftTab('tool');
  });
  bus.on('fog', (explored: Set<number>, chunksW: number, chunksH: number) => {
    if (!fogLayer) fogLayer = document.createElement('canvas');
    fogLayer.width = chunksW;
    fogLayer.height = chunksH;
    const fctx = fogLayer.getContext('2d')!;
    fctx.fillStyle = 'rgba(4, 12, 6, 0.93)';
    fctx.fillRect(0, 0, chunksW, chunksH);
    for (const idx of explored) {
      fctx.clearRect(idx % chunksW, Math.floor(idx / chunksW), 1, 1);
    }
  });
  bus.on(
    'fight-start',
    (f: { hp: number; maxHp: number; engagedAt: number | null; awakeMs: number; roster: string[]; title?: string | null }) => {
      el('fight-panel').classList.add('open');
      window.clearInterval(fightTimer);
      fightTitle = f.title ?? null; // a Warden fight names the panel (ADR-0017)
      if (f.engagedAt === null) {
        // DORMANT (ADR-0004): the colossus roams, unstruck — no roster, no HP
        // bar, no clock yet. Prompt the party to land the first strike.
        el('fight-panel').classList.add('dormant');
        el('fight-title').textContent = fightTitle ? t.fight.wardenStirs(fightTitle) : t.fight.stirs;
        el('fight-roster').textContent = '';
        el('fight-timer').textContent = t.fight.gatherParty;
        return;
      }
      // ENGAGED: HP is fixed to the sealed roster; the countdown runs from
      // engagedAt — identical on every client (ADR-0002 amended).
      const engagedAt = f.engagedAt;
      el('fight-panel').classList.remove('dormant');
      setFightHp(f.hp, f.maxHp);
      (el('fight-hpbar') as HTMLElement).dataset.max = String(f.maxHp);
      el('fight-roster').textContent = t.fight.wardedParty(f.roster.length, f.roster.join(', '));
      const tick = () => {
        const left = Math.max(0, engagedAt + f.awakeMs - Date.now());
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        el('fight-timer').textContent = t.fight.slumbersIn(m, String(s).padStart(2, '0'));
      };
      tick();
      fightTimer = window.setInterval(tick, 250);
    },
  );
  bus.on('fight-hp', (hp: number) => {
    const max = Number((el('fight-hpbar') as HTMLElement).dataset.max ?? 1);
    setFightHp(hp, max);
  });
  bus.on('fight-end', () => {
    el('fight-panel').classList.remove('open', 'dormant');
    window.clearInterval(fightTimer);
  });
  bus.on('buff', (until: number) => {
    window.clearInterval(buffTimer);
    const label = el('buff-label');
    if (!until) {
      label.classList.remove('open');
      return;
    }
    label.classList.add('open');
    const tick = () => {
      const left = Math.max(0, until - Date.now());
      if (left === 0) {
        label.classList.remove('open');
        window.clearInterval(buffTimer);
        return;
      }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      label.textContent = t.buff.swift(m, String(s).padStart(2, '0'));
    };
    tick();
    buffTimer = window.setInterval(tick, 500);
  });
  bus.on('lore', (title: string, text: string) => {
    el('lore-title').textContent = title;
    el('lore-text').textContent = text;
    el('lore-panel').classList.add('open');
  });
  el('lore-close').onclick = () => el('lore-panel').classList.remove('open');
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el('lore-panel').classList.remove('open');
  });

  // ---- The Journey tracker can be minimized to just its header (persisted); the
  // step list can grow tall, so let Players fold it out of the way.
  const JOURNEY_COLLAPSED_KEY = 'jw:journeyCollapsed';
  const journeyMin = el('journey-min');
  const applyJourneyCollapsed = () => {
    const collapsed = localStorage.getItem(JOURNEY_COLLAPSED_KEY) === '1';
    el('journey-panel').classList.toggle('collapsed', collapsed);
    journeyMin.textContent = collapsed ? '▸' : '▾';
  };
  journeyMin.onclick = () => {
    const collapsed = !el('journey-panel').classList.contains('collapsed');
    localStorage.setItem(JOURNEY_COLLAPSED_KEY, collapsed ? '1' : '0');
    applyJourneyCollapsed();
  };
  applyJourneyCollapsed();

  // ---- v3: crate storage panel
  el('crate-close').onclick = () => {
    openCrateId = null;
    el('crate-panel').classList.remove('open');
  };
  bus.on('crate-open', (id: string, contents: Inventory) => {
    openCrateId = id;
    crateContents = contents;
    el('crate-panel').classList.add('open');
    renderCrate();
  });
  bus.on('crate-changed', (id: string, contents: Inventory) => {
    if (openCrateId !== id) return;
    crateContents = contents;
    renderCrate();
  });

  // ---- boss Spoils window: a read-only loot bag opened on every boss kill.
  // GameScene owns the claim (grant-on-take) and echoes back what's left; when
  // nothing remains the panel closes itself. Closing early collects the rest so
  // loot is never lost.
  el('loot-close').onclick = () => bus.emit('loot-close');
  el('loot-takeall').onclick = () => bus.emit('loot-take-all');
  bus.on('loot-open', (drops: Inventory, sub: string) => {
    lootDrops = drops;
    el('loot-sub').textContent = sub;
    el('loot-panel').classList.add('open');
    renderLoot();
  });
  bus.on('loot-changed', (drops: Inventory) => {
    lootDrops = drops;
    const left = Object.values(drops).some((n) => (n ?? 0) > 0);
    if (!left) {
      lootDrops = null;
      el('loot-panel').classList.remove('open');
    } else {
      renderLoot();
    }
  });

  // ---- ADR-0015: the Grand Monument's Depth Record board + the Hall teaser
  el('records-close').onclick = () => el('records-panel').classList.remove('open');
  el('records-tab-descents').onclick = () => {
    recordsTab = 'descents';
    renderRecords();
  };
  el('records-tab-players').onclick = () => {
    recordsTab = 'players';
    renderRecords();
  };
  bus.on('records-open', (r: DepthRecords) => {
    depthRecords = r;
    el('records-panel').classList.add('open');
    renderRecords();
  });
  bus.on('depth-record', (top: DepthDescentRecord | null) => {
    depthTeaser = top;
    renderVillagePanel();
  });

  // ---- A3: Village contribution panel (per-resource sliders, ADR-0010)
  const closeVillageGive = () => el('village-give-panel').classList.remove('open');
  el('village-give-cancel').onclick = closeVillageGive;
  bus.on('village-give-close', closeVillageGive);
  el('village-give-confirm').onclick = () => {
    // hand the chosen amounts to GameScene; it closes the panel on success
    bus.emit('village-give', { ...villageGiveChosen });
  };
  el('village-give-all').onclick = () => {
    for (const item of Object.keys(villageGiveChosen) as ItemId[]) villageGiveChosen[item] = villageGiveHeld[item] ?? 0;
    renderVillageGive();
  };
  el('village-give-none').onclick = () => {
    for (const item of Object.keys(villageGiveChosen) as ItemId[]) villageGiveChosen[item] = 0;
    renderVillageGive();
  };
  bus.on('village-give-open', (snapshot: Inventory) => {
    // snapshot only the items the pool accepts; default each slider to "all"
    villageGiveHeld = {};
    villageGiveChosen = {};
    for (const [item, per] of Object.entries(VILLAGE_CONTRIB)) {
      const have = snapshot[item as ItemId] ?? 0;
      if (per && have > 0) {
        villageGiveHeld[item as ItemId] = have;
        villageGiveChosen[item as ItemId] = have;
      }
    }
    el('village-give-panel').classList.add('open');
    renderVillageGive();
  });

  // ---- ADR-0013: Trade Post (market_square) resource-exchange panel
  let tradeTier = 0;
  let tradeHeld: Partial<Record<string, number>> = {};
  const tradeGive = () => el<HTMLSelectElement>('trade-give').value as ItemId;
  const tradeGet = () => el<HTMLSelectElement>('trade-get').value as ItemId;
  const tradeAmt = () => Math.max(0, Math.floor(Number(el<HTMLInputElement>('trade-amt').value) || 0));
  const renderTradeOut = () => {
    const give = tradeGive();
    const get = tradeGet();
    const giveName = ITEMS[give]?.name ?? give;
    const getName = ITEMS[get]?.name ?? get;
    // the standing exchange rate for this pair — always shown, so the swap is legible
    const cost = tradeUnitCost(give, get, tradeTier);
    el('trade-rate').textContent = cost > 0 ? t.trade.rate(cost, giveName, getName) : '';
    const out = tradeYield(give, tradeAmt(), get, tradeTier);
    // when the amount buys nothing yet, say exactly how much would — not a dead end
    el('trade-out').textContent =
      out > 0 ? t.trade.youGet(out, getName) : cost > 0 ? t.trade.needAtLeast(cost, giveName, getName) : t.trade.nothing;
    (el('trade-confirm') as HTMLButtonElement).disabled = out <= 0;
  };
  // open at the smallest amount that yields a whole unit (capped to what's held),
  // so the panel never greets the Player with a bare "Not enough".
  const syncTradeAmt = () => {
    const held = tradeHeld[tradeGive()] ?? 0;
    const cost = Math.max(1, tradeUnitCost(tradeGive(), tradeGet(), tradeTier));
    el<HTMLInputElement>('trade-amt').value = String(held > 0 ? Math.min(held, cost) : cost);
    renderTradeOut();
  };
  // rebuild the "Get" list to exclude whatever's in "Give" — a same-item swap is
  // meaningless, so it's never offered (keeps the prior pick when still valid).
  const rebuildTradeGet = () => {
    const rSel = el<HTMLSelectElement>('trade-get');
    const give = tradeGive();
    const prev = rSel.value;
    rSel.innerHTML = '';
    for (const it of TRADEABLE) {
      if (it === give) continue;
      const opt = document.createElement('option');
      opt.value = it;
      opt.textContent = ITEMS[it as ItemId]?.name ?? it;
      rSel.append(opt);
    }
    if (prev && prev !== give && Array.from(rSel.options).some((o) => o.value === prev)) rSel.value = prev;
  };
  const closeTrade = () => el('trade-panel').classList.remove('open');
  el('trade-cancel').onclick = closeTrade;
  bus.on('trade-close', closeTrade);
  el('trade-give').addEventListener('change', () => {
    rebuildTradeGet();
    syncTradeAmt();
  });
  el('trade-get').addEventListener('change', syncTradeAmt);
  el('trade-amt').addEventListener('input', renderTradeOut);
  el('trade-max').onclick = () => {
    const held = tradeHeld[tradeGive()] ?? 0;
    el<HTMLInputElement>('trade-amt').value = String(Math.max(1, held));
    renderTradeOut();
  };
  el('trade-confirm').onclick = () => bus.emit('trade-do', { give: tradeGive(), count: tradeAmt(), get: tradeGet() });
  bus.on('trade-open', (o: { inventory: Inventory; tier: number }) => {
    tradeTier = o.tier;
    tradeHeld = { ...o.inventory };
    const gSel = el<HTMLSelectElement>('trade-give');
    gSel.innerHTML = '';
    for (const it of TRADEABLE) {
      const have = o.inventory[it as ItemId] ?? 0;
      if (have > 0) {
        const gOpt = document.createElement('option');
        gOpt.value = it;
        gOpt.textContent = `${ITEMS[it as ItemId]?.name ?? it} (${have})`;
        gSel.append(gOpt);
      }
    }
    rebuildTradeGet();
    el('trade-panel').classList.add('open');
    syncTradeAmt();
  });

  // ---- ADR-0013: Banner name & crest
  const CREST_HUES = ['#a65445', '#4d6b3c', '#537f8d', '#e0b268', '#8a4b39', '#6b4e8f'];
  let vnameCrest = 0;
  const renderCrests = () => {
    const box = el('vname-crests');
    box.innerHTML = '';
    CREST_HUES.forEach((hue, i) => {
      const b = document.createElement('button');
      b.style.cssText = `background:${hue};width:18px;height:18px;border-radius:3px;margin:2px;cursor:pointer;border:2px solid ${i === vnameCrest ? '#fff' : 'transparent'}`;
      b.onclick = () => {
        vnameCrest = i;
        renderCrests();
      };
      box.append(b);
    });
  };
  const vnameInput = el<HTMLInputElement>('vname-input');
  vnameInput.addEventListener('focus', () => bus.emit('chat-focus'));
  vnameInput.addEventListener('blur', () => bus.emit('chat-blur'));
  vnameInput.addEventListener('keydown', (e) => e.stopPropagation());
  const closeVname = () => {
    el('vname-panel').classList.remove('open');
    vnameInput.blur();
  };
  el('vname-cancel').onclick = closeVname;
  el('vname-save').onclick = () => {
    const name = vnameInput.value.trim();
    if (name) bus.emit('village-name-set', { name, crest: vnameCrest });
    closeVname();
  };
  bus.on('village-name-open', (o: { name: string; crest: number }) => {
    vnameInput.value = o.name;
    vnameCrest = o.crest || 0;
    renderCrests();
    el('vname-panel').classList.add('open');
    vnameInput.focus();
  });

  // ---- ADR-0013: Well chronicle
  const chronInput = el<HTMLInputElement>('chron-input');
  chronInput.addEventListener('focus', () => bus.emit('chat-focus'));
  chronInput.addEventListener('blur', () => bus.emit('chat-blur'));
  const addChron = () => {
    const text = chronInput.value.trim();
    if (text) {
      bus.emit('village-note-add', text);
      chronInput.value = '';
    }
  };
  chronInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') addChron();
  });
  el('chron-add').onclick = addChron;
  el('chron-close').onclick = () => {
    el('chron-panel').classList.remove('open');
    chronInput.blur();
  };
  bus.on('chronicle-open', (o: { lines: string[] }) => {
    const list = el('chron-list');
    list.innerHTML = '';
    const lines = o.lines.slice(-15);
    if (!lines.length) {
      list.textContent = t.chron.empty;
    } else {
      for (const line of lines) {
        const d = document.createElement('div');
        d.className = 'chron-line';
        d.textContent = line;
        list.append(d);
      }
    }
    el('chron-panel').classList.add('open');
  });

  // ---- ADR-0013: Wishing Well (fountain) — toss fruit toward the Dorffest
  const closeFountain = () => el('fountain-panel').classList.remove('open');
  el('fountain-cancel').onclick = closeFountain;
  bus.on('fountain-close', closeFountain);
  el('fountain-throw').onclick = () => {
    const n = Math.max(1, Math.floor(Number(el<HTMLInputElement>('fountain-amt').value) || 1));
    bus.emit('fountain-wish', n);
  };
  bus.on('fountain-open', (o: { have: number; wishes: number; threshold: number; festivalUntil: number }) => {
    const active = o.festivalUntil > Date.now();
    el('fountain-status').textContent = active ? t.fountain.festival : t.fountain.progress(o.wishes, o.threshold);
    el('fountain-fill').style.width = `${Math.min(100, active ? 100 : (o.wishes / o.threshold) * 100)}%`;
    const amt = el<HTMLInputElement>('fountain-amt');
    amt.max = String(Math.max(1, o.have));
    if (Number(amt.value) > o.have) amt.value = String(Math.max(1, o.have));
    el('fountain-note').textContent = t.fountain.have(o.have);
    (el('fountain-throw') as HTMLButtonElement).disabled = active || o.have <= 0;
    el('fountain-panel').classList.add('open');
  });

  // the Dorffest badge — a ticking countdown while a festival runs (mirrors the buff badge)
  bus.on('festival', (until: number) => {
    window.clearInterval(festivalTimer);
    const label = el('festival-label');
    if (!until) {
      label.classList.remove('open');
      return;
    }
    label.classList.add('open');
    const tick = () => {
      const left = Math.max(0, until - Date.now());
      if (left === 0) {
        label.classList.remove('open');
        window.clearInterval(festivalTimer);
        return;
      }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      label.textContent = t.fountain.badge(m, String(s).padStart(2, '0'));
    };
    tick();
    festivalTimer = window.setInterval(tick, 500);
  });

  // ---- v3: Sawmill panel
  el('sawmill-close').onclick = () => {
    openSawmillId = null;
    window.clearInterval(sawmillTimer);
    el('sawmill-panel').classList.remove('open');
  };
  el('sawmill-deposit').onclick = () => {
    if (openSawmillId) bus.emit('sawmill-deposit', openSawmillId);
  };
  el('sawmill-collect').onclick = () => {
    if (openSawmillId) bus.emit('sawmill-collect', openSawmillId);
  };
  bus.on('sawmill-open', (id: string, state: SawmillState) => {
    openSawmillId = id;
    sawmill = state;
    sawmillOpenedAt = Date.now();
    el('sawmill-panel').classList.add('open');
    renderSawmill();
    window.clearInterval(sawmillTimer);
    sawmillTimer = window.setInterval(renderSawmill, 500);
  });

  // ---- the generic Refiner panel (ADR-0017 §6): the Sawmill panel's skeleton,
  // parameterized by the RefinerConfig + display name it was opened with — the
  // deposit/collect/refresh events echo that target back so GameScene stays stateless
  el('refiner-close').onclick = () => {
    openRefiner = null;
    window.clearInterval(refinerTimer);
    el('refiner-panel').classList.remove('open');
  };
  el('refiner-deposit').onclick = () => {
    if (openRefiner) bus.emit('refiner-deposit', openRefiner);
  };
  el('refiner-collect').onclick = () => {
    if (openRefiner) bus.emit('refiner-collect', openRefiner);
  };
  bus.on('refiner-open', (target: RefinerTarget, state: RefinerState) => {
    openRefiner = target;
    refiner = state;
    refinerOpenedAt = Date.now();
    el('refiner-title').textContent = t.refiner.title(target.name);
    el('refiner-deposit').textContent = t.refiner.deposit(ITEMS[target.cfg.inputItem].name);
    el('refiner-collect').textContent = t.refiner.collect(ITEMS[target.cfg.outputItem].name);
    el('refiner-panel').classList.add('open');
    renderRefiner();
    window.clearInterval(refinerTimer);
    refinerTimer = window.setInterval(renderRefiner, 500);
  });

  // ---- v3: signpost line prompt (freezes movement via the chat-focus wiring)
  const signInput = el<HTMLInputElement>('sign-input');
  signInput.addEventListener('focus', () => bus.emit('chat-focus'));
  signInput.addEventListener('blur', () => bus.emit('chat-blur'));
  const closeSign = (text: string | null) => {
    el('sign-panel').classList.remove('open');
    signInput.blur();
    bus.emit('sign-text', text);
  };
  bus.on('sign-prompt', () => {
    signInput.value = '';
    el('sign-panel').classList.add('open');
    signInput.focus();
  });
  el('sign-ok').onclick = () => closeSign(signInput.value);
  el('sign-cancel').onclick = () => closeSign(null);
  signInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') closeSign(signInput.value);
    else if (e.key === 'Escape') closeSign(null);
  });

  renderInventory();
  renderRecipes();
  renderLoadout();
  emitHeld();
  void initMinimap();
}

// ---------------------------------------------------------------- v3: crate + Sawmill

let openCrateId: string | null = null;
let crateContents: Inventory = {};
/** the boss Spoils window: the drops still waiting to be taken (null = closed) */
let lootDrops: Inventory | null = null;
let openSawmillId: string | null = null;
let sawmill: SawmillState | null = null;
let sawmillOpenedAt = 0;
let sawmillTimer: number | undefined;
let sawmillRefreshAt = 0;
/** the generic Refiner panel's target (ADR-0017 §6): which station, run on what tuning, shown under what name */
interface RefinerTarget {
  id: string;
  cfg: RefinerConfig;
  name: string;
}
let openRefiner: RefinerTarget | null = null;
let refiner: RefinerState | null = null;
let refinerOpenedAt = 0;
let refinerTimer: number | undefined;
let refinerRefreshAt = 0;
/** Village contribution panel: what the Player holds of each accepted item… */
let villageGiveHeld: Inventory = {};
/** …and how much of each the sliders currently choose to give (0..held) */
let villageGiveChosen: Inventory = {};

function crateRow(id: ItemId, count: number, action: 'take' | 'put', onClick: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'inv-row';
  const label = document.createElement('span');
  label.textContent = `${ITEMS[id].name} × ${count}`;
  row.appendChild(label);
  const btn = document.createElement('button');
  btn.className = 'ui-btn';
  btn.textContent = action === 'take' ? t.crate.take : t.crate.put;
  btn.setAttribute('data-testid', `crate-${action}-${id}`);
  btn.onclick = onClick;
  row.appendChild(btn);
  return row;
}

function renderCrate(): void {
  if (!openCrateId) return;
  const id = openCrateId;
  const inside = el('crate-contents');
  inside.innerHTML = '';
  const contents = (Object.entries(crateContents).filter(([id, n]) => (n ?? 0) > 0 && !!ITEMS[id as ItemId])) as [ItemId, number][];
  if (contents.length === 0) inside.innerHTML = `<div class="col-empty">${t.crate.empty}</div>`;
  for (const [item, n] of contents) {
    inside.appendChild(crateRow(item, n, 'take', () => bus.emit('crate-withdraw', id, item, n)));
  }
  const pack = el('crate-pack');
  pack.innerHTML = '';
  const mine = (Object.entries(inv).filter(([id, n]) => (n ?? 0) > 0 && !!ITEMS[id as ItemId])) as [ItemId, number][];
  if (mine.length === 0) pack.innerHTML = `<div class="col-empty">${t.crate.nothingToStore}</div>`;
  for (const [item, n] of mine) {
    pack.appendChild(crateRow(item, n, 'put', () => bus.emit('crate-deposit', id, item, n)));
  }
}

/**
 * The boss Spoils window as a small read-only inventory: one icon slot per drop
 * (the item's own sprite + stack count), the same Codex Card preview on hover as
 * the pack, and a click that takes that whole stack into the pack. No Put — loot
 * only flows outward.
 */
function renderLoot(): void {
  const grid = el('loot-grid');
  grid.innerHTML = '';
  hideItemTooltip(); // a re-render discards the slots; drop any popup anchored to an old one
  const drops = (Object.entries(lootDrops ?? {}).filter(([id, n]) => (n ?? 0) > 0 && !!ITEMS[id as ItemId])) as [ItemId, number][];
  if (drops.length === 0) {
    grid.innerHTML = `<div class="col-empty">${t.loot.empty}</div>`;
    return;
  }
  for (const [item, n] of drops) {
    const def = ITEMS[item];
    const slot = document.createElement('div');
    slot.className = 'inv-slot filled loot-slot';
    slot.setAttribute('data-testid', `loot-take-${item}`);
    slot.setAttribute('aria-label', `${def.name} × ${n} — ${def.desc}`);
    slot.addEventListener('mouseenter', () => showItemTooltip(item, slot));
    slot.addEventListener('mouseleave', hideItemTooltip);
    const icon = document.createElement('img');
    icon.className = 'inv-icon';
    icon.src = itemIcon(item);
    icon.alt = def.name;
    icon.draggable = false;
    slot.appendChild(icon);
    if (n > 1) {
      const badge = document.createElement('span');
      badge.className = 'inv-count';
      badge.textContent = n > 999 ? '999+' : String(n);
      slot.appendChild(badge);
    }
    slot.onclick = () => {
      hideItemTooltip();
      bus.emit('loot-take', item, n);
    };
    grid.appendChild(slot);
  }
}

/**
 * The Village contribution panel (ADR-0010): one slider per accepted item the
 * Player carries, so they pick how much of each to pour into the pool instead of
 * always giving everything. The live point total and the Give button update as
 * the sliders move; choosing nothing disables Give.
 */
function renderVillageGive(): void {
  const box = el('village-give-rows');
  box.innerHTML = '';
  const items = (Object.keys(villageGiveHeld) as ItemId[]).filter((id) => (villageGiveHeld[id] ?? 0) > 0 && !!ITEMS[id]);
  if (items.length === 0) {
    box.innerHTML = `<div class="col-empty">${t.villageGive.nothing}</div>`;
    updateVillageGiveTotal();
    return;
  }
  for (const id of items) {
    const held = villageGiveHeld[id] ?? 0;
    const per = VILLAGE_CONTRIB[id] ?? 0;
    const row = document.createElement('div');
    row.className = 'vgive-row';
    const icon = document.createElement('img');
    icon.className = 'inv-icon';
    icon.src = itemIcon(id);
    icon.alt = ITEMS[id].name;
    icon.draggable = false;
    const name = document.createElement('span');
    name.className = 'vgive-name';
    name.textContent = ITEMS[id].name;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(held);
    slider.step = '1';
    slider.value = String(Math.min(held, villageGiveChosen[id] ?? 0));
    slider.className = 'vgive-slider';
    slider.setAttribute('data-testid', `vgive-slider-${id}`);
    const count = document.createElement('span');
    count.className = 'vgive-count';
    const pts = document.createElement('span');
    pts.className = 'vgive-pts';
    const paint = () => {
      const chosen = Number(slider.value);
      villageGiveChosen[id] = chosen;
      count.textContent = `${chosen}/${held}`;
      pts.textContent = t.villageGive.pts(chosen * per);
    };
    slider.addEventListener('input', () => {
      paint();
      updateVillageGiveTotal();
    });
    paint();
    row.append(icon, name, slider, count, pts);
    box.appendChild(row);
  }
  updateVillageGiveTotal();
}

/** live total points readout + enable/disable the Give button */
function updateVillageGiveTotal(): void {
  let total = 0;
  for (const id of Object.keys(villageGiveChosen) as ItemId[]) {
    total += (villageGiveChosen[id] ?? 0) * (VILLAGE_CONTRIB[id] ?? 0);
  }
  el('village-give-total').textContent = t.villageGive.total(total);
  (el<HTMLButtonElement>('village-give-confirm')).disabled = total <= 0;
}

function renderSawmill(): void {
  if (!openSawmillId || !sawmill) return;
  const sinceOpen = Date.now() - sawmillOpenedAt;
  const next = sawmill.nextPlankMs === null ? null : Math.max(0, sawmill.nextPlankMs - sinceOpen);
  const parts = [t.sawmill.milling(sawmill.wood), t.sawmill.ready(sawmill.ready)];
  if (next !== null) parts.push(t.sawmill.next(Math.ceil(next / 1000)));
  el('sawmill-status').textContent = parts.join(' · ');
  // when the countdown runs out, re-derive fresh state from the backend
  // (lazy timestamps — nothing ticks server-side)
  if (next === 0 && Date.now() >= sawmillRefreshAt) {
    sawmillRefreshAt = Date.now() + 1500;
    bus.emit('sawmill-refresh', openSawmillId);
  }
}

function renderRefiner(): void {
  if (!openRefiner || !refiner) return;
  const sinceOpen = Date.now() - refinerOpenedAt;
  const next = refiner.nextMs === null ? null : Math.max(0, refiner.nextMs - sinceOpen);
  const input = ITEMS[openRefiner.cfg.inputItem].name;
  const output = ITEMS[openRefiner.cfg.outputItem].name;
  const parts = [t.refiner.refining(refiner.input, input), t.refiner.ready(refiner.ready, output)];
  if (next !== null) parts.push(t.refiner.next(Math.ceil(next / 1000), output));
  el('refiner-status').textContent = parts.join(' · ');
  // when the countdown runs out, re-derive fresh state from the backend
  // (lazy timestamps — nothing ticks server-side)
  if (next === 0 && Date.now() >= refinerRefreshAt) {
    refinerRefreshAt = Date.now() + 1500;
    bus.emit('refiner-refresh', openRefiner);
  }
}

async function initMinimap(): Promise<void> {
  const canvas = el<HTMLCanvasElement>('minimap');
  const ctx = canvas.getContext('2d')!;
  const mapJson = await (await fetch(asset('/map/jungle-map.json'))).json();
  // v2 landmarks (Seal monument, Guardian) are marked on the minimap; the full
  // world map (M) also draws every Zone's border + name so a Player can locate a
  // named region like "The Cavern Mouth".
  const worldData = (await (await fetch(asset('/map/world-data.json'))).json()) as {
    sealMonument: { tx: number; ty: number };
    guardianHome: { tx: number; ty: number };
    zones: { name: string; x: number; y: number; w: number; h: number; dangerous?: boolean }[];
  };
  const ground = (mapJson.layers as { name: string; data: number[] }[]).find((l) => l.name === 'ground')!.data;
  const W = mapJson.width as number;
  const H = mapJson.height as number;
  // gid -> minimap color (terrain slots; overlays fall back to grass)
  const colors: Record<number, string> = {
    1: '#2f6b36', 2: '#2b6cb0', 3: '#a87848', 4: '#94785c', 5: '#4a5d2a',
    6: '#6b6b6b', 7: '#9aa0a8', 8: '#2f6b36', 9: '#2f6b36', 10: '#337038', 11: '#337038',
    // the Sunken Mire strip (tile ids 11+): peat, black water, mud, flagstone
    12: '#332f20', 13: '#332f20', 14: '#332f20', 15: '#152527', 16: '#3a3122', 17: '#4a5348',
  };
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  const bctx = bg.getContext('2d')!;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      bctx.fillStyle = colors[ground[y * W + x]] ?? '#2f6b36';
      bctx.fillRect(x, y, 1, 1);
    }
  }
  // A second bake in a PARCHMENT palette for the full-screen World Map (M): land in
  // aged gold, water in muted ocean-tan, rock/mire in browns — a treasure-map look.
  // Per-tile grain keeps it from reading flat.
  const parchCol: Record<number, [number, number, number]> = {
    1: [201, 168, 98], 5: [174, 142, 74], 8: [201, 168, 98], 9: [201, 168, 98], 10: [190, 158, 88], 11: [190, 158, 88],
    2: [146, 170, 160], 15: [108, 134, 126], // water → ocean parchment
    3: [196, 162, 110], 4: [178, 150, 100], 16: [150, 128, 84], // dirt/path
    6: [176, 162, 138], 7: [190, 176, 150], 17: [156, 148, 126], // rock/stone
    12: [140, 122, 78], 13: [140, 122, 78], 14: [140, 122, 78], // mire peat
  };
  // biome CLASS per gid, so same-biome shade variants never dither against each
  // other: 0 grass/land, 1 water, 2 dirt/path, 3 rock, 4 mire peat
  const classOf = (gid: number): number =>
    gid === 2 || gid === 15 ? 1
    : gid === 3 || gid === 4 || gid === 16 ? 2
    : gid === 6 || gid === 7 || gid === 17 ? 3
    : gid === 12 || gid === 13 || gid === 14 ? 4
    : 0;
  const parch = document.createElement('canvas');
  parch.width = W;
  parch.height = H;
  const parchImg = parch.getContext('2d')!.createImageData(W, H);
  const pd0 = parchImg.data;
  const cl0 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const baseAt = (x: number, y: number): [number, number, number] => parchCol[ground[y * W + x]] ?? [201, 168, 98];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = (((x * 73856093) ^ (y * 19349663)) >>> 0); // the bake's deterministic hash
      let c = baseAt(x, y);
      // hand-inked coastlines: a tile bordering another biome class dithers into
      // the neighbour's colour (full swap or 50/50 blend, hash-chosen), so every
      // straight fillRect border wobbles once the bake is smoothed up to screen
      // scale. A lower-rate second rank widens the wobble to ~2 tiles.
      const myClass = classOf(ground[y * W + x]);
      const pick = (h >> 4) & 3;
      let nb: [number, number, number] | null = null;
      for (let k = 0; k < 4 && !nb; k++) {
        const [nx, ny] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]][(k + pick) % 4];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (classOf(ground[ny * W + nx]) !== myClass) nb = baseAt(nx, ny);
      }
      if (nb) {
        if (h % 3 === 0) c = nb;
        else if (h % 3 === 1) c = [(c[0] + nb[0]) >> 1, (c[1] + nb[1]) >> 1, (c[2] + nb[2]) >> 1];
      } else if (h % 5 === 0) {
        for (let k = 0; k < 4 && !nb; k++) {
          const [nx, ny] = [[x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]][(k + pick) % 4];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (classOf(ground[ny * W + nx]) !== myClass) nb = baseAt(nx, ny);
        }
        if (nb) c = [(c[0] + nb[0]) >> 1, (c[1] + nb[1]) >> 1, (c[2] + nb[2]) >> 1];
      }
      const n = (h % 15) - 7; // deterministic ±7 grain
      const i4 = (y * W + x) * 4;
      pd0[i4] = cl0(c[0] + n);
      pd0[i4 + 1] = cl0(c[1] + n);
      pd0[i4 + 2] = cl0(c[2] + n * 0.6);
      pd0[i4 + 3] = 255;
    }
  }
  parch.getContext('2d')!.putImageData(parchImg, 0, 0);
  // ADR-0017: the minimap renders a VIEW rect — the pinned pre-Realm World, or
  // (inside a Realm) the district's own rect alone, so each Realm reads as its
  // own small map. GameScene ships the active district rect on the 'pos' event.
  type MiniView = { x: number; y: number; w: number; h: number };
  type MiniPos = { x: number; y: number; others: { x: number; y: number }[]; view?: MiniView };
  const worldView: MiniView = { x: 0, y: 0, w: Math.min(W, WORLD_VIEW_W), h: Math.min(H, WORLD_VIEW_H) };
  let lastPos: MiniPos | undefined;
  const draw = (pos?: MiniPos) => {
    if (pos) lastPos = pos;
    const view = pos?.view ?? worldView;
    // letterbox the view into the canvas (district rects are rarely square)
    const scale = Math.min(canvas.width / view.w, canvas.height / view.h); // canvas px per tile
    const offX = (canvas.width - view.w * scale) / 2;
    const offY = (canvas.height - view.h * scale) / 2;
    /** world px → canvas px */
    const toX = (wx: number) => offX + (wx / 16 - view.x) * scale;
    const toY = (wy: number) => offY + (wy / 16 - view.y) * scale;
    /** overlays only draw when their tile lies inside the visible view */
    const inView = (tx: number, ty: number) => tx >= view.x && tx < view.x + view.w && ty >= view.y && ty < view.y + view.h;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b130d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, view.x, view.y, view.w, view.h, offX, offY, view.w * scale, view.h * scale);
    // static v2 landmarks: violet = the Seal monument, dark red = the Guardian
    if (inView(worldData.sealMonument.tx, worldData.sealMonument.ty)) {
      ctx.fillStyle = '#b478ff';
      ctx.fillRect(toX(worldData.sealMonument.tx * 16) - 2, toY(worldData.sealMonument.ty * 16) - 2, 4, 4);
    }
    if (inView(worldData.guardianHome.tx, worldData.guardianHome.ty)) {
      ctx.fillStyle = '#c03a2b';
      ctx.fillRect(toX((worldData.guardianHome.tx + 1.5) * 16) - 2, toY((worldData.guardianHome.ty + 1.5) * 16) - 2, 4, 4);
    }
    // unexplored chunks stay dark (landmarks hide until discovered; the
    // Players themselves and the treasure ✕ draw over the fog) — the chunk
    // layer is cropped to the same view (1 fog px = FOG_CHUNK tiles)
    if (fogLayer) {
      ctx.drawImage(fogLayer, view.x / FOG_CHUNK, view.y / FOG_CHUNK, view.w / FOG_CHUNK, view.h / FOG_CHUNK, offX, offY, view.w * scale, view.h * scale);
    }
    // ADR-0013: the Grand Monument beacon — a home-star on the Hall, drawn OVER the
    // fog so you can always find your way home (hidden while inside a Realm)
    if (village?.hall && inView(village.hall.tx, village.hall.ty)) {
      const hx = toX((village.hall.tx + 1) * 16);
      const hy = toY((village.hall.ty + 1) * 16);
      ctx.fillStyle = '#ffe9c9';
      ctx.beginPath();
      ctx.moveTo(hx, hy - 4);
      ctx.lineTo(hx + 1.4, hy - 1.4);
      ctx.lineTo(hx + 4, hy);
      ctx.lineTo(hx + 1.4, hy + 1.4);
      ctx.lineTo(hx, hy + 4);
      ctx.lineTo(hx - 1.4, hy + 1.4);
      ctx.lineTo(hx - 4, hy);
      ctx.lineTo(hx - 1.4, hy - 1.4);
      ctx.closePath();
      ctx.fill();
    }
    if (!pos) return;
    // player dots arrive pre-filtered to this view's region (GameScene)
    ctx.fillStyle = '#ffd166';
    for (const o of pos.others) ctx.fillRect(toX(o.x) - 1, toY(o.y) - 1, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(toX(pos.x) - 2, toY(pos.y) - 2, 4, 4);
    if (treasureLoc && inView(treasureLoc.tx, treasureLoc.ty)) {
      const cx = toX(treasureLoc.tx * 16);
      const cy = toY(treasureLoc.ty * 16);
      ctx.strokeStyle = '#ff5544';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 4);
      ctx.lineTo(cx + 4, cy + 4);
      ctx.moveTo(cx + 4, cy - 4);
      ctx.lineTo(cx - 4, cy + 4);
      ctx.stroke();
    }
  };
  draw();
  bus.on('pos', draw);

  // ---- the full-screen world map (M): the whole grid with every Zone's border
  // + name drawn OVER the fog, so a Player can find where a named region like
  // "The Cavern Mouth" lies even before discovering it.
  const big = el<HTMLCanvasElement>('worldmap-canvas');
  const bctx2 = big.getContext('2d')!;
  // the atlas splits into a STATIC bake (parchment, labels, landmark pins) and a
  // cheap LIVE layer (teammates + you), so the player dot glides at the 'pos'
  // stream's 300 ms cadence without re-rendering the parchment each tick
  const largeBase = document.createElement('canvas');
  const lbctx = largeBase.getContext('2d')!;
  let lToX = (wx: number): number => wx;
  let lToY = (wy: number): number => wy;
  let lView: MiniView = worldView;
  let baked = false; // the live layer must never draw off identity transforms
  /** landmark/player pin — small sepia-ringed dot (bake passes lbctx, live bctx2) */
  const pin = (c: CanvasRenderingContext2D, wx: number, wy: number, fill: string, rOuter = 4.5, rInner = 3) => {
    const x = lToX(wx);
    const y = lToY(wy);
    c.beginPath();
    c.arc(x, y, rOuter, 0, Math.PI * 2);
    c.fillStyle = 'rgba(58,38,18,0.92)';
    c.fill();
    c.beginPath();
    c.arc(x, y, rInner, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  };
  /** does world-px (wx,wy) lie inside the baked view? (a Realm-district position doesn't) */
  const pinInView = (wx: number, wy: number) =>
    wx / 16 >= lView.x && wx / 16 < lView.x + lView.w && wy / 16 >= lView.y && wy / 16 < lView.y + lView.h;
  const bakeLarge = (): void => {
    const side = Math.max(240, Math.min(window.innerWidth - 64, window.innerHeight - 140));
    big.width = side; // (clears the canvas — sizes live only here, never in the live blit)
    big.height = side;
    largeBase.width = side;
    largeBase.height = side;
    // the World proper only — the Realm districts (Sunken Mire, Hushdark, Green
    // Terraces) are their own small maps behind their gates (ADR-0017 §2) and
    // must never leak onto the atlas (the locked-Hushdark playtest report)
    const view = worldView;
    lView = view;
    const scale = Math.min(side / view.w, side / view.h);
    const offX = (side - view.w * scale) / 2;
    const offY = (side - view.h * scale) / 2;
    const toX = (wx: number) => offX + (wx / 16 - view.x) * scale;
    const toY = (wy: number) => offY + (wy / 16 - view.y) * scale;
    lToX = toX;
    lToY = toY;
    // 1) the parchment "ocean" base
    lbctx.fillStyle = '#d8c6a0';
    lbctx.fillRect(0, 0, side, side);
    // 2) the land — the parchment terrain bake (an atlas, not fogged)
    lbctx.imageSmoothingEnabled = true;
    lbctx.drawImage(parch, view.x, view.y, view.w, view.h, offX, offY, view.w * scale, view.h * scale);
    // 2b) scattered terrain glyphs — classic-atlas texture (carets on rock, waves
    // on water, tufts on jungle) so the eye reads terrain fill, not border lines.
    // Hash-scattered on a coarse grid, only where a 2x2 patch is one biome class.
    lbctx.strokeStyle = 'rgba(74,47,22,0.30)';
    lbctx.lineWidth = 1;
    for (let gy = view.y; gy < view.y + view.h - 1; gy += 7) {
      for (let gx = view.x; gx < view.x + view.w - 1; gx += 7) {
        const h = (((gx * 73856093) ^ (gy * 19349663)) >>> 0);
        if (h % 4 !== 0) continue;
        const cls = classOf(ground[gy * W + gx]);
        if (
          classOf(ground[gy * W + gx + 1]) !== cls ||
          classOf(ground[(gy + 1) * W + gx]) !== cls ||
          classOf(ground[(gy + 1) * W + gx + 1]) !== cls
        ) continue;
        const px = toX(gx * 16) + (((h >> 8) % 3) - 1);
        const py = toY(gy * 16) + (((h >> 10) % 3) - 1);
        lbctx.beginPath();
        if (cls === 3) { // rock: a caret peak
          lbctx.moveTo(px - 3, py + 2); lbctx.lineTo(px, py - 3); lbctx.lineTo(px + 3, py + 2);
        } else if (cls === 1) { // water: a short wave
          lbctx.moveTo(px - 3, py); lbctx.quadraticCurveTo(px, py - 3, px + 3, py);
        } else if (cls === 4) { // mire peat: a flat dash
          lbctx.moveTo(px - 2, py); lbctx.lineTo(px + 2, py);
        } else if (cls === 0) { // jungle: two tuft ticks
          lbctx.moveTo(px - 2, py + 2); lbctx.lineTo(px - 1, py - 1);
          lbctx.moveTo(px + 1, py + 2); lbctx.lineTo(px + 2, py - 1);
        } else {
          continue; // dirt/path stays clean
        }
        lbctx.stroke();
      }
    }
    // 3) faint horizontal striations — that aged-map paper grain
    lbctx.strokeStyle = 'rgba(84,56,26,0.045)';
    lbctx.lineWidth = 1;
    for (let y = 2; y < side; y += 3) {
      lbctx.beginPath();
      lbctx.moveTo(0, y + 0.5);
      lbctx.lineTo(side, y + 0.5);
      lbctx.stroke();
    }
    // 4) vignette — worn, darkened edges
    const vg = lbctx.createRadialGradient(side / 2, side / 2, side * 0.34, side / 2, side / 2, side * 0.74);
    vg.addColorStop(0, 'rgba(52,34,14,0)');
    vg.addColorStop(1, 'rgba(44,28,10,0.5)');
    lbctx.fillStyle = vg;
    lbctx.fillRect(0, 0, side, side);
    // 5) landmark pins — small sepia-ringed dots (Seal, Guardian, Hall)
    pin(lbctx, worldData.sealMonument.tx * 16, worldData.sealMonument.ty * 16, '#8a5fc0');
    pin(lbctx, (worldData.guardianHome.tx + 1.5) * 16, (worldData.guardianHome.ty + 1.5) * 16, '#b23a2b');
    if (village?.hall) pin(lbctx, (village.hall.tx + 1) * 16, (village.hall.ty + 1) * 16, '#e6c063');
    // 6) region names — elegant serif "small-caps" (uppercased) in sepia ink on a
    //    cream halo, no boxes (a fantasy atlas). Long names wrap to two balanced
    //    lines; colliding labels nudge down so every region stays legible.
    const ptx = lastPos ? lastPos.x / 16 : -1;
    const pty = lastPos ? lastPos.y / 16 : -1;
    const font = Math.max(11, Math.round(side / 40));
    const lineH = font * 1.04;
    lbctx.textAlign = 'center';
    lbctx.textBaseline = 'middle';
    lbctx.font = `600 ${font}px Georgia, 'Times New Roman', serif`;
    lbctx.lineJoin = 'round';
    try {
      (lbctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.max(1, Math.round(font * 0.1))}px`;
    } catch {
      /* letterSpacing unsupported on this canvas — harmless */
    }
    const maxW = side * 0.24;
    const splitLabel = (txt: string): string[] => {
      if (lbctx.measureText(txt).width <= maxW) return [txt];
      const words = txt.split(' ');
      if (words.length < 2) return [txt];
      let best = 1;
      let bestDiff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ');
        const b = words.slice(i).join(' ');
        const diff = Math.abs(lbctx.measureText(a).width - lbctx.measureText(b).width);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      }
      return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    };
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const overlaps = (r: { x0: number; y0: number; x1: number; y1: number }) =>
      placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
    for (const z of worldData.zones) {
      // an off-view zone (a Realm district below the World) must be SKIPPED, not
      // clamped — the edge clamp below would otherwise pin "THE HUSHDARK" onto
      // the bottom border and leak the locked Realm's existence
      if (z.x >= view.x + view.w || z.y >= view.y + view.h || z.x + z.w <= view.x || z.y + z.h <= view.y) continue;
      const here = ptx >= z.x && ptx < z.x + z.w && pty >= z.y && pty < z.y + z.h;
      const lines = splitLabel(zoneName(z.name).toUpperCase());
      const tw = Math.max(...lines.map((l) => lbctx.measureText(l).width));
      const th = lines.length * lineH;
      const halfW = tw / 2 + 3;
      const halfH = th / 2 + 2;
      const lx = Math.max(halfW + 2, Math.min(side - halfW - 2, toX((z.x + z.w / 2) * 16)));
      let ly = Math.max(halfH + 4, Math.min(side - halfH - 4, toY((z.y + z.h / 2) * 16)));
      const rect = () => ({ x0: lx - halfW, y0: ly - halfH, x1: lx + halfW, y1: ly + halfH });
      for (let tries = 0; tries < 7 && overlaps(rect()); tries++) ly += th + 4;
      ly = Math.min(ly, side - halfH - 4);
      placed.push(rect());
      lines.forEach((line, i) => {
        const y = ly - th / 2 + lineH / 2 + i * lineH;
        lbctx.strokeStyle = 'rgba(245,233,203,0.92)'; // cream halo
        lbctx.lineWidth = 4;
        lbctx.strokeText(line, lx, y);
        lbctx.fillStyle = here ? '#7c3d12' : z.dangerous ? '#6b3018' : '#4a2f16'; // sepia ink
        lbctx.fillText(line, lx, y);
      });
    }
    try {
      (lbctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    } catch {
      /* */
    }
    // 7) the treasure ✕ (bake-time, like the landmark pins)
    if (treasureLoc) {
      const cx = toX(treasureLoc.tx * 16);
      const cy = toY(treasureLoc.ty * 16);
      lbctx.strokeStyle = '#a52a1a';
      lbctx.lineWidth = 3;
      lbctx.beginPath();
      lbctx.moveTo(cx - 6, cy - 6); lbctx.lineTo(cx + 6, cy + 6);
      lbctx.moveTo(cx + 6, cy - 6); lbctx.lineTo(cx - 6, cy + 6);
      lbctx.stroke();
    }
  };
  // the live layer: blit the bake, then teammates (gold pins) and you (a ringed
  // white dot). Runs on every 'pos' tick while the map is open — one drawImage +
  // a few arcs. Positions inside a Realm district fall outside the cropped view
  // and are skipped (the atlas charts the World only).
  const drawLargeLive = (): void => {
    if (!baked) return;
    bctx2.drawImage(largeBase, 0, 0);
    if (!lastPos) return;
    for (const o of lastPos.others) if (pinInView(o.x, o.y)) pin(bctx2, o.x, o.y, '#e0b64a', 4, 2.6);
    if (pinInView(lastPos.x, lastPos.y)) pin(bctx2, lastPos.x, lastPos.y, '#ffffff', 5, 3.3);
  };
  const drawLarge = (): void => {
    bakeLarge();
    baked = true;
    drawLargeLive();
  };
  drawWorldMap = drawLarge;
  // the overlay may already be open (M pressed while the map JSONs were still
  // fetching — drawWorldMap was null then and the canvas stayed blank)
  if (el('worldmap-overlay').classList.contains('open')) drawLarge();
  // the 300 ms 'pos' stream drives the live dot while the map is open
  bus.on('pos', () => {
    if (el('worldmap-overlay').classList.contains('open')) drawLargeLive();
  });
  window.addEventListener('resize', () => {
    if (el('worldmap-overlay').classList.contains('open')) drawLarge();
  });
}

function togglePanel(id: string): void {
  el(id).classList.toggle('open');
}

// ---------------------------------------------------------------- audio settings
/** the four mixer channels, in display order (see config.ts AUDIO_CHANNELS) */
const VOLUME_CHANNELS: { id: AudioChannel; label: string }[] = [
  { id: 'master', label: t.volume.master },
  { id: 'ambience', label: t.volume.ambience },
  { id: 'music', label: t.volume.music },
  { id: 'sfx', label: t.volume.sfx },
];

/**
 * Build the volume sliders from the saved mix. Each slider streams its value to
 * GameScene (which owns the Phaser mixer and persistence) as it is dragged.
 */
function renderSettings(): void {
  const box = el('settings-sliders');
  box.innerHTML = '';
  const vols = loadVolumes();
  for (const ch of VOLUME_CHANNELS) {
    const pct = Math.round(vols[ch.id] * 100);
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = `
      <label for="vol-${ch.id}">${ch.label}</label>
      <input type="range" id="vol-${ch.id}" data-testid="vol-${ch.id}" min="0" max="100" step="1" value="${pct}" />
      <span class="settings-val" id="vol-val-${ch.id}">${pct}%</span>
    `;
    box.appendChild(row);
    const slider = row.querySelector('input') as HTMLInputElement;
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      el(`vol-val-${ch.id}`).textContent = `${v}%`;
      bus.emit('set-volume', ch.id, v / 100);
    });
  }
}

/**
 * The HUD objective tracker: a chain of phases, each shown until complete, all
 * ticking purely off state the HUD already holds (no new persistence, ADR-0001):
 * **The Journey** (onboarding) → **Into the Delve** (ADR-0007) → the Warden
 * ladder rungs **Mire → Hushdark → Terraces** (ADR-0017) → **The Legacy**
 * (Village growth, the Deep's boss, the Reverberant). Only when every phase is
 * complete does the panel disappear.
 */
function renderTrackerRows(steps: { id: string; label: string }[], done: (i: number) => boolean): void {
  const box = el('journey-steps');
  box.innerHTML = '';
  let currentMarked = false;
  steps.forEach((step, i) => {
    const isDone = done(i);
    const current = !isDone && !currentMarked;
    if (current) currentMarked = true;
    const row = document.createElement('div');
    row.className = 'journey-step' + (isDone ? ' done' : current ? ' current' : '');
    row.setAttribute('data-testid', `journey-${step.id}`);
    row.textContent = `${isDone ? '✓' : current ? '▸' : '○'} ${step.label}`;
    box.appendChild(row);
  });
}

function renderJourney(): void {
  const panel = el('journey-panel');
  const title = el('journey-title');
  // Phase 1 — onboarding: The Journey, until its last step (first Seal Offering)
  if (journey && !journeyComplete(journey)) {
    panel.classList.add('open');
    title.textContent = t.panels.journey;
    renderTrackerRows(JOURNEY_STEPS, (i) => !!journey!.steps[JOURNEY_STEPS[i].id]);
    return;
  }
  // Phase 2 — the road to the Delve, once The Journey is done
  const prog = { seal, inventory: inv, quest, sawmillBuilt, village, equipped: equippedGear };
  if (journey && !delveQuestComplete(prog)) {
    panel.classList.add('open');
    title.textContent = t.panels.intoDelve;
    renderTrackerRows(DELVE_QUEST_STEPS, (i) => DELVE_QUEST_STEPS[i].done(prog));
    return;
  }
  // Phases 3–5 (ADR-0017) — the Warden ladder, one rung at a time. The chain
  // itself gates Chapter 2: these only appear once Into the Delve is complete
  // (Guardian bested + descended). Steps proven by held items can un-tick if
  // the item is pooled/crated — the accepted best_guardian idiom.
  const wprog = { inventory: inv, wardens, equipped: equippedGear };
  if (journey && !mireQuestComplete(wprog)) {
    panel.classList.add('open');
    title.textContent = t.panels.mire;
    renderTrackerRows(MIRE_QUEST_STEPS, (i) => MIRE_QUEST_STEPS[i].done(wprog));
    return;
  }
  if (journey && !hushdarkQuestComplete(wprog)) {
    panel.classList.add('open');
    title.textContent = t.panels.hushdark;
    renderTrackerRows(HUSHDARK_QUEST_STEPS, (i) => HUSHDARK_QUEST_STEPS[i].done(wprog));
    return;
  }
  if (journey && !terraceQuestComplete(wprog)) {
    panel.classList.add('open');
    title.textContent = t.panels.terrace;
    renderTrackerRows(TERRACE_QUEST_STEPS, (i) => TERRACE_QUEST_STEPS[i].done(wprog));
    return;
  }
  // Phase 6 — the Legacy capstone: Village growth, the Deep's boss, the Reverberant
  const lprog = { inventory: inv, village, equipped: equippedGear };
  if (journey && !legacyQuestComplete(lprog)) {
    panel.classList.add('open');
    title.textContent = t.panels.legacy;
    renderTrackerRows(LEGACY_QUEST_STEPS, (i) => LEGACY_QUEST_STEPS[i].done(lprog));
    return;
  }
  panel.classList.remove('open'); // every arc done (or not joined yet)
}

/** 📜 read/total (derived from world data) · 🗺 pieces · ⛩ Seal progress */
function renderQuestLabel(): void {
  const parts: string[] = [];
  if (quest) {
    parts.push(`📜 ${quest.tabletsRead.length}/${quest.tabletsTotal}`);
    parts.push(`🗺 ${Math.min(quest.mapPieces, 3)}/3${quest.mapPieces >= 3 ? t.quest.digHint : ''}`);
  }
  if (seal) {
    if (seal.broken) parts.push(t.quest.sealOpen);
    else {
      let done = 0;
      let total = 0;
      for (const res of SEAL_BAR_ORDER) {
        done += Math.min(seal.contributed[res], seal.quotas[res]);
        total += seal.quotas[res];
      }
      parts.push(`⛩ ${Math.floor((done / total) * 100)}%`);
    }
  }
  if (parts.length) el('quest-label').textContent = parts.join(' · ');
}

function renderSealBars(): void {
  if (!seal) return;
  const box = el('seal-bars');
  box.innerHTML = '';
  for (const res of SEAL_BAR_ORDER) {
    const have = Math.min(seal.contributed[res], seal.quotas[res]);
    const quota = seal.quotas[res];
    const row = document.createElement('div');
    row.className = 'seal-row';
    row.setAttribute('data-testid', `seal-${res}`);
    row.innerHTML = `
      <span class="seal-name">${ITEMS[res].name}</span>
      <div class="seal-bar"><div class="seal-fill" style="width:${(have / quota) * 100}%"></div></div>
      <span class="seal-count">${have}/${quota}</span>
    `;
    box.appendChild(row);
  }
  el('seal-hint').textContent = seal.broken ? t.seal.broken : t.seal.hint;
}

/** a Warden altar's Offering bars (ADR-0017) — the Seal-bar rendering, per rung */
function renderWardenBars(): void {
  const id = wardenPanelId;
  if (!id) return;
  const altar = wardenAltars[id];
  el('warden-title').textContent = t.wardenAltar.title(t.warden.name(id));
  const box = el('warden-bars');
  box.innerHTML = '';
  if (!altar) return;
  for (const [item, quota] of Object.entries(altar.quotas)) {
    const have = Math.min(altar.contributed[item] ?? 0, quota);
    const row = document.createElement('div');
    row.className = 'seal-row';
    row.setAttribute('data-testid', `warden-${item}`);
    row.innerHTML = `
      <span class="seal-name">${ITEMS[item as ItemId]?.name ?? item}</span>
      <div class="seal-bar"><div class="seal-fill" style="width:${(have / quota) * 100}%"></div></div>
      <span class="seal-count">${have}/${quota}</span>
    `;
    box.appendChild(row);
  }
  el('warden-hint').textContent = altar.broken ? t.wardenAltar.broken : t.wardenAltar.hint;
}

/**
 * The Village tier panel (ADR-0010): the prestige badge, the additive pool bar to
 * the next threshold, and the milestone the group must raise in-zone to advance.
 * Collective-only — no individual contribution ever appears here.
 */
/** the Grand Monument's engraved board: Deepest Descents / By Player (ADR-0015) */
function renderRecords(): void {
  el('records-tab-descents').classList.toggle('active', recordsTab === 'descents');
  el('records-tab-players').classList.toggle('active', recordsTab === 'players');
  const list = el('records-list');
  list.innerHTML = '';
  const r = depthRecords;
  const rows =
    recordsTab === 'descents'
      ? (r?.descents ?? []).slice(0, 10).map((d) => ({ label: d.roster.join(', '), depth: d.depth, at: d.achievedAt }))
      : (r?.bests ?? []).slice(0, 10).map((b) => ({ label: b.name, depth: b.depth, at: b.achievedAt }));
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'records-empty';
    empty.textContent = t.records.empty;
    list.append(empty);
    return;
  }
  rows.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'records-row';
    const rank = document.createElement('span');
    rank.className = 'records-rank';
    rank.textContent = `${i + 1}.`;
    const depth = document.createElement('b');
    depth.className = 'records-depth';
    depth.textContent = t.records.depth(row.depth);
    const who = document.createElement('span');
    who.className = 'records-who';
    who.textContent = row.label;
    const when = document.createElement('span');
    when.className = 'records-when';
    when.textContent = new Date(row.at).toLocaleDateString();
    div.append(rank, depth, who, when);
    list.append(div);
  });
}

function renderVillagePanel(): void {
  // the Depth Record teaser renders even before the Village data arrives —
  // records accrue from the first Descent, Monument or no Monument (ADR-0015)
  const teaser = el('village-record');
  if (teaser) teaser.textContent = depthTeaser ? t.village.record(depthTeaser.depth, depthTeaser.roster.join(', ')) : t.village.recordNone;
  if (!village) return;
  const tier = village.tier;
  el('village-tier').innerHTML = `<b>${t.village.tierName(tier)}</b> <span class="v-title">${t.village.tierTitle(tier)}</span>`;
  if (tier >= VILLAGE_MAX_TIER) {
    el('village-fill').style.width = '100%';
    el('village-pool').textContent = `${t.village.poolLabel}: ${village.pool}`;
    el('village-milestone').textContent = t.village.capital;
    return;
  }
  const next = tierThreshold(tier + 1);
  el('village-fill').style.width = `${next > 0 ? Math.min(100, (village.pool / next) * 100) : 100}%`;
  el('village-pool').textContent = `${t.village.poolLabel}: ${village.pool} / ${next}`;
  const ms = milestoneForTier(tier + 1);
  const msName = ms ? ITEMS[ms].name : '';
  const built = village.milestonesBuilt > tier;
  el('village-milestone').textContent = built ? t.village.milestoneDone(msName) : t.village.milestoneTodo(msName);
}

function setFightHp(hp: number, max: number): void {
  // the fill is a scale-invariant ratio; the readout numbers are cosmetically
  // scaled up (the same factor the damage float uses, ADR-0006 §5)
  const s = GUARDIAN_DISPLAY_SCALE;
  el('fight-hpfill').style.width = `${Math.max(0, (hp / max) * 100)}%`;
  el('fight-title').textContent = fightTitle
    ? t.fight.wardenHp(fightTitle, Math.max(0, hp) * s, max * s)
    : t.fight.guardianHp(Math.max(0, hp) * s, max * s);
}

let bannerTimer: number | undefined;
function setZone(zone: string): void {
  const label = zoneName(zone);
  el('zone-label').textContent = label;
  const banner = el('zone-banner');
  banner.textContent = label;
  banner.style.opacity = '1';
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (banner.style.opacity = '0'), 2200);
}

function appendChat(msg: ChatMsg): void {
  const box = el('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg' + (msg.from === meName ? ' mine' : '');
  const b = document.createElement('b');
  b.textContent = msg.from + ': ';
  div.appendChild(b);
  div.appendChild(document.createTextNode(msg.text));
  box.appendChild(div);
  while (box.children.length > 100) box.removeChild(box.firstChild!);
  box.scrollTop = box.scrollHeight;
}

function toast(text: string, kind: 'info' | 'good' | 'bad'): void {
  const box = el('toasts');
  const div = document.createElement('div');
  div.className = 'toast' + (kind !== 'info' ? ' ' + kind : '');
  div.textContent = text;
  box.appendChild(div);
  window.setTimeout(() => div.remove(), 3200);
}

// ---------------------------------------------------------------- slot inventory

/** 6 columns × 3 rows — a compact pack (extra item kinds spill into more rows) */
const INV_COLS = 6;
const INV_SLOTS = 18;
/** slot → item; the Player's arrangement, a purely cosmetic UI preference */
let invOrder: (ItemId | null)[] = [];
let invSelected: ItemId | null = null;
/** the armed Drop button awaiting its confirming second click (null = disarmed) */
let dropArm: { id: ItemId; all: boolean } | null = null;

const invOrderKey = () => `jungle-world:invorder:${meName}`;

function loadInvOrder(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(invOrderKey()) ?? '[]') as unknown;
    invOrder = Array.isArray(parsed) ? (parsed as (ItemId | null)[]).slice(0, INV_SLOTS) : [];
  } catch {
    invOrder = [];
  }
  while (invOrder.length < INV_SLOTS) invOrder.push(null);
}

function saveInvOrder(): void {
  localStorage.setItem(invOrderKey(), JSON.stringify(invOrder));
}

// ---------------------------------------------------------------- v4: the Loadout

/** five uniform quick-slots (keys 1–5): each is a REFERENCE to a bag item, and
 *  any Tool — weapons included — sits in any slot (the 2026-07-17 unification;
 *  the dedicated MOVE-semantics weapon cells are gone, weapons live in the bag
 *  like every other Tool) */
const LOADOUT_SLOTS = 5;
let loadout: (ItemId | null)[] = [null, null, null, null, null];
let loadoutSel = 0;
/** items the Player dragged OFF the hotbar back into the pack — the auto-seat
 *  must not bounce them straight back into the freed slot. Seating one again
 *  (drag/double-click) un-benches it. */
let benched = new Set<ItemId>();
/** one-shot guard: drain weapons a previous client left in the gear record */
let weaponMigrationDone = false;

const loadoutKey = () => `jungle-world:loadout:${meName}`;

function loadLoadout(): void {
  loadout = [null, null, null, null, null];
  loadoutSel = 0;
  benched = new Set();
  weaponMigrationDone = false;
  try {
    const parsed = JSON.parse(localStorage.getItem(loadoutKey()) ?? 'null') as
      | { slots?: (ItemId | null)[]; sel?: number; weapons?: (ItemId | null)[]; benched?: ItemId[] }
      | null;
    if (parsed && Array.isArray(parsed.benched)) {
      for (const id of parsed.benched) if (typeof id === 'string') benched.add(id);
    }
    if (parsed && Array.isArray(parsed.slots)) {
      for (let i = 0; i < LOADOUT_SLOTS; i++) loadout[i] = parsed.slots[i] ?? null;
    }
    // legacy save (3 tool slots + 2 weapon cells): the weapon cells become slots 4/5
    if (parsed && Array.isArray(parsed.weapons)) {
      loadout[3] = loadout[3] ?? parsed.weapons[0] ?? null;
      loadout[4] = loadout[4] ?? parsed.weapons[1] ?? null;
    }
    if (parsed && Number.isInteger(parsed.sel)) {
      loadoutSel = Math.max(0, Math.min(LOADOUT_SLOTS - 1, parsed.sel!));
    }
  } catch {
    /* corrupt entry — start empty */
  }
}

function saveLoadout(): void {
  localStorage.setItem(loadoutKey(), JSON.stringify({ slots: loadout, sel: loadoutSel, benched: [...benched] }));
}

/**
 * One-shot after join: weapons no longer live in the gear record (all five
 * quick-slots are bag references now) — release anything a previous client
 * version left in weapon1/weapon2 back to the bag, seating it into a free
 * quick-slot first so it stays on the hotbar while the unequip round-trips.
 */
function migrateWeaponSlots(): void {
  if (weaponMigrationDone || !invReady) return;
  weaponMigrationDone = true;
  (['weapon1', 'weapon2'] as WeaponSlot[]).forEach((slot) => {
    const id = equippedGear[slot];
    if (!id) return;
    if (!loadout.includes(id)) {
      const free = loadout.indexOf(null);
      if (free >= 0) loadout[free] = id;
    }
    bus.emit('weapon-slot-set', slot, null); // MOVE it back into the bag
  });
}

/** any owned Tool — weapons included — may sit in a quick-slot; drop unowned
 *  ones and auto-seat newly-owned ones. Ownership goes through gearOwns so a
 *  weapon still mid-migration out of the old gear record counts as owned. */
function reconcileLoadout(): void {
  // Before the first inventory snapshot the inv is empty; reconciling now would drop every
  // saved slot (nothing looks owned) and the following renderLoadout would persist the wipe.
  if (!invReady) return;
  const ownedTools = (Object.keys(ITEMS) as ItemId[]).filter(
    (id) => ITEMS[id].kind === 'tool' && gearOwns(inv, equippedGear, id),
  );
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    if (loadout[i] && !ownedTools.includes(loadout[i]!)) loadout[i] = null;
    // one reference per item — a legacy save could carry the same weapon twice
    // (the old gear cells legitimately held doubles); first occurrence wins
    if (loadout[i] && loadout.indexOf(loadout[i]!) < i) loadout[i] = null;
  }
  for (const id of [...benched]) if (!ownedTools.includes(id)) benched.delete(id); // no zombie benchings
  for (const id of ownedTools) {
    if (loadout.includes(id) || benched.has(id)) continue;
    const free = loadout.indexOf(null);
    if (free >= 0) loadout[free] = id;
  }
}

/** the currently in-hand item, or null when the selected slot is empty/unowned */
function heldItem(): ItemId | null {
  const id = loadout[loadoutSel];
  return id && gearOwns(inv, equippedGear, id) ? id : null;
}

/** tell GameScene which single item is in-hand (broadcast + used on hit RPCs) */
function emitHeld(): void {
  bus.emit('held', heldItem());
}

function selectLoadout(i: number): void {
  if (i < 0 || i >= LOADOUT_SLOTS) return;
  loadoutSel = i;
  saveLoadout();
  renderLoadout();
  emitHeld();
}

/** the two inventory drag payloads a quick-slot accepts (any Tool, any weapon) */
const LOADOUT_PAYLOADS = ['application/x-jw-tool', 'application/x-jw-weapon'];

function renderLoadout(): void {
  reconcileLoadout();
  saveLoadout();
  renderCharacter(); // the paperdoll's attributes track the held item
  const bar = el('loadout-bar');
  bar.innerHTML = '';
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const id = loadout[i];
    const slot = document.createElement('div');
    slot.className = 'loadout-slot' + (i === loadoutSel ? ' selected' : '') + (id ? ' filled' : '');
    slot.setAttribute('data-testid', `loadout-${i}`);
    const key = document.createElement('span');
    key.className = 'loadout-key';
    key.textContent = String(i + 1);
    slot.appendChild(key);
    if (id) {
      const icon = document.createElement('img');
      icon.className = 'inv-icon';
      icon.src = itemIcon(id);
      icon.alt = ITEMS[id].name;
      icon.draggable = false;
      slot.appendChild(icon);
      slot.title = t.inv.slotHold(ITEMS[id].name, i + 1);
      // slots drag like items: onto another slot to move (the dedup there
      // clears this one), onto the pack grid to unslot back into the bag view
      slot.draggable = true;
      slot.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('application/x-jw-unslot', String(i));
        e.dataTransfer!.setData(isWeapon(id) ? 'application/x-jw-weapon' : 'application/x-jw-tool', id);
        e.dataTransfer!.effectAllowed = 'move';
      });
    } else {
      slot.title = t.inv.slotEmpty(i + 1);
    }
    // every slot accepts every Tool from the bag (weapons ride their own drag
    // payload but seat exactly the same way — a reference, never a MOVE)
    slot.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).some((tp) => LOADOUT_PAYLOADS.includes(tp))) {
        e.preventDefault();
        slot.classList.add('drop');
      }
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drop');
      const dropped = (e.dataTransfer?.getData('application/x-jw-tool') ||
        e.dataTransfer?.getData('application/x-jw-weapon')) as ItemId;
      if (!dropped) return;
      const prev = loadout[i]; // whatever this slot referenced before the drop
      const fromRaw = e.dataTransfer?.getData('application/x-jw-unslot');
      if (fromRaw != null && fromRaw !== '') {
        // dragged FROM another quick-slot → SWAP the two slots (a plain move when
        // this one was empty). The old occupant lands in the drag's source slot,
        // so nothing auto-shuffles off to a surprise third place.
        const from = Number(fromRaw);
        if (from === i) return;
        loadout[i] = dropped;
        loadout[from] = prev;
      } else {
        // dragged FROM the pack → seat it here and send the bumped item BACK to
        // the pack (bench it so the auto-seat can't yank it into a free slot).
        // One reference per item: clear any other slot still holding the newcomer.
        for (let k = 0; k < LOADOUT_SLOTS; k++) if (loadout[k] === dropped) loadout[k] = null;
        loadout[i] = dropped;
        if (prev && prev !== dropped) benched.add(prev);
      }
      benched.delete(dropped); // deliberately seated — auto-seat may manage it again
      saveLoadout();
      renderLoadout();
      renderInventory(); // a bumped item now shows in the pack view again
      emitHeld();
    });
    slot.onclick = () => selectLoadout(i);
    bar.appendChild(slot);
  }
  // tell the game which kinds are on the quick-slots — they don't consume pack
  // capacity (the harvest pack-cap check exempts them)
  bus.emit(
    'loadout-kinds',
    loadout.filter((id): id is ItemId => !!id),
  );
}

// ------------------------------------------------------------ item hover popup
// A Path-of-Exile-style "Codex Card" shown while hovering an inventory slot:
// a rarity-tinted name, a kind subtitle and — for weapons that strike the
// Guardian (WEAPON_COMBAT) — a damage / crit / attack-speed / DPS stat block,
// closing with the item's flavour line. Replaces the old native `title` box.
type ItemRarity = 'fabled' | 'reward' | 'ancient' | 'basic';

/** three name colours: Delve/Deep rewards, tier-2 ancients, everything else */
function itemRarity(id: ItemId): ItemRarity {
  if (id === 'fabled_sword' || id === 'fabled_axe' || id === 'fabled_bow') return 'fabled';
  if (id === 'sword' || id === 'forgebrand') return 'reward';
  if (armorDef(id)) return 'reward'; // Warden-Realm Armor reads as a reward prize
  if (id === 'ancient_axe' || id === 'ancient_pickaxe') return 'ancient';
  return 'basic';
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** one "Label ……… value" stat row of the Codex Card */
function ttRow(label: string, value: string, cls: 'mod' | 'dps' = 'mod'): string {
  return `<div class="tt-row"><span class="tt-lbl">${escHtml(label)}</span><span class="tt-val tt-${cls}">${escHtml(value)}</span></div>`;
}

/** the Codex-Card markup for one inventory item */
function itemTooltipHtml(id: ItemId): string {
  const def = ITEMS[id];
  const rar = itemRarity(id);
  const combat = WEAPON_COMBAT[id as ToolId];
  const rarLabel = rar === 'fabled' ? t.weapon.rarFabled : rar === 'reward' ? t.weapon.rarReward : rar === 'ancient' ? t.weapon.rarAncient : t.weapon.rarBasic;
  const subtitle = combat ? `${rarLabel} ${t.weapon.weaponKind}` : t.inv.kind[def.kind];
  let stats = '';
  if (combat) {
    const p = weaponStatParts(id as ToolId);
    stats =
      '<div class="tt-div"></div><div class="tt-stats">' +
      ttRow(t.weapon.physDmg, p.band) +
      (p.canCrit
        ? ttRow(t.weapon.critChance, `${p.critPct}%`) + ttRow(t.weapon.critMult, `×${p.critMult.toFixed(1)}`)
        : ttRow(t.weapon.critChance, t.weapon.noCrit)) +
      ttRow(t.weapon.atkSpeed, p.aps) +
      ttRow(t.weapon.dpsFull, String(p.dps), 'dps') +
      '</div>';
  }
  // ADR-0017 §3: an Armor piece states its one attribute (+ worn state)
  const armor = armorDef(id);
  if (armor) {
    const rows: string[] = [];
    if (armor.moveSpeed > 0) rows.push(ttRow(t.armor.moveSpeed, `+${Math.round(armor.moveSpeed * 100)}%`));
    if (armor.attackSpeed > 0) rows.push(ttRow(t.armor.attackSpeed, `+${Math.round(armor.attackSpeed * 100)}%`));
    if (armor.bandMin > 0 || armor.bandMax > 0) {
      rows.push(ttRow(t.armor.band, `+${armor.bandMin * GUARDIAN_DISPLAY_SCALE}/+${armor.bandMax * GUARDIAN_DISPLAY_SCALE}`));
    }
    if (isEquipped(id)) rows.push(ttRow(t.armor.slot[armor.slot], t.armor.worn, 'dps'));
    stats = '<div class="tt-div"></div><div class="tt-stats">' + rows.join('') + '</div>';
  }
  return (
    `<div class="tt-card tt-rar-${rar}"><div class="tt-inner">` +
    `<div class="tt-head"><div class="tt-name">${escHtml(def.name)}</div><div class="tt-kind">${escHtml(subtitle)}</div></div>` +
    stats +
    '<div class="tt-div"></div>' +
    `<div class="tt-flavor">${escHtml(def.desc)}</div>` +
    '</div></div>'
  );
}

function showItemTooltip(id: ItemId, anchor: HTMLElement): void {
  const tip = el('item-tooltip');
  tip.innerHTML = itemTooltipHtml(id);
  tip.classList.add('show');
  tip.setAttribute('aria-hidden', 'false');
  positionItemTooltip(anchor); // measure only once it's laid out
}

function hideItemTooltip(): void {
  const tip = document.getElementById('item-tooltip');
  if (!tip) return;
  tip.classList.remove('show');
  tip.setAttribute('aria-hidden', 'true');
}

/** sit the popup beside the hovered slot — left of the right-docked pack, clamped on-screen */
function positionItemTooltip(anchor: HTMLElement): void {
  const tip = el('item-tooltip');
  const r = anchor.getBoundingClientRect();
  const gap = 10;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = r.left - tw - gap; // inventory panel is docked right → open to the left
  if (left < gap) left = r.right + gap; // no room? flip to the slot's right
  // clamp on-screen, lower bound last so a viewport narrower than the popup still
  // pins it to the left edge instead of running off it
  left = Math.max(gap, Math.min(left, window.innerWidth - tw - gap));
  const top = Math.max(gap, Math.min(r.top, window.innerHeight - th - gap));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/** what a slot's item does on double-click / via the detail-bar button */
function invUse(id: ItemId): void {
  const kind = ITEMS[id].kind;
  if (kind === 'structure') bus.emit('request-place', id as StructureId);
  else if (kind === 'food') bus.emit('eat', id);
  else if (kind === 'armor') bus.emit('equip-toggle', id);
  else if (kind === 'tool') {
    // take it in hand: select its quick-slot, seating it into a free one first —
    // or, with the bar full (auto-seat keeps it full for anyone owning 5+ Tools),
    // into the CURRENTLY SELECTED slot so the gesture always works
    const at = loadout.indexOf(id);
    if (at >= 0) return selectLoadout(at);
    const free = loadout.indexOf(null);
    const seat = free >= 0 ? free : loadoutSel;
    loadout[seat] = id;
    benched.delete(id); // deliberately seated
    selectLoadout(seat); // saves + re-renders + emits held
  }
}

/** is this Armor piece currently worn in its slot? */
function isEquipped(id: ItemId): boolean {
  const def = armorDef(id);
  return !!def && equippedGear[def.slot] === id;
}

function renderInventory(): void {
  const grid = el('inv-grid');
  wireUnslotDrop(grid);
  grid.innerHTML = '';
  hideItemTooltip(); // re-render discards the slots; drop any popup anchored to an old one
  const present = new Map(
    // skip any item id no longer known (e.g. a retired Structure still in a save)
    (Object.entries(inv) as [ItemId, number][]).filter(([id, n]) => (n ?? 0) > 0 && !!ITEMS[id]),
  );
  // a quick-slotted item lives ON THE HOTBAR, not in the pack view: hide one
  // copy per occupied slot (pure display — the bag still owns the item, every
  // ownership/craft check is untouched). Drag a hotbar slot onto the pack to
  // return it; spare copies keep showing with the reduced count.
  for (const id of loadout) {
    if (!id) continue;
    const n = present.get(id);
    if (n === undefined) continue;
    if (n <= 1) present.delete(id);
    else present.set(id, n - 1);
  }
  // Compact the arrangement down to exactly the VISIBLE items — the player's
  // order preserved, then any newcomers appended by kind. No gaps, so the empty
  // cells that remain are HONEST free capacity, never phantoms left behind by a
  // hidden quick-bar item.
  const kindOrder = { resource: 0, tool: 1, armor: 2, consumable: 3, food: 4, structure: 5 };
  const arranged = invOrder.filter((id): id is ItemId => !!id && present.has(id));
  const newcomers = [...present.keys()]
    .filter((id) => !arranged.includes(id))
    .sort((a, b) => kindOrder[ITEMS[a].kind] - kindOrder[ITEMS[b].kind] || a.localeCompare(b));
  invOrder = [...arranged, ...newcomers];
  saveInvOrder();
  if (invSelected && !present.has(invSelected)) invSelected = null;

  // quick-bar items are "equipped", so they don't consume pack space: the free
  // slots shown = capacity minus the kinds that DO count (the same exemption the
  // harvest pack-cap check applies, so what you see matches what you can pick up).
  const exempt = new Set(loadout.filter((id): id is ItemId => !!id));
  const freeSlots = Math.max(0, inventoryCapacity(villageTier) - invKindCount(inv, exempt));
  for (let i = 0; i < invOrder.length + freeSlots; i++) {
    const id = invOrder[i] ?? null;
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    if (id) {
      const def = ITEMS[id];
      slot.classList.add('filled');
      if (id === invSelected) slot.classList.add('selected');
      slot.setAttribute('data-testid', `inv-${id}`);
      // a11y label kept for screen readers; the visible hover popup is the Codex
      // Card (showItemTooltip) — it replaces the old native `title` box.
      slot.setAttribute('aria-label', `${def.name} — ${def.desc}`);
      slot.addEventListener('mouseenter', () => showItemTooltip(id, slot));
      slot.addEventListener('mouseleave', hideItemTooltip);
      const icon = document.createElement('img');
      icon.className = 'inv-icon';
      icon.src = itemIcon(id);
      icon.alt = def.name;
      icon.draggable = false;
      slot.appendChild(icon);
      const count = present.get(id)!;
      if (count > 1) {
        const badge = document.createElement('span');
        badge.className = 'inv-count';
        badge.textContent = count > 999 ? '999+' : String(count);
        slot.appendChild(badge);
      }
      // ADR-0017 §4: a worn Armor piece carries a badge + a lit slot frame
      if (isEquipped(id)) {
        slot.classList.add('equipped');
        const worn = document.createElement('span');
        worn.className = 'inv-equipped';
        worn.textContent = '⛨';
        worn.title = t.inv.wornBadge;
        slot.appendChild(worn);
      }
      slot.draggable = true;
      slot.addEventListener('dragstart', (e) => {
        hideItemTooltip(); // don't leave the popup floating over a drag
        e.dataTransfer!.setData('text/plain', String(i));
        // a universal id payload so a drop onto the game canvas can discard ANY
        // item kind (the ground-drop modal); a Structure ignores it and places
        e.dataTransfer!.setData('application/x-jw-item', id);
        // extra payloads so the item can also be dropped onto the Loadout bar
        // (Tools/weapons) or the game canvas to place it (Structures)
        if (isWeapon(id)) e.dataTransfer!.setData('application/x-jw-weapon', id);
        else if (ITEMS[id].kind === 'tool') e.dataTransfer!.setData('application/x-jw-tool', id);
        else if (ITEMS[id].kind === 'structure') e.dataTransfer!.setData('application/x-jw-structure', id);
        else if (ITEMS[id].kind === 'armor') e.dataTransfer!.setData('application/x-jw-armor', id);
        e.dataTransfer!.effectAllowed = 'move';
        slot.classList.add('dragging');
      });
      slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
      slot.onclick = () => {
        invSelected = id;
        renderInventory();
      };
      slot.ondblclick = () => invUse(id);
    }
    // every slot (also empty ones) is a drop target — dropping swaps
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.classList.add('drop');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      // only a pack-reorder drag carries text/plain; a hotbar drag must fall
      // through to the grid's unslot handler (getData('') would parse as 0
      // and phantom-swap slot 0 otherwise)
      if (!Array.from(e.dataTransfer!.types).includes('text/plain')) return;
      const from = Number(e.dataTransfer!.getData('text/plain'));
      if (!Number.isInteger(from) || from === i || invOrder[from] == null) return;
      [invOrder[from], invOrder[i]] = [invOrder[i] ?? null, invOrder[from]];
      saveInvOrder();
      renderInventory();
    });
    grid.appendChild(slot);
  }
  renderInvDetail(present);
}

/** the pack accepts a drag FROM the hotbar: dropping anywhere on the grid
 *  clears that quick-slot, so the item shows in the pack view again */
let unslotWired = false;
function wireUnslotDrop(grid: HTMLElement): void {
  if (unslotWired) return;
  unslotWired = true;
  grid.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('application/x-jw-unslot')) e.preventDefault();
  });
  grid.addEventListener('drop', (e) => {
    const idx = e.dataTransfer?.getData('application/x-jw-unslot');
    if (idx == null || idx === '') return; // '0' is a valid slot index
    e.preventDefault();
    const id = loadout[Number(idx)];
    if (id) benched.add(id); // stay in the pack — don't auto-seat it right back
    loadout[Number(idx)] = null;
    saveLoadout();
    renderLoadout();
    renderInventory();
    emitHeld();
  });
}

// ------------------------------------------------------------ character panel
// The WoW-style paperdoll (ADR-0017 §4): the Avatar wearing its Armor, the
// equipment slots you drag Items into, and the attributes those Items grant.

/** the four paperdoll slots: three Armor slots + the in-hand weapon (a MIRROR
 *  of the hotbar's held item — weapons live in the bag + quick-slots) */
type EquipSlotKind = ArmorSlot | 'weapon';

/** redraw the whole character block (paperdoll + slots + attributes) */
function renderCharacter(): void {
  renderPaperdoll();
  renderEquipSlots();
  renderCharAttrs();
}

/** draw the Avatar (down-idle frame, wearing its Armor) into the paperdoll canvas */
function renderPaperdoll(): void {
  const canvas = document.getElementById('char-doll-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  // the 20-frame sheet already bakes the Armor overlays (drawBlockheadSheet);
  // the down-idle frame sits at the sheet's top-left (AVATAR_W×AVATAR_H)
  const sheet = drawBlockheadSheet(myAppearance, equippedGear);
  const scale = 5;
  canvas.width = AVATAR_W * scale;
  canvas.height = AVATAR_H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // keep the pixel art crisp
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sheet, 0, 0, AVATAR_W, AVATAR_H, 0, 0, canvas.width, canvas.height);
}

/** the item currently seated in an equipment slot (weapon = the in-hand Tool) */
function slotItem(kind: EquipSlotKind): ItemId | null {
  return kind === 'weapon' ? heldItem() : equippedGear[kind] ?? null;
}

/** seat a Tool/weapon dropped on the paperdoll's weapon cell into the SELECTED
 *  quick-slot and wield it at once (reference semantics, never a MOVE) */
function equipWeaponToLoadout(toolId: ItemId): void {
  if (ITEMS[toolId]?.kind !== 'tool') return;
  for (let k = 0; k < LOADOUT_SLOTS; k++) if (loadout[k] === toolId) loadout[k] = null;
  loadout[loadoutSel] = toolId;
  benched.delete(toolId); // deliberately seated
  selectLoadout(loadoutSel); // saves, re-renders the bar, emits held (→ renderCharacter)
}

/** line-art empty-slot icons for the slots whose emoji render as solid shapes
 *  (helm, boots); drawn as outlines to match the flat swords/shield glyphs.
 *  Stroke + sizing come from `.equip-ghost svg` in styles.css. */
const GHOST_SVG: Partial<Record<EquipSlotKind, string>> = {
  helm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13a6 6 0 0 1 12 0v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M6 14.7h12"/></svg>',
  boots: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h3.5v9l4.5 2.6v2.9H7.5V12H9z"/></svg>',
};

/** build one paperdoll slot: its icon (or a ghost), drop target, and click action */
function buildEquipSlot(kind: EquipSlotKind): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'equip-slot equip-' + kind;
  slot.setAttribute('data-testid', `equip-slot-${kind}`);
  const id = slotItem(kind);
  const label = t.character.slot[kind];
  if (id) {
    slot.classList.add('filled');
    const icon = document.createElement('img');
    icon.className = 'inv-icon';
    icon.src = itemIcon(id);
    icon.alt = ITEMS[id].name;
    icon.draggable = false;
    slot.appendChild(icon);
    slot.addEventListener('mouseenter', () => showItemTooltip(id, slot));
    slot.addEventListener('mouseleave', hideItemTooltip);
    // armor slots unequip on click; the weapon slot mirrors the loadout (read-only)
    if (kind !== 'weapon') {
      slot.title = `${ITEMS[id].name} — ${t.character.unequipHint}`;
      slot.onclick = () => bus.emit('equip-toggle', id);
    } else {
      slot.title = ITEMS[id].name;
    }
  } else {
    const ghost = document.createElement('span');
    ghost.className = 'equip-ghost';
    // helm/boots use a line-art SVG so their empty-slot icon reads as an outline
    // like the flat swords/shield emoji; chest/weapon keep their emoji glyph
    const svg = GHOST_SVG[kind];
    if (svg) ghost.innerHTML = svg;
    else ghost.textContent = t.character.slotIcon[kind];
    slot.appendChild(ghost);
    slot.title = t.character.emptySlot(label);
  }
  // drop target: armor slots take the matching Armor; the weapon slot takes any
  // Tool or weapon (both inventory drag payloads) and seats it via the hotbar
  const dropTypes = kind === 'weapon' ? LOADOUT_PAYLOADS : ['application/x-jw-armor'];
  slot.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).some((tp) => dropTypes.includes(tp))) {
      e.preventDefault();
      slot.classList.add('drop');
    }
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('drop');
    const dropped = dropTypes.map((tp) => e.dataTransfer?.getData(tp)).find(Boolean) as ItemId | undefined;
    if (!dropped) return;
    if (kind === 'weapon') {
      equipWeaponToLoadout(dropped);
    } else {
      const def = armorDef(dropped);
      if (def && def.slot === kind && !isEquipped(dropped)) bus.emit('equip-toggle', dropped);
    }
  });
  return slot;
}

/** (re)lay the equipment slots: helm→chest→boots (head-to-toe) on the left,
 *  the in-hand weapon on the right */
function renderEquipSlots(): void {
  const left = document.getElementById('char-slots-left');
  const right = document.getElementById('char-slots-right');
  if (!left || !right) return;
  left.innerHTML = '';
  right.innerHTML = '';
  const order: ArmorSlot[] = ['helm', 'chest', 'boots'];
  for (const s of order) left.appendChild(buildEquipSlot(s));
  right.appendChild(buildEquipSlot('weapon'));
}

/** the attributes block: the character's effective combat profile (content/stats.ts) */
function renderCharAttrs(): void {
  const box = document.getElementById('char-attrs');
  if (!box) return;
  const sheet = characterSheet((heldItem() ?? undefined) as ToolId | undefined, equippedGear, villageTier);
  const rows: [string, string][] = [];
  rows.push([t.character.attrMove, sheet.moveBonus > 0 ? `+${Math.round(sheet.moveBonus * 100)}%` : '—']);
  rows.push([t.character.attrAttack, sheet.attackBonus > 0 ? `+${Math.round(sheet.attackBonus * 100)}%` : '—']);
  if (sheet.hasWeapon) {
    const band = sheet.bandMin === sheet.bandMax ? `${sheet.bandMin}` : `${sheet.bandMin}–${sheet.bandMax}`;
    rows.push([t.character.attrDamage, band]);
    rows.push([
      t.character.attrCrit,
      sheet.critChance > 0 ? `${Math.round(sheet.critChance * 100)}% ×${sheet.critMult.toFixed(1)}` : t.weapon.noCrit,
    ]);
    rows.push([t.character.attrDps, `~${sheet.dps}`]);
  } else {
    rows.push([t.character.attrWeapon, t.character.noWeapon]);
  }
  box.innerHTML = rows
    .map(([k, v]) => `<div class="char-attr"><span class="char-attr-k">${k}</span><span class="char-attr-v">${v}</span></div>`)
    .join('');
}

/** name, description and the Place/Eat action for the selected slot */
function renderInvDetail(present: Map<ItemId, number>): void {
  const name = el('inv-detail-name');
  const desc = el('inv-detail-desc');
  const actions = el('inv-detail-actions');
  actions.innerHTML = '';
  if (dropArm && dropArm.id !== invSelected) dropArm = null; // selection moved on — disarm
  if (!invSelected) {
    name.textContent = present.size === 0 ? t.inv.emptyGo : '';
    desc.textContent = present.size === 0 ? '' : t.inv.clickHint;
    return;
  }
  const def = ITEMS[invSelected];
  name.textContent = `${def.name} × ${present.get(invSelected) ?? 0}`;
  desc.textContent = def.desc;
  if (def.kind === 'structure' || def.kind === 'food') {
    const btn = document.createElement('button');
    btn.className = 'ui-btn';
    btn.textContent = def.kind === 'structure' ? t.inv.place : t.inv.eat;
    btn.setAttribute('data-testid', `${def.kind === 'structure' ? 'place' : 'eat'}-${invSelected}`);
    const id = invSelected;
    btn.onclick = () => invUse(id);
    actions.appendChild(btn);
  } else if (def.kind === 'armor') {
    // ADR-0017 §4: wear/unwear the piece; GameScene round-trips the backend
    const btn = document.createElement('button');
    btn.className = 'ui-btn';
    btn.textContent = isEquipped(invSelected) ? t.inv.unequip : t.inv.equip;
    btn.setAttribute('data-testid', `equip-${invSelected}`);
    const id = invSelected;
    btn.onclick = () => invUse(id);
    actions.appendChild(btn);
  }
  // throwing away (anything but a WORN Armor piece — unequip it first): gone
  // forever, no ground pickup. A two-click arm ("Sure?") keeps a mis-click
  // from voiding a rare item; a quick-slotted copy is invisible to the pack,
  // so the hotbar reference can never be dropped out from under the hand.
  if (!isEquipped(invSelected)) {
    const id = invSelected;
    const n = present.get(id) ?? 0;
    const mkDrop = (all: boolean, label: string): HTMLButtonElement => {
      const armed = dropArm !== null && dropArm.id === id && dropArm.all === all;
      const b = document.createElement('button');
      b.className = 'ui-btn' + (armed ? ' drop-armed' : '');
      b.textContent = armed ? t.inv.dropConfirm : label;
      b.setAttribute('data-testid', `drop${all ? '-all' : ''}-${id}`);
      b.onclick = () => {
        if (!armed) {
          dropArm = { id, all };
          renderInvDetail(present);
          return;
        }
        dropArm = null;
        bus.emit('drop-item', id, all ? n : 1);
      };
      return b;
    };
    actions.appendChild(mkDrop(false, t.inv.drop));
    if (n > 1) actions.appendChild(mkDrop(true, t.inv.dropAll(n)));
  }
}

// ---------------------------------------------------- drag-to-ground discard
// Dropping a pack item on the game canvas asks (via the bus) to throw it away.
// "Drop" means discard — there is no ground pickup (ADR-0001) — so we confirm
// with a modal before the item is gone for good.
let dropModal: HTMLElement | null = null;
let dropModalKey: ((e: KeyboardEvent) => void) | null = null;

function closeDropModal(): void {
  if (dropModalKey) {
    window.removeEventListener('keydown', dropModalKey, true);
    dropModalKey = null;
  }
  dropModal?.remove();
  dropModal = null;
}

function openDropModal(id: ItemId): void {
  if (!ITEMS[id]) return;
  // a WORN Armor piece can't be thrown away — take it off first (mirrors the
  // pack detail panel, which hides its Drop button while a piece is equipped)
  if (isEquipped(id)) return toast(t.toast.dropWornFirst, 'bad');
  const n = inv[id] ?? 0;
  if (n < 1) return;
  closeDropModal(); // never stack two
  const name = ITEMS[id].name;
  const ov = document.createElement('div');
  ov.id = 'drop-overlay';
  ov.setAttribute('data-testid', 'drop-overlay');
  ov.innerHTML =
    `<div id="drop-card" role="dialog" aria-modal="true" aria-label="${escHtml(t.inv.dropTitle(name))}">` +
    `<div class="drop-icon"><img src="${itemIcon(id)}" alt="" /></div>` +
    `<h2>${escHtml(t.inv.dropTitle(name))}</h2>` +
    `<p>${escHtml(t.inv.dropBody)}</p>` +
    `<div class="drop-actions"></div></div>`;
  document.body.appendChild(ov);
  dropModal = ov;
  const actions = ov.querySelector<HTMLElement>('.drop-actions')!;
  const mkBtn = (label: string, cls: string, testid: string, run: () => void): void => {
    const b = document.createElement('button');
    b.className = 'ui-btn ' + cls;
    b.textContent = label;
    b.setAttribute('data-testid', testid);
    b.onclick = run;
    actions.appendChild(b);
  };
  mkBtn(t.inv.dropCancel, 'drop-cancel', 'drop-modal-cancel', closeDropModal);
  mkBtn(t.inv.drop, 'drop-go', `drop-modal-one-${id}`, () => {
    closeDropModal();
    bus.emit('drop-item', id, 1);
  });
  if (n > 1) {
    mkBtn(t.inv.dropAll(n), 'drop-go', `drop-modal-all-${id}`, () => {
      closeDropModal();
      bus.emit('drop-item', id, n);
    });
  }
  ov.addEventListener('click', (e) => {
    if (e.target === ov) closeDropModal(); // backdrop click cancels
  });
  dropModalKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDropModal();
    }
  };
  window.addEventListener('keydown', dropModalKey, true); // capture, ahead of the HUD hotkeys
}

/** one ingredient chip: item icon + required count, greyed/red when short */
function ingChip(id: ItemId, count: number, have: number, tool = false): HTMLElement {
  const ok = have >= count;
  const chip = document.createElement('span');
  chip.className = 'recipe-ing' + (tool ? ' recipe-tool' : '') + (ok ? '' : ' lack');
  const name = ITEMS[id]?.name ?? id;
  chip.title = tool ? t.recipe.ingToolTip(name, have) : t.recipe.ingTip(name, count, have);
  const img = document.createElement('img');
  img.className = 'recipe-ing-icon';
  img.src = itemIcon(id);
  img.alt = name;
  img.draggable = false;
  chip.appendChild(img);
  const badge = document.createElement('span');
  badge.className = 'recipe-ing-count';
  badge.textContent = tool ? '🔧' : String(count);
  chip.appendChild(badge);
  return chip;
}

/** switch the open craft tab (B4) and re-render; highlights the active tab */
function setCraftTab(tab: CraftTab): void {
  craftTab = tab;
  renderRecipes();
}

/** is a recipe craftable right now with the current inventory? */
function recipeCraftable(r: (typeof RECIPES)[number]): boolean {
  if (r.requiresTool && (inv[r.requiresTool] ?? 0) <= 0) return false;
  if (r.requiresForge && !nearForge) return false; // heavy forged gear needs a Forge nearby
  for (const [res, count] of Object.entries(r.cost)) {
    if ((inv[res as ItemId] ?? 0) < (count as number)) return false;
  }
  return true;
}

/**
 * The crafting menu is image-driven: every recipe is a card showing the output
 * sprite and its ingredient icons (with count badges). The whole card crafts on
 * click; names and full costs live in the hover tooltip. Recipes are split into
 * four tabs (Tools & Weapons, Buildings, Props, Consumables) via recipeTab(),
 * craftable-first within the open tab.
 */
function renderRecipes(): void {
  const box = el('recipe-list');
  box.innerHTML = '';
  // reflect the active tab on the buttons
  for (const tabBtn of Array.from(document.querySelectorAll<HTMLElement>('#craft-tabs .craft-tab'))) {
    tabBtn.classList.toggle('active', tabBtn.dataset.tab === craftTab);
  }
  // this tab's recipes, craftable ones sorted ahead of the rest (stable order)
  const recipes = RECIPES.map((r, i) => ({ r, i }))
    // A3 (ADR-0010): a Village Building stays hidden until the Village reaches its
    // tier (villageMin). The Hall (villageMin 0) is always craftable.
    .filter(({ r }) => recipeTab(r) === craftTab && (r.villageMin ?? 0) <= villageTier)
    .sort((a, b) => Number(recipeCraftable(b.r)) - Number(recipeCraftable(a.r)) || a.i - b.i)
    .map(({ r }) => r);
  for (const r of recipes) {
    const def = ITEMS[r.output];
    let craftable = true;
    const costText: string[] = [];

    const cost = document.createElement('div');
    cost.className = 'recipe-cost';
    for (const [res, count] of Object.entries(r.cost)) {
      const resId = res as ItemId;
      const need = count as number;
      const have = inv[resId] ?? 0;
      if (have < need) craftable = false;
      costText.push(`${need} ${ITEMS[resId]?.name ?? res}`);
      cost.appendChild(ingChip(resId, need, have));
    }
    if (r.requiresTool) {
      const have = inv[r.requiresTool] ?? 0;
      if (have <= 0) craftable = false;
      costText.push(t.recipe.needsTool(ITEMS[r.requiresTool].name));
      cost.appendChild(ingChip(r.requiresTool, 1, have, true));
    }
    // the heavy forged gear: a Forge must be nearby (not a pack item) — a station
    // chip that greys out until the Player stands beside a built Forge
    if (r.requiresForge) {
      if (!nearForge) craftable = false;
      costText.push(t.recipe.atForge);
      const chip = document.createElement('span');
      chip.className = 'recipe-ing recipe-tool' + (nearForge ? '' : ' lack');
      chip.title = t.recipe.forgeTip(nearForge);
      const img = document.createElement('img');
      img.className = 'recipe-ing-icon';
      img.src = itemIcon('forge');
      img.alt = ITEMS.forge.name;
      img.draggable = false;
      chip.appendChild(img);
      const badge = document.createElement('span');
      badge.className = 'recipe-ing-count';
      badge.textContent = '🔨';
      chip.appendChild(badge);
      cost.appendChild(chip);
    }

    const card = document.createElement('div');
    card.className = 'recipe-card' + (craftable ? '' : ' uncraftable');
    card.setAttribute('data-testid', `recipe-${r.id}`);
    const countText = r.count > 1 ? ` ×${r.count}` : '';
    // weapons that can strike the Guardian get a combat stat line (ADR-0006 §6)
    const statLine = WEAPON_COMBAT[r.output as ToolId] ? `\n${weaponStatLine(r.output as ToolId, t.weapon)}` : '';
    const kindLabel = { tool: t.recipe.kindTool, building: t.recipe.kindBuilding, prop: t.recipe.kindProp, consumable: t.recipe.kindConsumable }[recipeTab(r)];
    card.title = t.recipe.tooltip(`${def.name}${countText}`, kindLabel, def.desc, costText.join(', '), statLine);

    const out = document.createElement('div');
    out.className = 'recipe-out';
    out.setAttribute('data-testid', `craft-${r.id}`);
    const outImg = document.createElement('img');
    outImg.className = 'recipe-out-icon';
    outImg.src = itemIcon(r.output);
    outImg.alt = def.name;
    outImg.draggable = false;
    out.appendChild(outImg);
    if (r.count > 1) {
      const c = document.createElement('span');
      c.className = 'recipe-out-count';
      c.textContent = `×${r.count}`;
      out.appendChild(c);
    }
    card.appendChild(out);
    card.appendChild(cost);

    if (craftable) card.onclick = () => bus.emit('craft', r.id);
    box.appendChild(card);
  }
}
