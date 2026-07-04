import { SESSION_KEY } from '../config';
import { t } from '../i18n';
import type { Appearance, Backend, JoinResult } from '../backend/types';
import {
  AVATAR_H,
  AVATAR_W,
  DEFAULT_APPEARANCE,
  drawBlockheadSheet,
  legacyAppearance,
  PALETTES,
  sanitizeAppearance,
} from '../avatars';

type OkJoin = Extract<JoinResult, { ok: true }>;

interface StoredSession {
  name: string;
  pin: string;
  /** legacy sessions stored a tint-preset index instead */
  avatar?: number;
  appearance?: Appearance;
}

const SLOTS: { key: keyof Appearance; label: string }[] = [
  { key: 'skin', label: t.join.slotSkin },
  { key: 'hair', label: t.join.slotHair },
  { key: 'shirt', label: t.join.slotShirt },
  { key: 'pants', label: t.join.slotPants },
];

/**
 * The join screen: name + PIN + the Avatar customizer (four curated palette
 * rows with a live preview). Shown at EVERY join — a returning Player sees
 * their current look prefilled and may edit it before entering the World.
 */
export function showJoin(backend: Backend): Promise<OkJoin> {
  return new Promise((resolve) => {
    const stored = localStorage.getItem(SESSION_KEY);
    const session = stored ? (JSON.parse(stored) as StoredSession) : null;
    // pre-update sessions carried a tint preset — map it to a starting look
    const appearance: Appearance = sanitizeAppearance(
      session?.appearance ?? (session && session.avatar !== undefined ? legacyAppearance(session.avatar) : DEFAULT_APPEARANCE),
    );

    const overlay = document.createElement('div');
    overlay.id = 'join-overlay';
    overlay.innerHTML = `
      <div id="join-card">
        <h1>🌴 JUNGLE WORLD</h1>
        <div class="sub">${t.join.subtitle}</div>
        <div>
          <label for="join-name">${t.join.playerName}</label>
          <input id="join-name" data-testid="join-name" maxlength="16" placeholder="${t.join.namePlaceholder}" />
        </div>
        <div>
          <label for="join-pin">${t.join.pinLabel}</label>
          <input id="join-pin" data-testid="join-pin" maxlength="4" inputmode="numeric" placeholder="0000" />
        </div>
        <div id="customizer">
          <div id="preview-box"><canvas id="avatar-preview" data-testid="avatar-preview" width="${AVATAR_W}" height="${AVATAR_H}"></canvas></div>
          <div id="palette-rows"></div>
        </div>
        <div id="join-error" data-testid="join-error"></div>
        <button id="join-btn" data-testid="join-btn">${t.join.enter}</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector<HTMLInputElement>('#join-name')!;
    const pinInput = overlay.querySelector<HTMLInputElement>('#join-pin')!;
    const errorBox = overlay.querySelector<HTMLElement>('#join-error')!;
    const rows = overlay.querySelector<HTMLElement>('#palette-rows')!;
    const preview = overlay.querySelector<HTMLCanvasElement>('#avatar-preview')!;
    const pctx = preview.getContext('2d')!;

    // live preview: the composed blockhead walking toward the viewer
    let sheet = drawBlockheadSheet(appearance);
    let previewFrame = 0;
    const renderPreview = () => {
      pctx.clearRect(0, 0, AVATAR_W, AVATAR_H);
      pctx.drawImage(sheet, previewFrame * AVATAR_W, 0, AVATAR_W, AVATAR_H, 0, 0, AVATAR_W, AVATAR_H);
    };
    const previewTimer = window.setInterval(() => {
      previewFrame = (previewFrame + 1) % 4;
      renderPreview();
    }, 220);
    renderPreview();

    const refresh = () => {
      sheet = drawBlockheadSheet(appearance);
      renderPreview();
      rows.querySelectorAll<HTMLButtonElement>('.swatch-pick').forEach((b) => {
        const slot = b.dataset.slot as keyof Appearance;
        b.classList.toggle('selected', appearance[slot] === Number(b.dataset.index));
      });
    };

    for (const slot of SLOTS) {
      const row = document.createElement('div');
      row.className = 'palette-row';
      const label = document.createElement('span');
      label.className = 'palette-label';
      label.textContent = slot.label;
      row.appendChild(label);
      PALETTES[slot.key].forEach((swatch, i) => {
        const pick = document.createElement('button');
        pick.className = 'swatch-pick';
        pick.dataset.slot = slot.key;
        pick.dataset.index = String(i);
        pick.title = swatch.name;
        pick.style.background = swatch.hex;
        pick.setAttribute('data-testid', `swatch-${slot.key}-${i}`);
        pick.onclick = () => {
          appearance[slot.key] = i;
          refresh();
        };
        row.appendChild(pick);
      });
      rows.appendChild(row);
    }
    refresh();

    const finish = (result: OkJoin) => {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ name: result.name, pin: pinInput.value || session?.pin, appearance: result.appearance }),
      );
      window.clearInterval(previewTimer);
      overlay.remove();
      resolve(result);
    };

    const attempt = async () => {
      errorBox.textContent = '';
      const result = await backend.join(nameInput.value, pinInput.value, { ...appearance });
      if (result.ok) {
        finish(result);
      } else {
        errorBox.textContent =
          result.reason === 'WRONG_PIN'
            ? t.join.errWrongPin
            : result.reason === 'BAD_PIN'
              ? t.join.errBadPin
              : t.join.errBadName;
      }
    };

    overlay.querySelector<HTMLButtonElement>('#join-btn')!.onclick = attempt;
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attempt();
    });

    if (session) {
      // prefill the returning Player's identity and current look — the join
      // screen always shows, so the Avatar stays editable at every join
      nameInput.value = session.name;
      pinInput.value = session.pin;
    }
  });
}
