import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MockBackend } from '../../src/backend/MockBackend';
import type { HitResult } from '../../src/backend/types';
import type { StructureId } from '../../src/content/items';
import { CHIME_KILN } from '../../src/config';

// The MockBackend is the single-player rules ENGINE — where gathering, crafting,
// the Seal and the pack cap actually mutate state. This integration test drives
// the real gather → craft loop the way a player would, so the core loop no
// longer needs a manual playtest to trust. It runs headless: happy-dom supplies
// localStorage, `fetch` is stubbed to serve the on-disk map, and the two sources
// of wall-clock/network jitter (network lag, the roaming bots) are neutralised
// so the loop is deterministic.

// vitest runs from the project root, so the map resolves off cwd (import.meta.url
// is an http URL under happy-dom, not a file path)
const worldData = JSON.parse(readFileSync(resolve(process.cwd(), 'public/map/world-data.json'), 'utf8'));
const firstNodeOfType = (type: string): string => worldData.nodes.find((n: { type: string }) => n.type === type).id;

beforeAll(() => {
  // serve the on-disk world to MockBackend.init()'s fetch()
  vi.stubGlobal('fetch', async () => ({ json: async () => worldData }));
});

/** a fresh, deterministic backend already joined as a solo player */
async function freshBackend(name = 'Tester'): Promise<MockBackend> {
  const mb = new MockBackend();
  (mb as unknown as { lag: () => Promise<void> }).lag = () => Promise.resolve(); // no network latency
  (mb as unknown as { startBots: () => void }).startBots = () => {}; // no roaming-bot interference
  await mb.init();
  const res = await mb.join(name, '1234', undefined as never, 'default');
  expect(res.ok).toBe(true);
  return mb;
}

/** place a Structure the player already holds on the first buildable tile near
 *  spawn, returning its id (scans outward; only a successful place spends it) */
async function placeSomewhere(mb: MockBackend, item: StructureId): Promise<string> {
  const { tx, ty } = worldData.spawn as { tx: number; ty: number };
  for (let dy = 0; dy < 48; dy++) {
    for (let dx = 0; dx < 48; dx++) {
      const res = await mb.placeStructure(item, tx + dx, ty + dy);
      if (res.ok) return res.structure.id;
    }
  }
  throw new Error(`could not place ${item} anywhere near spawn`);
}

/** fell a node to completion, returning the finishing HitResult */
async function fell(mb: MockBackend, nodeId: string, withTool?: 'axe' | 'pickaxe'): Promise<HitResult> {
  for (let i = 0; i < 10; i++) {
    const r = await mb.hitNode(nodeId, withTool);
    if (!r.ok) throw new Error(`hit failed: ${r.reason}`);
    if (r.finishing) return r;
  }
  throw new Error('node never depleted');
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // above the map-piece drop chance → clean yields
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MockBackend — the core gather → craft loop', () => {
  it('a new player joins with an empty pack at the spawn', async () => {
    const mb = await freshBackend();
    const res = await mb.join('Tester', '1234', undefined as never, 'default');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.inventory).toEqual({});
      expect(res.journey.steps).toBeDefined();
    }
  });

  it('felling a tree yields wood on the finishing hit', async () => {
    const mb = await freshBackend();
    const tree = firstNodeOfType('tree');
    const finish = await fell(mb, tree);
    expect(finish.ok).toBe(true);
    if (finish.ok) {
      expect(finish.finishing).toBe(true);
      expect(finish.gained?.wood).toBe(3); // NODE_TYPES.tree.yield
      expect(finish.inventory?.wood).toBe(3);
      expect(finish.node.hp).toBe(0);
    }
  });

  it('gathers wood + stone, then crafts an axe, spending exactly the recipe cost', async () => {
    const mb = await freshBackend();
    await fell(mb, firstNodeOfType('tree')); // +3 wood
    await fell(mb, firstNodeOfType('rock')); // +3 stone

    const craft = await mb.craft('axe'); // costs wood 3, stone 2
    expect(craft.ok).toBe(true);
    if (craft.ok) {
      expect(craft.crafted).toBe('axe');
      expect(craft.inventory.axe).toBe(1);
      expect(craft.inventory.wood ?? 0).toBe(0); // 3 − 3
      expect(craft.inventory.stone ?? 0).toBe(1); // 3 − 2
    }
  });

  it('the in-hand matching tool doubles harvest damage (2 hits instead of 4)', async () => {
    const mb = await freshBackend();
    // earn an axe first
    await fell(mb, firstNodeOfType('tree'));
    await fell(mb, firstNodeOfType('rock'));
    await mb.craft('axe');

    // a fresh tree with the axe in hand falls in two swings (dmg 2 vs maxHp 4)
    const tree2 = worldData.nodes.filter((n: { type: string }) => n.type === 'tree')[1].id;
    const first = await mb.hitNode(tree2, 'axe');
    expect(first.ok && first.finishing).toBe(false); // still standing after one swing
    const second = await mb.hitNode(tree2, 'axe');
    expect(second.ok && second.finishing).toBe(true); // felled on the second
  });
});

describe('MockBackend — rule enforcement (server-authoritative)', () => {
  it('rejects hits on a depleted node and on unknown nodes', async () => {
    const mb = await freshBackend();
    const tree = firstNodeOfType('tree');
    await fell(mb, tree);
    const again = await mb.hitNode(tree);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('DEPLETED');

    const bogus = await mb.hitNode('does-not-exist');
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.reason).toBe('UNKNOWN_NODE');
  });

  it('refuses a craft the player cannot afford', async () => {
    const mb = await freshBackend();
    const res = await mb.craft('sword'); // needs Delve loot the player has none of
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('INSUFFICIENT');
  });

  it('refuses an unknown recipe', async () => {
    const mb = await freshBackend();
    const res = await mb.craft('not_a_recipe');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('UNKNOWN_RECIPE');
  });
});

