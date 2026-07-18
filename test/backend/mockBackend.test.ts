import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MockBackend } from '../../src/backend/MockBackend';
import type { HitResult } from '../../src/backend/types';

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
