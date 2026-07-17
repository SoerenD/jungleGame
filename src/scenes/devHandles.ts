/**
 * The `__jw` dev handles (DEV builds only): the ONLY way to drive the game
 * under `?pump&canvas` (hidden preview tabs freeze RAF — see CLAUDE.md).
 * Handle NAMES are a stable contract — memory-lane test flows depend on them
 * (`__jw.state`, `teleport`, `grant`, and the `delve.…` and `wild.…` groups).
 * Re-pointed at the ADR-0018 systems; the shapes returned are unchanged.
 */
import type Phaser from 'phaser';
import type { Inventory } from '../backend/types';
import { PLAYER_SPEED, SPEED_BUFF_FACTOR, TILE } from '../config';
import { createMob, isBossKind, profileOf } from '../content/dungeon';
import { isPredator, isWildKind, type WildKind } from '../content/wildlife';
import type { GameContext } from '../systems/context';
import type { AtmosphereSystem } from '../systems/AtmosphereSystem';
import type { DelveSystem } from '../systems/DelveSystem';
import type { FogSystem } from '../systems/FogSystem';
import type { PresenceSystem } from '../systems/PresenceSystem';
import type { WildlifeSystem } from '../systems/WildlifeSystem';

export function installDevHandles(o: {
  scene: Phaser.Scene;
  ctx: GameContext;
  fog: FogSystem;
  atmosphere: AtmosphereSystem;
  presence: PresenceSystem;
  delve: DelveSystem;
  wildlife: WildlifeSystem;
}): void {
  const { scene, ctx, fog, atmosphere, presence, delve, wildlife } = o;
  const player = () => ctx.player;
  (window as any).__jw = {
    scene,
    state: () => ({
      player: { x: player().x, y: player().y, tx: Math.floor(player().x / TILE), ty: Math.floor(player().y / TILE) },
      zone: fog.currentZone,
      inventory: { ...ctx.inventory },
      remotes: [...presence.remotes.keys()],
      muted: atmosphere.muted,
    }),
    teleport: (tx: number, ty: number) => {
      player().setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE);
    },
    grant: (items: Inventory) => {
      const inv = (ctx.backend as any).debugGrant?.(items) as Inventory | null;
      if (inv) {
        ctx.setInventory(inv);
      }
    },
    // ADR-0011 Deep playtest handles (dev only) — drive the chained Stages
    delve: {
      stage: () => delve.delveStage,
      inDelve: () => ctx.mode === 'delve',
      doorOpen: () => delve.deepDoorOpen,
      mobs: () =>
        [...delve.mobs.values()].map((m) => ({
          id: m.id, kind: m.kind, hp: m.hp, maxHp: m.maxHp, st: m.st, erupt: !!m.erupt, guard: !!m.guard,
          x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10,
        })),
      enterStage1: () => delve.enterDelve(),
      enterDeep: () => delve.enterDeepDirect(),
      descend: () => delve.descendNextStage(),
      /** force the next signature move (eruption/slam/wall/birth) to charge now */
      erupt: () => {
        for (const m of delve.mobs.values()) {
          if (m.st !== 'dead' && profileOf(m.kind).eruptEveryMs) { m.eruptCd = 0; return true; }
        }
        return false;
      },
      /** fell one mob by id as a lethal host-adjudicated hit (drives the real loot/door/complete path) */
      fell: (id: string) => {
        const m = delve.mobs.get(id);
        if (!m || m.st === 'dead') return false;
        delve.delveHitLanded = true;
        delve.delveParticipants.add(ctx.me.name);
        m.hp = 0;
        m.st = 'dead';
        delve.onMobFelled(m);
        return true;
      },
      /** fell every Husk (leaves the boss) — bank kills for shard loot */
      fellHusks: () => {
        let n = 0;
        for (const m of [...delve.mobs.values()]) {
          if (isBossKind(m.kind) || m.st === 'dead') continue;
          delve.delveHitLanded = true;
          delve.delveParticipants.add(ctx.me.name);
          m.hp = 0;
          m.st = 'dead';
          delve.onMobFelled(m);
          n++;
        }
        return n;
      },
      /** fell the current Stage boss (pays loot + Record, opens the next door — ADR-0015) */
      fellBoss: () => {
        for (const m of [...delve.mobs.values()]) {
          if (!isBossKind(m.kind) || m.st === 'dead') continue;
          delve.delveHitLanded = true;
          delve.delveParticipants.add(ctx.me.name);
          m.hp = 0;
          m.st = 'dead';
          delve.onMobFelled(m);
          return true;
        }
        return false;
      },
    },
    // ADR-0012 open-world Wildlife playtest handles (dev only)
    wild: {
      host: () => ({ isHost: wildlife.isWildHost, hostName: wildlife.wildHostName, roster: ctx.backend.creatureRoster() }),
      list: () =>
        [...wildlife.wildMobs.values()].map((m) => ({
          id: m.id, kind: m.kind, st: m.st, hp: m.hp, maxHp: m.maxHp,
          predator: isWildKind(m.kind) && isPredator(m.kind as WildKind),
          x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10,
          danger: wildlife.dangerAt(Math.floor(m.x), Math.floor(m.y)),
          rage: !!m.rage, rageBy: wildlife.wildRage.get(m.id)?.by ?? null,
        })),
      danger: (tx?: number, ty?: number) =>
        wildlife.dangerAt(tx ?? Math.floor(player().x / TILE), ty ?? Math.floor((player().y - 4) / TILE)),
      knockdowns: () => wildlife.wildKnockdownTimes.length,
      /** force-spawn one creature near the Player (host only): kind or 'predator'/'peaceful' */
      spawn: (kind: string) => {
        if (!wildlife.isWildHost) return null;
        const tx = Math.floor(player().x / TILE) + 2;
        const ty = Math.floor((player().y - 4) / TILE);
        let k = kind as WildKind;
        if (kind === 'predator') k = 'jaguar';
        else if (kind === 'peaceful') k = 'capybara';
        const id = `w${wildlife.nextWildId++}`;
        wildlife.wildMobs.set(id, createMob(id, { kind: k, x: tx + 0.5, y: ty + 0.5 }, 1));
        return id;
      },
      /** the speeds every creature obeys vs the Player's (AC4 flee-always proof) */
      speeds: () => ({
        playerTilesPerSec: PLAYER_SPEED / TILE,
        playerBuffed: (PLAYER_SPEED * SPEED_BUFF_FACTOR) / TILE,
        creatures: (['capybara', 'deer', 'boar', 'jaguar'] as WildKind[]).map((kk) => ({
          kind: kk, speed: profileOf(kk).speed, lunge: profileOf(kk).lungeSpeed,
        })),
      }),
    },
  };
}
