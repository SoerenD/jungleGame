import { ITEMS, isBuilding, type ItemId, type StructureId, type ToolId } from '../content/items';
import {
  applyUiScale,
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
  type AudioChannel,
} from '../config';
import { GUARDIAN_DISPLAY_SCALE, WEAPON_COMBAT, weaponStatLine } from '../content/guardian';
import { itemIcon } from './icons';
import { delveQuestComplete, DELVE_QUEST_STEPS, hintRetired, journeyComplete, JOURNEY_STEPS } from '../content/journey';
import { RECIPES } from '../content/recipes';
import { inventoryCapacity, milestoneForTier, tierThreshold, VILLAGE_CONTRIB, VILLAGE_MAX_TIER, type VillageRecord } from '../content/village';
import type { ChatMsg, Inventory, JourneyState, QuestState, SawmillState, SealResourceId, SealState } from '../backend/types';
import { bus } from './bus';
import { asset } from '../paths';
import { t, getLang, setLang, LANG_NAMES, zoneName, type Lang } from '../i18n';

let meName = '';
let inv: Inventory = {};
// true once the Backend's first inventory snapshot has arrived; until then the loadout
// must not be reconciled against the (still-empty) inv, or a reload would wipe the saved
// arrangement before the real inventory shows up.
let invReady = false;
let treasureLoc: { tx: number; ty: number } | null = null;
let quest: QuestState | null = null;
let seal: SealState | null = null;
/** the communal Village record (ADR-0010) — drives the tier panel + recipe gating */
let village: VillageRecord | null = null;
let villageTier = 0;
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
/** fog-of-war layer for the minimap: 1px per chunk, rebuilt on fog events */
let fogLayer: HTMLCanvasElement | null = null;

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

