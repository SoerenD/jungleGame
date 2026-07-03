import { ITEMS, type ItemId, type StructureId } from '../content/items';
import { RECIPES } from '../content/recipes';
import type { ChatMsg, Inventory, QuestState, SealResourceId, SealState } from '../backend/types';
import { bus } from './bus';

let meName = '';
let inv: Inventory = {};
let treasureLoc: { tx: number; ty: number } | null = null;
let quest: QuestState | null = null;
let seal: SealState | null = null;
let fightTimer: number | undefined;
let buffTimer: number | undefined;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const SEAL_BAR_ORDER: SealResourceId[] = ['wood', 'stone', 'fiber', 'fruit'];

export function initHud(name: string, muted: boolean): void {
  meName = name;
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="zone-label" data-testid="zone-label">Jungle World</div>
    <div id="controls-help">WASD/arrows move &middot; E interact &middot; C craft &middot; I inventory &middot; T chat &middot; M mute &middot; wheel zoom</div>
    <div id="quest-label" data-testid="quest-label" title="Ancient tablets read · torn map pieces (3 reveal a treasure ✕ on the minimap) · the Seal's progress">📜 0/? · 🗺 0/3</div>
    <div id="seal-panel" class="panel" data-testid="seal-panel">
      <h3>⛩ The Seal</h3>
      <div id="seal-bars"></div>
      <div id="seal-hint">Stand close and press E to lay your Offerings.</div>
    </div>
    <div id="fight-panel" data-testid="fight-panel">
      <div id="fight-title">⚔ The Guardian</div>
      <div id="fight-hpbar"><div id="fight-hpfill"></div></div>
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
    <div id="toasts"></div>
    <div id="place-hint">Face a free tile &middot; Enter to place &middot; Esc to cancel</div>
    <div id="craft-panel" class="panel" data-testid="craft-panel">
      <h3>Crafting</h3>
      <div id="recipe-list"></div>
    </div>
    <div id="inventory-panel" class="panel" data-testid="inventory-panel">
      <h3>Inventory</h3>
      <div id="inv-list"></div>
    </div>
    <div id="chat" data-testid="chat">
      <div id="chat-messages" class="panel" data-testid="chat-messages"></div>
      <input id="chat-input" data-testid="chat-input" placeholder="Press T to chat..." maxlength="200" autocomplete="off" />
    </div>
    <canvas id="minimap" width="150" height="150" data-testid="minimap" title="Minimap — white: you, yellow: others"></canvas>
    <div id="bottom-bar">
      <button class="ui-btn" id="btn-craft" data-testid="btn-craft">Craft [C]</button>
      <button class="ui-btn" id="btn-inv" data-testid="btn-inventory">Inventory [I]</button>
      <button class="ui-btn" id="btn-mute" data-testid="btn-mute">${muted ? '🔇 Muted' : '🔊 Sound'}</button>
    </div>
  `;
  document.body.appendChild(hud);

  el('btn-craft').onclick = () => togglePanel('craft-panel');
  el('btn-inv').onclick = () => togglePanel('inventory-panel');
  el('btn-mute').onclick = () => bus.emit('toggle-mute');

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
    }
  });

  bus.on('inventory', (next: Inventory) => {
    inv = next;
    renderInventory();
    renderRecipes();
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
  });
  bus.on('place-mode', (on: boolean) => {
    el('place-hint').classList.toggle('open', on);
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
  bus.on('fight-start', (f: { hp: number; maxHp: number; summonedAt: number; awakeMs: number }) => {
    el('fight-panel').classList.add('open');
    setFightHp(f.hp, f.maxHp);
    window.clearInterval(fightTimer);
    // the countdown derives from summonedAt — identical on every client
    const tick = () => {
      const left = Math.max(0, f.summonedAt + f.awakeMs - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      el('fight-timer').textContent = `slumbers again in ${m}:${String(s).padStart(2, '0')}`;
    };
    tick();
    fightTimer = window.setInterval(tick, 250);
    (el('fight-hpbar') as HTMLElement).dataset.max = String(f.maxHp);
  });
  bus.on('fight-hp', (hp: number) => {
    const max = Number((el('fight-hpbar') as HTMLElement).dataset.max ?? 1);
    setFightHp(hp, max);
  });
  bus.on('fight-end', () => {
    el('fight-panel').classList.remove('open');
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

  renderInventory();
  renderRecipes();
  void initMinimap();
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

function renderInventory(): void {
  const box = el('inv-list');
  box.innerHTML = '';
  const entries = Object.entries(inv).filter(([, n]) => (n ?? 0) > 0) as [ItemId, number][];
  if (entries.length === 0) {
    box.innerHTML = '<div class="inv-row"><span style="color:var(--dim)">Empty — go harvest something! (E)</span></div>';
    return;
  }
  const order = { resource: 0, tool: 1, consumable: 2, food: 3, structure: 4 };
  entries.sort((a, b) => order[ITEMS[a[0]].kind] - order[ITEMS[b[0]].kind] || a[0].localeCompare(b[0]));
  for (const [id, count] of entries) {
    const def = ITEMS[id];
    const row = document.createElement('div');
    row.className = 'inv-row';
    row.setAttribute('data-testid', `inv-${id}`);
    row.title = def.desc;
    const label = document.createElement('span');
    label.textContent = `${def.name} × ${count}`;
    row.appendChild(label);
    if (def.kind === 'structure') {
      const btn = document.createElement('button');
      btn.className = 'ui-btn';
      btn.textContent = 'Place';
      btn.setAttribute('data-testid', `place-${id}`);
      btn.onclick = () => bus.emit('request-place', id as StructureId);
      row.appendChild(btn);
    } else if (def.kind === 'food') {
      const btn = document.createElement('button');
      btn.className = 'ui-btn';
      btn.textContent = 'Eat';
      btn.setAttribute('data-testid', `eat-${id}`);
      btn.onclick = () => bus.emit('eat', id);
      row.appendChild(btn);
    } else {
      const kind = document.createElement('span');
      kind.style.color = 'var(--dim)';
      kind.style.fontSize = '11px';
      kind.textContent = def.kind;
      row.appendChild(kind);
    }
    box.appendChild(row);
  }
}

function renderRecipes(): void {
  const box = el('recipe-list');
  box.innerHTML = '';
  for (const r of RECIPES) {
    const def = ITEMS[r.output];
    const costParts: string[] = [];
    let craftable = true;
    for (const [res, count] of Object.entries(r.cost)) {
      const have = inv[res as ItemId] ?? 0;
      const ok = have >= (count as number);
      if (!ok) craftable = false;
      costParts.push(`<span class="${ok ? '' : 'lack'}">${count} ${res} (${have})</span>`);
    }
    let toolNote = '';
    if (r.requiresTool && (inv[r.requiresTool] ?? 0) <= 0) {
      craftable = false;
      toolNote = `<div class="need-tool">needs ${ITEMS[r.requiresTool].name}</div>`;
    }
    const row = document.createElement('div');
    row.className = 'recipe' + (craftable ? '' : ' uncraftable');
    row.setAttribute('data-testid', `recipe-${r.id}`);
    row.title = def.desc;
    row.innerHTML = `
      <div>
        <div class="r-name">${def.name} <span style="color:var(--dim);font-size:11px">(${r.kind})</span></div>
        <div class="cost">${costParts.join(' · ')}</div>
        ${toolNote}
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'ui-btn';
    btn.textContent = 'Craft';
    btn.disabled = !craftable;
    btn.setAttribute('data-testid', `craft-${r.id}`);
    btn.onclick = () => bus.emit('craft', r.id);
    row.appendChild(btn);
    box.appendChild(row);
  }
}
