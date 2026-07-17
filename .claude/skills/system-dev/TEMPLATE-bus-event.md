# TEMPLATE — a typed bus event (`src/ui/bus.ts`)

The bus is a 20-line runtime singleton with a compile-time `GameEvents`
name→payload map layered on top (ADR-0018). A wrong event name or payload
fails `npm run build`. The HUD's existing names/payloads are a **frozen
contract** — add, never rename/reshape.

## 1. Declare the event in the GameEvents map (ui/bus.ts, shipped excerpt)

```ts
/** every bus event → its payload tuple (scene/systems ↔ HUD, both directions) */
export interface GameEvents {
  // ---- scene/systems → HUD
  inventory: [inv: Inventory];
  zone: [name: string];
  toast: [text: string, kind: 'good' | 'bad' | 'info'];
  seal: [s: SealState];
  'loot-open': [loot: Inventory, sub: string];
  'loot-changed': [loot: Inventory];
  // ---- HUD → scene/systems
  craft: [recipeId: string];
  'loot-take': [item: ItemId, count: number];
  'loot-take-all': [];
  'loot-close': [];
  eat: [id?: ItemId];
  'drop-item': [id: ItemId, count: number];
  // …your new event goes in the matching direction section, name: [payload tuple]
}
```

The runtime class underneath (do NOT touch it — the generics erase at compile
time):

```ts
class Bus {
  private handlers = new Map<string, Set<Handler>>();

  on<K extends keyof GameEvents & string>(event: K, cb: (...args: GameEvents[K]) => void): void { … }
  off<K extends keyof GameEvents & string>(event: K, cb: (...args: GameEvents[K]) => void): void { … }
  emit<K extends keyof GameEvents & string>(event: K, ...args: GameEvents[K]): void { … }
}
export const bus = new Bus();
```

## 2. Emit from a system (SealSystem.applySeal, shipped)

```ts
  applySeal(seal: SealState): void {
    this.seal = seal;
    this.ctx.bus.emit('seal', seal);
    // …
  }
```

## 3. Listen with the detachable arrow-field pair (DelveSystem, shipped)

```ts
  private onLootTakeAll = (): void => this.claimLoot({ ...this.lootPending });

  create(): void {
    this.ctx.bus.on('loot-take-all', this.onLootTakeAll);
  }
  destroy(): void {
    this.ctx.bus.off('loot-take-all', this.onLootTakeAll);
  }
```

## Rules embedded in this shape

- Declare the tuple in `GameEvents` FIRST; the emit/on sites then type-check.
- Direction comment (`→ HUD` vs `HUD →`) keeps the map navigable — put the
  event in the right section.
- `'inventory'` is emitted by `ctx.setInventory` ONLY — never emit it directly.
- HUD-consumed events are frozen once shipped; a payload change means the HUD
  changed, which is its own reviewed decision — not a side effect.
