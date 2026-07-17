# TEMPLATE — wiring a system into GameScene

Copied from the shipped `GameScene.create()` wiring block and `update()`
dispatch. Wiring has THREE parts, all in GameScene: construction+refs,
lifecycle (create/destroy), and the numbered update() position.

## 1. Construct + wire refs (GameScene.create, shipped excerpt)

Systems are constructed in ONE visible block. Cross-system reads are wired as
**late-set public refs** right after construction — this is the one place
they're allowed to be assigned:

```ts
    this.buildContext();
    this.atmosphere = new AtmosphereSystem(this.ctx, this);
    this.systems.push(this.atmosphere);
    this.districtSystem = new DistrictSystem(this.ctx, this, this.atmosphere);
    this.systems.push(this.districtSystem);
    this.atmosphere.district = this.districtSystem;
    // …
    this.fightSystem = new FightSystem(this.ctx, this);
    this.systems.push(this.fightSystem);
    this.projectile = new ProjectileSystem(this.ctx, this);
    this.systems.push(this.projectile);
    this.fightSystem.seal = this.sealSystem;
    this.fightSystem.district = this.districtSystem;
    this.fightSystem.atmosphere = this.atmosphere;
    this.fightSystem.delve = this.delve;
    this.fightSystem.echo = this.echoSystem;
    this.fightSystem.projectile = this.projectile;
    this.projectile.fight = this.fightSystem;
    this.projectile.delve = this.delve;
    this.projectile.wildlife = this.wildlife;
```

The system declares each ref it expects (in the system file):

```ts
export class ProjectileSystem implements GameSystem {
  /** cross-system refs, wired by GameScene (ADR-0018 §3) */
  fight!: FightSystem;
  delve!: DelveSystem;
  wildlife!: WildlifeSystem;
```

⚠️ **The wiring-bug class:** `!:` declarations are NOT compile-checked against
the wiring block. For EVERY `x!:` field you declare, grep GameScene.create for
`yourSystem.x =`. Two shipped bugs came from exactly this gap
(`fogSystem.district`, `harvest.fishing` — the latter wired BEFORE the target
system was constructed, which is the same bug in a subtler coat: wire AFTER
both ends exist).

## 2. Lifecycle (shipped)

`this.systems.push(...)` registers destroy(); create() is called explicitly at
the right bootstrap moment (ordering matters — e.g. PlayerSystem.create builds
the player sprite other creates depend on):

```ts
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const s of this.systems) s.destroy();
      this.systems = [];
    });
    // …later, at its documented bootstrap point:
    this.sealSystem.create();
```

## 3. The numbered update() position (shipped excerpt)

The per-frame order is documented as a numbered list ABOVE update() and each
system is called EXPLICITLY at its position — never a flat loop, because the
delve early-return (2) and the chat/stun halt (13) live INSIDE the sequence:

```ts
  update(time: number, delta: number): void {
    if (!this.player) return;
    // …
    if (this.inDelve) {
      this.delve.updateDelve(time, delta);
      return;                                   // ← NO overworld system ticks in delve mode
    }
    this.stationsSystem.update(time, delta);    // §8 step 3
    this.atmosphere.update(time, delta);        // §8 step 4
    // …
    this.fishingSystem.update(time, delta);     // §8 step 11
    // …
    this.inputSystem.update(time, delta, stunned); // §8 steps 13–19
  }
```

Adding a system = adding ONE numbered line to the §8 doc comment AND the
matching explicit call. If your system is overworld-only, it goes BELOW the
inDelve early-return; if it must tick in both modes, that is a design decision
to surface, not a default.

## 4. Interaction verbs

A new E/LMB verb is an `xxxAction(): EAction | null` method on your system,
inserted at a deliberate position in InputSystem's `resolveEAction` — the ONE
ordered priority chain. Never a second dispatch path, never a raw key handler.
