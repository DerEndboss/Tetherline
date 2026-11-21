import type { ContentRegistry } from '../content/registry';
import { FixedClock } from '../sim/clock';
import type { Command, SimEvent } from '../sim/commands';
import { step } from '../sim/tick';
import type { World } from '../sim/world';
import { buildSnapshot, type Snapshot } from './snapshot';

type Listener = () => void;

/**
 * Owns the running world, the fixed clock and the command queue. DOM-free. The renderer reads `world` (never
 * mutates it); the UI reads throttled snapshots and sends commands with `enqueue`.
 */
export class Game {
  readonly clock = new FixedClock();
  private queue: Command[] = [];
  private eventListeners = new Set<(events: readonly SimEvent[]) => void>();
  private resetListeners = new Set<Listener>();
  private snapListeners = new Set<Listener>();
  private snap: Snapshot;
  private lastSnap = -Infinity;
  /** Paused while the tab is hidden or a menu is open (no offline progress). */
  paused = false;

  constructor(
    readonly content: ContentRegistry,
    public world: World,
    /** Which save slot this run lives in (1..3). */
    public slot: number,
  ) {
    this.snap = buildSnapshot(world);
  }

  enqueue(command: Command): void {
    this.queue.push(command);
  }

  setTimeScale(scale: number): void {
    this.clock.timeScale = scale;
  }

  /** Advances by real frame time: 0..n ticks, events to listeners, a snapshot at most every 100 ms. */
  frame(ms: number, now: number): void {
    const ticks = this.paused ? 0 : this.clock.advance(ms);
    const events: SimEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      events.push(...step(this.world, this.queue));
      this.queue = [];
    }
    // commands sent while paused still apply (placing ghosts in a paused game)
    if (!ticks && this.queue.length) {
      events.push(...step(this.world, this.queue));
      this.queue = [];
    }
    if (events.length) for (const l of this.eventListeners) l(events);
    if (now - this.lastSnap >= 100) this.publish(now);
  }

  publish(now = this.lastSnap): void {
    this.lastSnap = now;
    this.snap = buildSnapshot(this.world);
    for (const l of this.snapListeners) l();
  }

  /** Swaps in another run (load a slot, new round). */
  replaceWorld(world: World, slot = this.slot): void {
    this.world = world;
    this.slot = slot;
    this.queue = [];
    this.clock.reset();
    for (const l of this.resetListeners) l();
    this.publish();
  }

  onEvents(listener: (events: readonly SimEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onReset(listener: Listener): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.snapListeners.add(listener);
    return () => this.snapListeners.delete(listener);
  };

  readonly getSnapshot = (): Snapshot => this.snap;
}
