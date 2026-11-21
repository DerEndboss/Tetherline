import type { ContentRegistry } from '../content/registry';
import { Bot } from './bot';
import type { Command } from './commands';
import './drones';
import { createRun } from './newgame';
import { orderProgress } from './progression';
import { step } from './tick';
import type { World } from './world';

/**
 * A whole round with the bot at the wheel, headless (tests, `npm run autopilot`). Progress is an order done or
 * the running orders getting at least 1 % further; a stall is the longest time without either.
 */

export interface RoundOptions {
  seed: number;
  size?: string;
  theme?: string;
  minutes: number;
  /** Called once per game minute. */
  onMinute?: (r: Round) => void;
  /** Runs one look of the bot (the script times it). */
  look?: (think: () => Command[]) => Command[];
}

export interface OrderTime {
  id: string;
  minute: number;
}

const TICKS_PER_MINUTE = 1200;
const minuteOf = (tick: number): number => Math.round((tick / TICKS_PER_MINUTE) * 10) / 10;

export class Round {
  readonly world: World;
  readonly bot: Bot;
  readonly orders: OrderTime[] = [];
  won: number | null = null;
  /** Longest time without progress so far, in minutes. */
  longestStall = 0;
  private lastProgress = 0;
  private best = new Map<string, number>();

  constructor(
    content: ContentRegistry,
    readonly opts: RoundOptions,
  ) {
    this.world = createRun(content, { seed: opts.seed, size: opts.size, theme: opts.theme });
    this.bot = new Bot(this.world);
  }

  get minute(): number {
    return this.world.state.tick / TICKS_PER_MINUTE;
  }

  /** Plays to the end (won or out of time). */
  play(): this {
    const end = this.opts.minutes * TICKS_PER_MINUTE;
    const think = (): Command[] => this.bot.think();
    while (this.world.state.tick < end && this.won === null) {
      const cmds = this.opts.look ? this.opts.look(think) : think();
      this.note(step(this.world, cmds));
      if (this.world.state.tick % TICKS_PER_MINUTE === 0) this.everyMinute();
    }
    return this;
  }

  private note(events: { type: string }[]): void {
    const t = this.world.state.tick;
    for (const e of events) {
      if (e.type === 'order-done') this.orders.push({ id: (e as unknown as { id: string }).id, minute: minuteOf(t) });
      if (e.type === 'won') this.won = minuteOf(t);
    }
    if (events.some((e) => e.type === 'order-done')) this.lastProgress = t;
  }

  /** Whether a running order got at least 1 % further since the best seen so far. */
  private advanced(): boolean {
    const w = this.world;
    let moved = false;
    for (const a of w.state.progress.active) {
      const [have, need] = orderProgress(w, w.content.orders.get(a.id), a.count);
      const f = need > 0 ? have / need : 1;
      if (f >= (this.best.get(a.id) ?? 0) + 0.01) {
        this.best.set(a.id, f);
        moved = true;
      }
    }
    return moved;
  }

  private everyMinute(): void {
    const t = this.world.state.tick;
    if (this.advanced()) this.lastProgress = t;
    this.longestStall = Math.max(this.longestStall, (t - this.lastProgress) / TICKS_PER_MINUTE);
    this.opts.onMinute?.(this);
  }
}

export function playRound(content: ContentRegistry, opts: RoundOptions): Round {
  return new Round(content, opts).play();
}
