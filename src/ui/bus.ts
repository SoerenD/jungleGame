/** Tiny event bus wiring the Phaser world to the HTML HUD. */
type Handler = (...args: any[]) => void;

class Bus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, cb: Handler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
  }

  off(event: string, cb: Handler): void {
    this.handlers.get(event)?.delete(cb);
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach((cb) => cb(...args));
  }
}

export const bus = new Bus();