describe('MockBackend — the Seal offering', () => {
  it('contributes carried resources to the communal Seal', async () => {
    const mb = await freshBackend();
    // gather two trees + a rock so there is a surplus to offer
    await fell(mb, worldData.nodes.filter((n: { type: string }) => n.type === 'tree')[0].id);
    await fell(mb, worldData.nodes.filter((n: { type: string }) => n.type === 'tree')[1].id);
    await fell(mb, firstNodeOfType('rock'));

    const before = await mb.loadWorld();
    const woodBefore = before.seal.contributed.wood ?? 0;

    const res = await mb.contributeSeal();
    expect(res.ok).toBe(true);
    if (res.ok) {
      // something was taken from the pack toward the Seal
      expect(Object.keys(res.taken).length).toBeGreaterThan(0);
      expect(res.seal.contributed.wood ?? 0).toBeGreaterThanOrEqual(woodBefore);
    }
  });
});

describe('MockBackend — dismantle returns UNCRAFTABLE Structures to the pack', () => {
  it('dismantling the (uncraftable) Echo Reliquary refunds the item, not nothing', async () => {
    const mb = await freshBackend();
    mb.debugGrant({ hushdark_reliquary: 1 });
    const id = await placeSomewhere(mb, 'hushdark_reliquary');
    const res = await mb.dismantleStructure(id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.refund).toEqual({ hushdark_reliquary: 1 }); // the reward comes back
      expect(res.inventory.hushdark_reliquary).toBe(1);
    }
  });

  it('a CRAFTABLE Structure still refunds its recipe cost, not itself', async () => {
    const mb = await freshBackend();
    mb.debugGrant({ campfire: 1 });
    const id = await placeSomewhere(mb, 'campfire');
    const res = await mb.dismantleStructure(id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.refund).toEqual({ wood: 3, stone: 2 }); // the campfire recipe cost
      expect(res.refund.campfire).toBeUndefined();
      expect(res.inventory.campfire ?? 0).toBe(0);
    }
  });
});

describe('MockBackend — the Realm gate key is spent when the gate is turned', () => {
  // DistrictSystem.turnGateKey composes openRealmGate (opens the world flag) with
  // dropItem (spends the opener's key). These assert the two backend primitives it
  // relies on: the turn opens the gate AND consuming the key persists.
  it('opening a dormant Realm gate then consuming the key spends exactly one', async () => {
    const mb = await freshBackend();
    mb.debugGrant({ hushdark_key: 1 });

    const open = await mb.openRealmGate('echo');
    expect(open.ok).toBe(true);

    const drop = await mb.dropItem('hushdark_key', 1);
    expect(drop.ok).toBe(true);
    if (drop.ok) expect(drop.inventory.hushdark_key ?? 0).toBe(0);
  });

  it('a second turn finds it ALREADY_OPEN, so no further key is spent', async () => {
    const mb = await freshBackend();
    mb.debugGrant({ hushdark_key: 2 }); // two keys in hand

    // first turn: opens the gate, turnGateKey spends one key (dropItem on ok)
    expect((await mb.openRealmGate('echo')).ok).toBe(true);
    await mb.dropItem('hushdark_key', 1);

    // second turn: already open → turnGateKey returns early, no dropItem
    const again = await mb.openRealmGate('echo');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_OPEN');

    // exactly one key was spent — the ALREADY_OPEN attempt consumed none
    expect(mb.debugGrant({})?.hushdark_key).toBe(1);
  });
});

describe('MockBackend — the Village pool accepts every item', () => {
  it('a founded Village accepts an echo_sigil into the pool', async () => {
    const mb = await freshBackend();
    mb.debugGrant({ village_hall: 1 });
    await placeSomewhere(mb, 'village_hall'); // founds the Village (tier 1)
    mb.debugGrant({ echo_sigil: 1 });

    const res = await mb.contributeVillage({ echo_sigil: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.taken.echo_sigil).toBe(1);
      expect(res.gained).toBe(60); // its tuned prestige value
      expect(res.inventory.echo_sigil ?? 0).toBe(0);
      expect(res.village.pool).toBe(60);
    }
  });
});

describe('MockBackend — stations expose an in-progress timer for load-time hydration', () => {
  it('a Sawmill mid-mill reports wood + a nextPlankMs to a fresh read (no interaction)', async () => {
    const mb = await freshBackend();
    mb.debugGrant({ sawmill: 1, wood: 5 });
    const id = await placeSomewhere(mb, 'sawmill');
    const dep = await mb.sawmillDeposit(id);
    expect(dep.ok).toBe(true);

    // hydrateStations() does exactly this read on load — it must see the running timer
    const state = await mb.sawmillOpen(id);
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.state.wood).toBeGreaterThan(0);
      expect(state.state.nextPlankMs).not.toBeNull();
      expect(state.state.nextPlankMs!).toBeGreaterThan(0);
    }
  });

  it('a Chime Kiln mid-refine reports input + a nextMs to a fresh read', async () => {
    const mb = await freshBackend();
    mb.debugGrant({ chime_kiln: 1, echo_crystal: 4 });
    const id = await placeSomewhere(mb, 'chime_kiln');
    const dep = await mb.refinerDeposit(id, CHIME_KILN);
    expect(dep.ok).toBe(true);

    const state = await mb.refinerOpen(id, CHIME_KILN);
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.state.input).toBeGreaterThan(0);
      expect(state.state.nextMs).not.toBeNull();
      expect(state.state.nextMs!).toBeGreaterThan(0);
    }
  });
});