export function initHud(name: string, muted: boolean): void {
  meName = name;
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
    <div id="village-panel" class="panel" data-testid="village-panel">
      <h3>${t.village.title}</h3>
      <div id="village-tier"></div>
      <div class="seal-bar"><div id="village-fill" class="seal-fill village-fill" style="width:0%"></div></div>
      <div id="village-pool"></div>
      <div id="village-milestone"></div>
      <div id="village-hint">${t.village.hint}</div>
    </div>
    <div id="fight-panel" data-testid="fight-panel">
      <div id="fight-title">${t.fight.title}</div>
      <div id="fight-hpbar"><div id="fight-hpfill"></div></div>
      <div id="fight-roster"></div>
      <div id="fight-timer"></div>
    </div>
    <div id="buff-label" data-testid="buff-label"></div>
    <div id="lore-panel" class="panel" data-testid="lore-panel">
      <h3 id="lore-title"></h3>
      <p id="lore-text"></p>
      <button class="ui-btn" id="lore-close">${t.crate.close}</button>
    </div>
    <div id="zone-banner" data-testid="zone-banner"></div>
    <div id="online" class="panel" data-testid="online-list"></div>
    <div id="journey-panel" class="panel" data-testid="journey-panel">
      <h3 id="journey-title">${t.panels.journey}</h3>
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
    <div id="sawmill-panel" class="panel" data-testid="sawmill-panel">
      <h3>${t.sawmill.title}</h3>
      <div id="sawmill-status"></div>
      <div class="sawmill-btns">
        <button class="ui-btn" id="sawmill-deposit" data-testid="sawmill-deposit">${t.sawmill.deposit}</button>
        <button class="ui-btn" id="sawmill-collect" data-testid="sawmill-collect">${t.sawmill.collect}</button>
        <button class="ui-btn" id="sawmill-close">${t.sawmill.close}</button>
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
      <h3>${t.panels.inventory}</h3>
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
    if (k === 't') {
      e.preventDefault();
      input.focus();
    } else if (k === 'c') {
      togglePanel('craft-panel');
    } else if (k === 'i') {
      togglePanel('inventory-panel');
    } else if (k === 'm') {
      bus.emit('toggle-mute');
    } else if (k === '1' || k === '2' || k === '3') {
      selectLoadout(Number(k) - 1);
    }
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
  });
  bus.on('chat', (msg: ChatMsg) => appendChat(msg));
  bus.on('chatlog', (msgs: ChatMsg[]) => {
    el('chat-messages').innerHTML = '';
    msgs.forEach(appendChat);
  });
  bus.on('zone', (zone: string) => setZone(zone));
  bus.on('presence', (names: string[]) => {
    el('online').innerHTML =
      `<b>${t.online(names.length)}</b><br>` +
      names.map((n) => `<span class="who">${n === meName ? n + t.youSuffix : n}</span>`).join('<br>');
  });
  bus.on('toast', (text: string, kind: 'info' | 'good' | 'bad' = 'info') => toast(text, kind));
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
  bus.on('village', (v: VillageRecord) => {
    village = v;
    villageTier = v.tier;
    renderInventory(); // ADR-0013: pack capacity grows a row when the Village is founded
    renderVillagePanel();
    renderRecipes(); // tier-locked Buildings unlock as the Village grows (villageMin)
  });
  bus.on('village-near', (near: boolean) => {
    el('village-panel').classList.toggle('open', near);
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
    (f: { hp: number; maxHp: number; engagedAt: number | null; awakeMs: number; roster: string[] }) => {
      el('fight-panel').classList.add('open');
      window.clearInterval(fightTimer);
      if (f.engagedAt === null) {
        // DORMANT (ADR-0004): the Guardian roams, unstruck — no roster, no HP
        // bar, no clock yet. Prompt the party to land the first strike.
        el('fight-panel').classList.add('dormant');
        el('fight-title').textContent = t.fight.stirs;
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
let openSawmillId: string | null = null;
let sawmill: SawmillState | null = null;
let sawmillOpenedAt = 0;
let sawmillTimer: number | undefined;
let sawmillRefreshAt = 0;
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

async function initMinimap(): Promise<void> {
  const canvas = el<HTMLCanvasElement>('minimap');
  const ctx = canvas.getContext('2d')!;
  const mapJson = await (await fetch(asset('/map/jungle-map.json'))).json();
  // v2 landmarks (Seal monument, Guardian) are marked on the minimap
  const worldData = (await (await fetch(asset('/map/world-data.json'))).json()) as {
    sealMonument: { tx: number; ty: number };
    guardianHome: { tx: number; ty: number };
  };
  const ground = (mapJson.layers as { name: string; data: number[] }[]).find((l) => l.name === 'ground')!.data;
  const W = mapJson.width as number;
  const H = mapJson.height as number;
  // gid -> minimap color (terrain slots; overlays fall back to grass)
  const colors: Record<number, string> = {
    1: '#2f6b36', 2: '#2b6cb0', 3: '#a87848', 4: '#94785c', 5: '#4a5d2a',
    6: '#6b6b6b', 7: '#9aa0a8', 8: '#2f6b36', 9: '#2f6b36', 10: '#337038', 11: '#337038',
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
  const sx = canvas.width / (W * 16);
  const sy = canvas.height / (H * 16);
  const draw = (pos?: { x: number; y: number; others: { x: number; y: number }[] }) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    // static v2 landmarks: violet = the Seal monument, dark red = the Guardian
    ctx.fillStyle = '#b478ff';
    ctx.fillRect(worldData.sealMonument.tx * 16 * sx - 2, worldData.sealMonument.ty * 16 * sy - 2, 4, 4);
    ctx.fillStyle = '#c03a2b';
    ctx.fillRect((worldData.guardianHome.tx + 1.5) * 16 * sx - 2, (worldData.guardianHome.ty + 1.5) * 16 * sy - 2, 4, 4);
    // unexplored chunks stay dark (landmarks hide until discovered; the
    // Players themselves and the treasure ✕ draw over the fog)
    if (fogLayer) ctx.drawImage(fogLayer, 0, 0, canvas.width, canvas.height);
    if (!pos) return;
    ctx.fillStyle = '#ffd166';
    for (const o of pos.others) ctx.fillRect(o.x * sx - 1, o.y * sy - 1, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pos.x * sx - 2, pos.y * sy - 2, 4, 4);
    if (treasureLoc) {
      const cx = treasureLoc.tx * 16 * sx;
      const cy = treasureLoc.ty * 16 * sy;
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
 * The HUD objective tracker. It shows **The Journey** (onboarding) until that is
 * done, then hands the panel over to **Into the Delve** — the post-onboarding
 * quest that guides the Player to and into the first Dungeon (ADR-0007), ticking
 * off Seal/Guardian/pickaxe/shaft/descent from state. When the Delve quest is
 * also complete the panel disappears for good.
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
  const prog = { seal, inventory: inv, quest };
  if (journey && !delveQuestComplete(prog)) {
    panel.classList.add('open');
    title.textContent = t.panels.intoDelve;
    renderTrackerRows(DELVE_QUEST_STEPS, (i) => DELVE_QUEST_STEPS[i].done(prog));
    return;
  }
  panel.classList.remove('open'); // both quests done (or not joined yet)
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

/**
 * The Village tier panel (ADR-0010): the prestige badge, the additive pool bar to
 * the next threshold, and the milestone the group must raise in-zone to advance.
 * Collective-only — no individual contribution ever appears here.
 */
function renderVillagePanel(): void {
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
  el('fight-title').textContent = t.fight.guardianHp(Math.max(0, hp) * s, max * s);
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

/** three quick-slots holding ready Tools; exactly one is in-hand (keys 1–3) */
const LOADOUT_SLOTS = 3;
let loadout: (ItemId | null)[] = [null, null, null];
let loadoutSel = 0;

const loadoutKey = () => `jungle-world:loadout:${meName}`;

function loadLoadout(): void {
  loadout = [null, null, null];
  loadoutSel = 0;
  try {
    const parsed = JSON.parse(localStorage.getItem(loadoutKey()) ?? 'null') as
      | { slots?: (ItemId | null)[]; sel?: number }
      | null;
    if (parsed && Array.isArray(parsed.slots)) {
      for (let i = 0; i < LOADOUT_SLOTS; i++) loadout[i] = parsed.slots[i] ?? null;
    }
    if (parsed && Number.isInteger(parsed.sel)) {
      loadoutSel = Math.max(0, Math.min(LOADOUT_SLOTS - 1, parsed.sel!));
    }
  } catch {
    /* corrupt entry — start empty */
  }
}

function saveLoadout(): void {
  localStorage.setItem(loadoutKey(), JSON.stringify({ slots: loadout, sel: loadoutSel }));
}

/** only Tools are equippable; drop unowned Tools and auto-seat newly-owned ones */
function reconcileLoadout(): void {
  // Before the first inventory snapshot the inv is empty; reconciling now would drop every
  // saved slot (nothing looks owned) and the following renderLoadout would persist the wipe.
  if (!invReady) return;
  const ownedTools = (Object.entries(inv) as [ItemId, number][])
    .filter(([id, n]) => (n ?? 0) > 0 && ITEMS[id]?.kind === 'tool')
    .map(([id]) => id);
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    if (loadout[i] && !ownedTools.includes(loadout[i]!)) loadout[i] = null;
  }
  for (const id of ownedTools) {
    if (loadout.includes(id)) continue;
    const free = loadout.indexOf(null);
    if (free >= 0) loadout[free] = id;
  }
}

/** the currently in-hand item, or null when the selected slot is empty/unowned */
function heldItem(): ItemId | null {
  const id = loadout[loadoutSel];
  return id && (inv[id] ?? 0) > 0 ? id : null;
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

function renderLoadout(): void {
  reconcileLoadout();
  saveLoadout();
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
    } else {
      slot.title = t.inv.slotEmpty(i + 1);
    }
    // accept a Tool dragged from the inventory grid
    slot.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('application/x-jw-tool')) {
        e.preventDefault();
        slot.classList.add('drop');
      }
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drop');
      const toolId = e.dataTransfer?.getData('application/x-jw-tool') as ItemId;
      if (!toolId) return;
      // no duplicates — clear the Tool from any other slot first
      for (let k = 0; k < LOADOUT_SLOTS; k++) if (loadout[k] === toolId) loadout[k] = null;
      loadout[i] = toolId;
      saveLoadout();
      renderLoadout();
      emitHeld();
    });
    slot.onclick = () => selectLoadout(i);
    bar.appendChild(slot);
  }
}

/** what a slot's item does on double-click / via the detail-bar button */
function invUse(id: ItemId): void {
  const kind = ITEMS[id].kind;
  if (kind === 'structure') bus.emit('request-place', id as StructureId);
  else if (kind === 'food') bus.emit('eat', id);
}

function renderInventory(): void {
  const grid = el('inv-grid');
  grid.innerHTML = '';
  const present = new Map(
    // skip any item id no longer known (e.g. a retired Structure still in a save)
    (Object.entries(inv) as [ItemId, number][]).filter(([id, n]) => (n ?? 0) > 0 && !!ITEMS[id]),
  );
  // vacate slots whose item is gone, then seat newcomers in the first free slot
  for (let i = 0; i < invOrder.length; i++) {
    const it = invOrder[i];
    if (it && !present.has(it)) invOrder[i] = null;
  }
  const kindOrder = { resource: 0, tool: 1, consumable: 2, food: 3, structure: 4 };
  const newcomers = [...present.keys()]
    .filter((id) => !invOrder.includes(id))
    .sort((a, b) => kindOrder[ITEMS[a].kind] - kindOrder[ITEMS[b].kind] || a.localeCompare(b));
  for (const id of newcomers) {
    const free = invOrder.indexOf(null);
    if (free >= 0) invOrder[free] = id;
    else invOrder.push(id);
  }
  saveInvOrder();
  if (invSelected && !present.has(invSelected)) invSelected = null;

  for (let i = 0; i < Math.max(inventoryCapacity(villageTier), invOrder.length); i++) {
    const id = invOrder[i] ?? null;
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    if (id) {
      const def = ITEMS[id];
      slot.classList.add('filled');
      if (id === invSelected) slot.classList.add('selected');
      slot.setAttribute('data-testid', `inv-${id}`);
      slot.title = `${def.name} — ${def.desc}`;
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
      slot.draggable = true;
      slot.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('text/plain', String(i));
        // extra payloads so the item can also be dropped onto the Loadout bar
        // (Tools) or the game canvas to place it (Structures)
        if (ITEMS[id].kind === 'tool') e.dataTransfer!.setData('application/x-jw-tool', id);
        else if (ITEMS[id].kind === 'structure') e.dataTransfer!.setData('application/x-jw-structure', id);
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

/** name, description and the Place/Eat action for the selected slot */
function renderInvDetail(present: Map<ItemId, number>): void {
  const name = el('inv-detail-name');
  const desc = el('inv-detail-desc');
  const actions = el('inv-detail-actions');
  actions.innerHTML = '';
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
  }
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
