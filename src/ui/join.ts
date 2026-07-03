import { SESSION_KEY } from '../config';
import type { AvatarId, Backend, JoinResult } from '../backend/types';
import { AVATARS } from '../assetConfig';

type OkJoin = Extract<JoinResult, { ok: true }>;

/**
 * Shows the join screen (name + 4-digit PIN + avatar pick) and resolves once
 * the backend accepts. Resumes a stored session silently when possible.
 */
export function showJoin(backend: Backend): Promise<OkJoin> {
  return new Promise((resolve) => {
    const stored = localStorage.getItem(SESSION_KEY);
    const session = stored ? (JSON.parse(stored) as { name: string; pin: string; avatar: AvatarId }) : null;

    const overlay = document.createElement('div');
    overlay.id = 'join-overlay';
    overlay.innerHTML = `
      <div id="join-card">
        <h1>🌴 JUNGLE WORLD</h1>
        <div class="sub">one persistent jungle · gather, craft, build</div>
        <div>
          <label for="join-name">Player name</label>
          <input id="join-name" data-testid="join-name" maxlength="16" placeholder="e.g. Robin" />
        </div>
        <div>
          <label for="join-pin">4-digit PIN (to reclaim your Player anywhere)</label>
          <input id="join-pin" data-testid="join-pin" maxlength="4" inputmode="numeric" placeholder="0000" />
        </div>
        <div>
          <label>Avatar</label>
          <div id="avatar-row"></div>
        </div>
        <div id="join-error" data-testid="join-error"></div>
        <button id="join-btn" data-testid="join-btn">Enter the Jungle</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector<HTMLInputElement>('#join-name')!;
    const pinInput = overlay.querySelector<HTMLInputElement>('#join-pin')!;
    const errorBox = overlay.querySelector<HTMLElement>('#join-error')!;
    const row = overlay.querySelector<HTMLElement>('#avatar-row')!;
    let avatar: AvatarId = 0;

    AVATARS.forEach((a, i) => {
      const pick = document.createElement('button');
      pick.className = 'avatar-pick' + (i === 0 ? ' selected' : '');
      pick.setAttribute('data-testid', `join-avatar-${i}`);
      pick.innerHTML = `<div class="swatch" style="background:#${a.tint.toString(16).padStart(6, '0')}"></div>${a.name}`;
      pick.onclick = () => {
        avatar = i as AvatarId;
        row.querySelectorAll('.avatar-pick').forEach((p) => p.classList.remove('selected'));
        pick.classList.add('selected');
      };
      row.appendChild(pick);
    });

    const finish = (result: OkJoin) => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ name: result.name, pin: pinInput.value || session?.pin, avatar: result.avatar }));
      overlay.remove();
      resolve(result);
    };

    const attempt = async () => {
      errorBox.textContent = '';
      const result = await backend.join(nameInput.value, pinInput.value, avatar);
      if (result.ok) {
        finish(result);
      } else {
        errorBox.textContent =
          result.reason === 'WRONG_PIN'
            ? 'That name is taken and the PIN does not match.'
            : result.reason === 'BAD_PIN'
              ? 'PIN must be exactly 4 digits.'
              : 'Name must be 2–16 letters/numbers.';
      }
    };

    overlay.querySelector<HTMLButtonElement>('#join-btn')!.onclick = attempt;
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attempt();
    });

    if (session) {
      nameInput.value = session.name;
      pinInput.value = session.pin;
      avatar = session.avatar;
      // silent resume — falls back to the visible form on failure
      backend.join(session.name, session.pin, session.avatar).then((result) => {
        if (result.ok) finish(result);
      });
    }
  });
}
