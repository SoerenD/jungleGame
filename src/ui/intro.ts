import { INTRO_TEXT, INTRO_TITLE } from '../content/lore';
import { t } from '../i18n';

/**
 * Full-screen intro story. Shown once per Player on first join (before
 * gameplay) and re-readable at the Welcome Stone. Skippable with a click,
 * Enter, Space or Escape; resolves when dismissed.
 */
export function showIntro(): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'intro-overlay';
    const paragraphs = INTRO_TEXT.split('\n\n')
      .map((p) => `<p>${p}</p>`)
      .join('');
    overlay.innerHTML = `
      <div id="intro-card" data-testid="intro-card">
        <h2>${INTRO_TITLE}</h2>
        ${paragraphs}
        <div class="intro-hint">${t.intro.hint}</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    overlay.addEventListener('click', close);
    window.addEventListener('keydown', onKey, true);
  });
}
