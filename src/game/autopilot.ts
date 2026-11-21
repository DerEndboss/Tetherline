import { Bot } from '../sim/bot';
import '../sim/drones';
import type { World } from '../sim/world';
import { thinkRequest, type ThinkReply } from './autopilot-snapshot';
import type { Game } from './game';

/**
 * The autopilot switch of the settings: while it is on, a bot plays the run through the same commands a player
 * sends (ghosts the drone builds). It thinks in game time, so the game speed setting makes it faster too.
 *
 * In the browser the bot plans in a Web Worker (autopilot-worker.ts): its belt searches cost up to hundreds of
 * milliseconds on a big base. The main thread only sends a small snapshot of the run (autopilot-snapshot.ts:
 * the buildings packed into one transferred array) when the bot is due, and enqueues the commands that come back.
 * Where there is no Worker (tests, scripts) the bot thinks inline.
 *
 * `attachAutopilot(game, isOn, subscribe)` wires it to a preference: `isOn()` says whether it should play now and
 * `subscribe(fn)` calls `fn` when that may have changed.
 */

/** Game ticks between two looks (the bot itself decides at most twice a game second). */
const THINK_TICKS = 10;
/** Real time between two checks whether a look is due. */
const STEP_MS = 50;

/** One way of running the bot: inline or in a worker. */
interface Planner {
  /** Asks for one look; `done` gets the commands (maybe later). Returns false when a look is still running. */
  look(world: World, gen: number, done: (commands: ThinkReply) => void): boolean;
  stop(): void;
}

class InlinePlanner implements Planner {
  private bot: Bot | null = null;
  private gen = -1;

  look(world: World, gen: number, done: (r: ThinkReply) => void): boolean {
    if (gen !== this.gen || !this.bot) {
      this.gen = gen;
      this.bot = new Bot(world);
    }
    const commands = this.bot.think();
    done({ gen, tick: world.state.tick, commands, ms: 0, note: this.bot.log.at(-1) ?? '' });
    return true;
  }

  stop(): void {
    this.bot = null;
  }
}

class WorkerPlanner implements Planner {
  private readonly worker = new Worker(new URL('./autopilot-worker.ts', import.meta.url), { type: 'module' });
  private busy = false;
  private mapGen = -1;
  private done: ((r: ThinkReply) => void) | null = null;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<ThinkReply>) => {
      this.busy = false;
      this.done?.(e.data);
    };
    this.worker.onerror = () => {
      this.busy = false;
    };
  }

  look(world: World, gen: number, done: (r: ThinkReply) => void): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.done = done;
    const req = thinkRequest(world, gen, gen !== this.mapGen);
    this.worker.postMessage(req, [req.state.buildings.buffer]);
    this.mapGen = gen;
    return true;
  }

  stop(): void {
    this.worker.terminate();
  }
}

export class Autopilot {
  private planner: Planner | null = null;
  private world: World | null = null;
  private gen = 0;
  private lastLook = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** The worker's time of the last look and what the bot last did (dev console). */
  lastMs = 0;
  note = '';

  constructor(private readonly game: Game) {}

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.planner = typeof Worker === 'undefined' ? new InlinePlanner() : new WorkerPlanner();
    this.timer = setInterval(() => this.step(), STEP_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.planner?.stop();
    this.planner = null;
    this.world = null;
  }

  /** One check: a new bot for a new world, then a look when one is due. */
  step(): void {
    const w = this.game.world;
    if (this.game.paused || !this.planner) return;
    if (w !== this.world) {
      this.world = w;
      this.gen++;
      this.lastLook = -Infinity;
    }
    if (w.state.tick - this.lastLook < THINK_TICKS) return;
    const gen = this.gen;
    if (this.planner.look(w, gen, (r) => this.apply(r))) this.lastLook = w.state.tick;
  }

  private apply(r: ThinkReply): void {
    if (r.gen !== this.gen || !this.planner) return; // a look at a world that is gone
    this.lastMs = r.ms;
    this.note = r.note;
    for (const c of r.commands) this.game.enqueue(c);
  }
}

/** Starts and stops an autopilot as a switch changes. Returns a function that detaches it. */
export function attachAutopilot(game: Game, isOn: () => boolean, subscribe: (fn: () => void) => () => void): () => void {
  const pilot = new Autopilot(game);
  const sync = (): void => (isOn() ? pilot.start() : pilot.stop());
  sync();
  const off = subscribe(sync);
  return () => {
    off();
    pilot.stop();
  };
}
