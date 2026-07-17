/**
 * Tiny event bus wiring the Phaser world to the HTML HUD — now TYPED (ADR-0018).
 *
 * `GameEvents` maps every event name to its payload tuple, so every emit/on
 * site across the scene, the systems and the HUD is compile-checked: a wrong
 * event name or payload type fails `npm run build`. The runtime object is the
 * same 20-line singleton it always was — the generics erase at compile time
 * and the HUD's event names/payloads are a frozen contract (plan §7).
 */
import type {
  ChatMsg,
  DepthDescentRecord,
  DepthRecords,
  Inventory,
  JourneyState,
  QuestState,
  RefinerConfig,
  RefinerState,
  SawmillState,
  SealState,
  WardenAltarState,
  WardenWorldState,
} from '../backend/types';
import type { EquippedGear, WeaponSlot } from '../content/armor';
import type { ItemId, StructureId } from '../content/items';
import type { VillageRecord } from '../content/village';
import type { AudioChannel } from '../config';

/** a Refiner panel's target: which station, run on which tuning, shown under which name */
export interface RefinerTarget {
  id: string;
  cfg: RefinerConfig;
  name: string;
}

/** every bus event → its payload tuple (scene/systems ↔ HUD, both directions) */
export interface GameEvents {
  // ---- scene/systems → HUD
  inventory: [inv: Inventory];
  equipped: [gear: EquippedGear];
  chat: [msg: ChatMsg];
  chatlog: [msgs: ChatMsg[]];
  zone: [name: string];
  presence: [names: string[]];
  toast: [text: string, kind: 'good' | 'bad' | 'info'];
  mute: [muted: boolean];
  'place-mode': [on: boolean];
  journey: [j: JourneyState];
  quest: [q: QuestState];
  'sawmill-built': [built: boolean];
  seal: [s: SealState];
  'seal-near': [near: boolean];
  'warden-altar': [wardenId: string, altar: WardenAltarState];
  wardens: [w: Record<string, WardenWorldState>];
  'warden-altar-near': [wardenId: string | null];
  village: [v: VillageRecord];
  'village-near': [near: boolean];
  'forge-near': [near: boolean];
  'open-forge': [];
  fog: [explored: Set<number>, chunksW: number, chunksH: number];
  'fight-start': [f: { hp: number; maxHp: number; engagedAt: number | null; awakeMs: number; roster: string[]; title?: string | null }];
  'fight-hp': [hp: number];
  'fight-end': [];
  buff: [until: number];
  lore: [title: string, text: string];
  'crate-open': [crateId: string, contents: Inventory];
  'crate-changed': [crateId: string, contents: Inventory];
  'loot-open': [loot: Inventory, sub: string];
  'loot-changed': [loot: Inventory];
  'records-open': [r: DepthRecords];
  'depth-record': [top: DepthDescentRecord | null];
  'village-give-open': [inv: Inventory];
  'village-give-close': [];
  'trade-open': [o: { inventory: Inventory; tier: number }];
  'trade-close': [];
  'village-name-open': [o: { name: string; crest: number }];
  'chronicle-open': [o: { lines: string[] }];
  'fountain-open': [o: { have: number; wishes: number; threshold: number; festivalUntil: number }];
  'fountain-close': [];
  festival: [until: number];
  'sawmill-open': [sawmillId: string, state: SawmillState];
  'refiner-open': [target: RefinerTarget, state: RefinerState];
  'sign-prompt': [];
  pos: [o: { x: number; y: number; others: { x: number; y: number }[]; view?: { x: number; y: number; w: number; h: number } }];
  // ---- HUD → scene/systems
  held: [id: ItemId | null];
  'world-label-scale': [mult: number];
  'send-chat': [text: string];
  'chat-focus': [];
  'chat-blur': [];
  'toggle-mute': [];
  'set-volume': [channel: AudioChannel, value: number];
  craft: [recipeId: string];
  'equip-toggle': [item: ItemId];
  'weapon-slot-set': [slot: WeaponSlot, item: ItemId | null];
  'request-place': [item: StructureId];
  'village-give': [amounts: Inventory];
  'trade-do': [o: { give: ItemId; count: number; get: ItemId }];
  'fountain-wish': [count: number];
  'village-name-set': [o: { name: string; crest: number }];
  'village-note-add': [text: string];
  'crate-deposit': [crateId: string, item: ItemId, count: number];
  'crate-withdraw': [crateId: string, item: ItemId, count: number];
  'loot-take': [item: ItemId, count: number];
  'loot-take-all': [];
  'loot-close': [];
  'sawmill-deposit': [sawmillId: string];
  'sawmill-refresh': [sawmillId: string];
  'sawmill-collect': [sawmillId: string];
  'refiner-deposit': [target: RefinerTarget];
  'refiner-refresh': [target: RefinerTarget];
  'refiner-collect': [target: RefinerTarget];
  eat: [id?: ItemId];
  'drop-item': [id: ItemId, count: number];
  'sign-text': [text: string | null];
}

type Handler = (...args: any[]) => void;

class Bus {
  private handlers = new Map<string, Set<Handler>>();

  on<K extends keyof GameEvents & string>(event: K, cb: (...args: GameEvents[K]) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb as Handler);
  }

  off<K extends keyof GameEvents & string>(event: K, cb: (...args: GameEvents[K]) => void): void {
    this.handlers.get(event)?.delete(cb as Handler);
  }

  emit<K extends keyof GameEvents & string>(event: K, ...args: GameEvents[K]): void {
    this.handlers.get(event)?.forEach((cb) => cb(...args));
  }
}

export const bus = new Bus();
export type TypedBus = typeof bus;
