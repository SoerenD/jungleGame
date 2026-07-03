import { ITEMS, type ItemId, type StructureId } from '../content/items';
import { loadVolumes, type AudioChannel } from '../config';
import { itemIcon } from './icons';
import { hintRetired, journeyComplete, JOURNEY_STEPS } from '../content/journey';
import { RECIPES } from '../content/recipes';
import type { ChatMsg, Inventory, JourneyState, QuestState, SawmillState, SealResourceId, SealState } from '../backend/types';
import { bus } from './bus';

let meName = '';
let inv: Inventory = {};
let treasureLoc: { tx: number; ty: number } | null = null;
let quest: QuestState | null = null;
let seal: SealState | null = null;
let journey: JourneyState | null = null;
let placingNow = false;
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
  loadInvOrder();
  loadLoadout();
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="zone-label" data-testid="zone-label">Jungle World</div>
    <div id="controls-help">WASD/arrows move &middot; E interact (hold to keep swinging) &middot; C craft &middot; I inventory &middot; T chat &middot; M mute &middot; wheel zoom</div>
    <div id="quest-label" data-testid="quest-label" title="Ancient tablets read · torn map pieces (3 reveal a treasure ✕ on the minimap) · the Seal's progress">📜 0/? · 🗺 0/3</div>
    <div id="seal-panel" class="panel" data-testid="seal-panel">
      <h3>⛩ The Seal</h3>
      <div id="seal-bars"></div>
      <div id="seal-hint">Stand close and press E to lay your Offerings.</div>
    </div>
    <div id="fight-panel" data-testid="fight-panel">
      <div id="fight-title">⚔ The Guardian</div>
      <div id="fight-hpbar"><div id="fight-hpfill"></div></div>
      <div id="fight-roster"></div>
      <div id="fight-timer"></div>
    </div>
    <div id="buff-label" data-testid="buff-label"></div>
    <div id="lore-panel" class="panel" data-testid="lore-panel">
      <h3 id="lore-title"></h3>
      <p id="lore-text"></p>
      <button class="ui-btn" id="lore-close">Close</button>
    </div>
    <div id="zone-banner" data-testid="zone-banner"></div>
    <div id="online" class="panel" data-testid="online-list"></div>
    <div id="journey-panel" class="panel" data-testid="journey-panel">
      <h3>🌱 The Journey</h3>
      <div id="journey-steps"></div>
    </div>
    <div id="toasts"></div>
    <div id="place-hint">E place &middot; Esc cancel</div>
    <div id="craft-panel" class="panel" data-testid="craft-panel">
      <h3>Crafting</h3>
      <div id="recipe-list"></div>
    </div>
    <div id="crate-panel" class="panel" data-testid="crate-panel">
      <h3>📦 Supply Crate <span class="sub-note">shared with everyone</span></h3>
      <div class="crate-cols">
        <div><div class="col-title">Inside</div><div id="crate-contents"></div></div>
        <div><div class="col-title">Your pack</div><div id="crate-pack"></div></div>
      </div>
      <button class="ui-btn" id="crate-close">Close</button>
    </div>
    <div id="sawmill-panel" class="panel" data-testid="sawmill-panel">
      <h3>🪚 Sawmill</h3>
      <div id="sawmill-status"></div>
      <div class="sawmill-btns">
        <button class="ui-btn" id="sawmill-deposit" data-testid="sawmill-deposit">Deposit wood</button>
        <button class="ui-btn" id="sawmill-collect" data-testid="sawmill-collect">Collect planks</button>
        <button class="ui-btn" id="sawmill-close">Close</button>
      </div>
    </div>
    <div id="sign-panel" class="panel" data-testid="sign-panel">
      <h3>🪧 Signpost</h3>
      <input id="sign-input" data-testid="sign-input" maxlength="40" placeholder="Write a short line..." autocomplete="off" />
      <div class="sawmill-btns">
        <button class="ui-btn" id="sign-ok" data-testid="sign-ok">Place</button>
        <button class="ui-btn" id="sign-cancel">Cancel</button>
      </div>
    </div>
    <div id="inventory-panel" class="panel" data-testid="inventory-panel">
      <h3>Inventory</h3>
      <div id="inv-grid"></div>
      <div id="inv-detail">
        <div id="inv-detail-name"></div>
        <div id="inv-detail-desc"></div>
        <div id="inv-detail-actions"></div>
      </div>
    </div>
    <div id="chat" data-testid="chat">
      <div id="chat-messages" class="panel" data-testid="chat-messages"></div>
      <input id="chat-input" data-testid="chat-input" placeholder="Press T to chat..." maxlength="200" autocomplete="off" />
    </div>
    <canvas id="minimap" width="150" height="150" data-testid="minimap" title="Minimap — white: you, yellow: others"></canvas>
    <div id="loadout-bar" data-testid="loadout-bar" title="Your Loadout — drag Tools here; press 1–3 to pick the one in your hand"></div>
    <div id="settings-panel" class="panel" data-testid="settings-panel">
      <h3>⚙ Audio Settings</h3>
      <div id="settings-sliders"></div>
      <label class="settings-mute">
        <input type="checkbox" id="settings-mute" data-testid="settings-mute" ${muted ? 'checked' : ''} />
        Mute all sound
      </label>
      <button class="ui-btn" id="settings-close">Close</button>
    </div>
    <div id="bottom-bar">
      <button class="ui-btn" id="btn-craft" data-testid="btn-craft">Craft [C]</button>
      <button class="ui-btn" id="btn-inv" data-testid="btn-inventory">Inventory [I]</button>
      <button class="ui-btn" id="btn-mute" data-testid="btn-mute">${muted ? '🔇 Muted' : '🔊 Sound'}</button>
      <button class="ui-btn" id="btn-settings" data-testid="btn-settings" title="Audio settings">⚙</button>
    </div>
  `;
  document.body.appendChild(hud);

  // the inventory window can be dragged around by its header
  const invPanel = el('inventory-panel');
  const invHeader = invPanel.querySelector('h3');
  if (invHeader) makeDraggable(invPanel, invHeader as HTMLElement);

  el('btn-craft').onclick = () => togglePanel('craft-panel');
  el('btn-inv').onclick = () => togglePanel('inventory-panel');
  el('btn-mute').onclick = () => bus.emit('toggle-mute');
  el('btn-settings').onclick = () => togglePanel('settings-panel');
  el('settings-close').onclick = () => el('settings-panel').classList.remove('open');
  el<HTMLInputElement>('settings-mute').onchange = () => bus.emit('toggle-mute');
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
    renderInventory();
    renderRecipes();
    renderLoadout();
    emitHeld();
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
      `<b>Online (${names.length})</b><br>` +
      names.map((n) => `<span class="who">${n === meName ? n + ' (you)' : n}</span>`).join('<br>');
  });
  bus.on('toast', (text: string, kind: 'info' | 'good' | 'bad' = 'info') => toast(text, kind));
  bus.on('mute', (m: boolean) => {
    el('btn-mute').textContent = m ? '🔇 Muted' : '🔊 Sound';
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
  });
  bus.on('seal', (s: SealState) => {
    seal = s;
    renderQuestLabel();
    renderSealBars();
  });
  bus.on('seal-near', (near: boolean) => {
    el('seal-panel').classList.toggle('open', near);
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
        el('fight-title').textContent = '⚔ The Guardian stirs';
        el('fight-roster').textContent = '';
        el('fight-timer').textContent = 'Gather your party, then STRIKE to begin the fight!';
        return;
      }
      // ENGAGED: HP is fixed to the sealed roster; the countdown runs from
      // engagedAt — identical on every client (ADR-0002 amended).
      const engagedAt = f.engagedAt;
      el('fight-panel').classList.remove('dormant');
      setFightHp(f.hp, f.maxHp);
      (el('fight-hpbar') as HTMLElement).dataset.max = String(f.maxHp);
      el('fight-roster').textContent =
        `Warded party (${f.roster.length}): ${f.roster.join(', ')}`;
      const tick = () => {
        const left = Math.max(0, engagedAt + f.awakeMs - Date.now());
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        el('fight-timer').textContent = `slumbers again in ${m}:${String(s).padStart(2, '0')}`;
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
      label.textContent = `💨 Swift +20% · ${m}:${String(s).padStart(2, '0')}`;
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

function crateRow(id: ItemId, count: number, action: string, onClick: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'inv-row';
  const label = document.createElement('span');
  label.textContent = `${ITEMS[id].name} × ${count}`;
  row.appendChild(label);
  const btn = document.createElement('button');
  btn.className = 'ui-btn';
  btn.textContent = action;
  btn.setAttribute('data-testid', `crate-${action.toLowerCase()}-${id}`);
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
  if (contents.length === 0) inside.innerHTML = '<div class="col-empty">empty</div>';
  for (const [item, n] of contents) {
    inside.appendChild(crateRow(item, n, 'Take', () => bus.emit('crate-withdraw', id, item, n)));
  }
  const pack = el('crate-pack');
  pack.innerHTML = '';
  const mine = (Object.entries(inv).filter(([id, n]) => (n ?? 0) > 0 && !!ITEMS[id as ItemId])) as [ItemId, number][];
  if (mine.length === 0) pack.innerHTML = '<div class="col-empty">nothing to store</div>';
  for (const [item, n] of mine) {
    pack.appendChild(crateRow(item, n, 'Put', () => bus.emit('crate-deposit', id, item, n)));
  }
}

function renderSawmill(): void {
  if (!openSawmillId || !sawmill) return;
  const sinceOpen = Date.now() - sawmillOpenedAt;
  const next = sawmill.nextPlankMs === null ? null : Math.max(0, sawmill.nextPlankMs - sinceOpen);
  const parts = [
    `milling: ${sawmill.wood} wood`,
    `ready: ${sawmill.ready} plank${sawmill.ready === 1 ? '' : 's'}`,
  ];
  if (next !== null) parts.push(`next plank in ${Math.ceil(next / 1000)}s`);
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
  const mapJson = await (await fetch('/map/jungle-map.json')).json();
  // v2 landmarks (Seal monument, Guardian) are marked on the minimap
  const worldData = (await (await fetch('/map/world-data.json')).json()) as {
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
  { id: 'master', label: '🔊 Master' },
  { id: 'ambience', label: '🌴 Jungle ambience' },
  { id: 'music', label: '🥁 Guardian drums' },
  { id: 'sfx', label: '🪓 Sound effects' },
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
 * The Journey tracker: sequential objectives, ticked from play. It disappears
 * for good once the last step (the first Seal Offering) is done.
 */
function renderJourney(): void {
  const panel = el('journey-panel');
  if (!journey || journeyComplete(journey)) {
    panel.classList.remove('open');
    return;
  }
  panel.classList.add('open');
  const box = el('journey-steps');
  box.innerHTML = '';
  let currentMarked = false;
  for (const step of JOURNEY_STEPS) {
    const done = !!journey.steps[step.id];
    const current = !done && !currentMarked;
    if (current) currentMarked = true;
    const row = document.createElement('div');
    row.className = 'journey-step' + (done ? ' done' : current ? ' current' : '');
    row.setAttribute('data-testid', `journey-${step.id}`);
    row.textContent = `${done ? '✓' : current ? '▸' : '○'} ${step.label}`;
    box.appendChild(row);
  }
}

/** 📜 read/total (derived from world data) · 🗺 pieces · ⛩ Seal progress */
function renderQuestLabel(): void {
  const parts: string[] = [];
  if (quest) {
    parts.push(`📜 ${quest.tabletsRead.length}/${quest.tabletsTotal}`);
    parts.push(`🗺 ${Math.min(quest.mapPieces, 3)}/3${quest.mapPieces >= 3 ? ' — dig at the ✕!' : ''}`);
  }
  if (seal) {
    if (seal.broken) parts.push('⛩ open');
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
  el('seal-hint').textContent = seal.broken
    ? 'The Seal lies broken. The arena stands open, forever.'
    : 'Stand close and press E to lay your Offerings.';
}

function setFightHp(hp: number, max: number): void {
  el('fight-hpfill').style.width = `${Math.max(0, (hp / max) * 100)}%`;
  el('fight-title').textContent = `⚔ The Guardian · ${hp}/${max}`;
}

let bannerTimer: number | undefined;
function setZone(zone: string): void {
  el('zone-label').textContent = zone;
  const banner = el('zone-banner');
  banner.textContent = zone;
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
      slot.title = `${ITEMS[id].name} — press ${i + 1} to hold it`;
    } else {
      slot.title = `Loadout slot ${i + 1} — drag a Tool here, press ${i + 1} to select`;
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

  for (let i = 0; i < Math.max(INV_SLOTS, invOrder.length); i++) {
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
    name.textContent = present.size === 0 ? 'Empty — go harvest something! (E)' : '';
    desc.textContent = present.size === 0 ? '' : 'Click an item for details · drag to arrange your pack.';
    return;
  }
  const def = ITEMS[invSelected];
  name.textContent = `${def.name} × ${present.get(invSelected) ?? 0}`;
  desc.textContent = def.desc;
  if (def.kind === 'structure' || def.kind === 'food') {
    const btn = document.createElement('button');
    btn.className = 'ui-btn';
    btn.textContent = def.kind === 'structure' ? 'Place' : 'Eat';
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
  chip.title = tool
    ? `needs ${name} in your pack (not consumed) — you have ${have}`
    : `${name} — need ${count}, you have ${have}`;
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

/**
 * The crafting menu is image-driven: every recipe is a card showing the output
 * sprite and its ingredient icons (with count badges). The whole card crafts on
 * click; names and full costs live in the hover tooltip.
 */
function renderRecipes(): void {
  const box = el('recipe-list');
  box.innerHTML = '';
  for (const r of RECIPES) {
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
      costText.push(`needs ${ITEMS[r.requiresTool].name}`);
      cost.appendChild(ingChip(r.requiresTool, 1, have, true));
    }

    const card = document.createElement('div');
    card.className = 'recipe-card' + (craftable ? '' : ' uncraftable');
    card.setAttribute('data-testid', `recipe-${r.id}`);
    const countText = r.count > 1 ? ` ×${r.count}` : '';
    card.title = `${def.name}${countText} (${r.kind})\n${def.desc}\nCost: ${costText.join(', ')}`;

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
