import Phaser from 'phaser';
import './ui/styles.css';
import { createBackend } from './backend/createBackend';
import { applyUiScale, loadUiScale, MUTE_KEY } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { initHud } from './ui/hud';
import { showIntro } from './ui/intro';
import { showJoin } from './ui/join';

// dev helper (like __jw in GameScene): lets tooling reach the game instance,
// e.g. to pump the loop when the preview tab is hidden and RAF is suspended
const exposeGame = (g: Phaser.Game) => {
  if (import.meta.env.DEV) (window as any).__game = g;
  return g;
};

// dev-only ?pump: headless previews run the tab hidden, which suspends RAF
// and can strand Phaser's boot (textures turn ready before the listener is
// armed). Pretend the tab is visible and drive the loop from a MessageChannel
// (unthrottled in hidden tabs). Never active in production builds.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('pump')) {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
  } catch {
    /* already spoofed */
  }
  const ch = new MessageChannel();
  let last = 0;
  ch.port1.onmessage = () => {
    const g = (window as any).__game as Phaser.Game | undefined;
    const now = performance.now();
    if (g && now - last >= 33) {
      last = now;
      if (g.isBooted && !g.isRunning && (g.textures as any)._pending === 0) {
        try {
          (g as any).texturesReady(); // re-fire the READY the hidden boot missed
        } catch {
          /* not ready yet */
        }
      }
      if (g.isRunning) g.loop.step(now);
    }
    ch.port2.postMessage(0);
  };
  ch.port2.postMessage(0);
}

const game = exposeGame(new Phaser.Game({
  // ?canvas: headless/hidden windows can have a broken WebGL context — the
  // 2D renderer always works there (dev verification aid, harmless otherwise)
  type: new URLSearchParams(window.location.search).has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1a0e',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
  },
  scene: [BootScene, GameScene],
}));

async function start(): Promise<void> {
  // The Backend interface is all the game knows; the factory picks Supabase
  // (shared world) when configured, else the local MockBackend (see ADR-0001).
  const backend = createBackend();
  const assetsReady = new Promise<void>((res) => game.events.once('assets-ready', () => res()));
  await backend.init();
  const me = await showJoin(backend);
  // the intro story renders once per Player, before gameplay ever starts;
  // the Welcome Stone beside the spawn re-shows it on demand
  if (!me.introSeen) {
    await showIntro();
    void backend.markIntroSeen();
  }
  await assetsReady;
  initHud(me.name, localStorage.getItem(MUTE_KEY) === '1');
  game.scene.stop('BootScene');
  game.scene.start('GameScene', { backend, me });
}

// apply the Player's saved text size before any screen renders (join, intro, HUD)
applyUiScale(loadUiScale());

void start();
