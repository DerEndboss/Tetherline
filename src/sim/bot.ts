import { Brain } from './bot-brain';
import type { Batch, Memory } from './bot-build';
import { late, STEPS, type Step } from './bot-script';
import { coolantRefit, keepClear } from './bot-late';
import { oreValves, siliconSwitch, supplyMarks, surplusValves } from './bot-supply';
import { Space } from './bot-space';
import { trunkUpgrades } from './bot-trunk';
import type { Command, SimEvent } from './commands';
import { orderProgress } from './progression';
import type { World } from './world';

/** Ticks between two decisions (twice a second). */
const THINK_EVERY = 10;
/** Ghosts waiting in the queue before the bot adds more. */
const QUEUE_MAX = 4;
/**
 * Ticks a step rests after it found no room, or was too dear (planning is the costly part). A step that keeps
 * finding no room rests twice as long each time, up to FAIL_MAX (a big base made the same hopeless searches cost
 * seconds every 20 s); the watchdog wakes everything.
 */
const FAIL_WAIT = 400;
const FAIL_MAX = 6400;
const POOR_WAIT = 200;
/** Steps planned per look at most: planning is the dear part, so a look that finds nothing stops early and the
 * steps further down get their turn while these rest. */
const PLANS_PER_LOOK = 3;
/** How far the hub zone reaches east and south of the core. */
const HUB_REACH = 22;
/** Ticks between two searches for the accelerator's site while none is held. */
const SITE_RETRY = 1200;
/** Game ticks without progress after which the watchdog changes the plan (4 minutes). */
const STALL_TICKS = 4 * 1200;

/**
 * The autopilot: a pure planner over the world. `think` is called every tick with the last tick's events and
 * returns the commands a player would send (ghosts, nothing else). Memory is small and only a convenience; every
 * decision is derived from the world, so a bot started on a half-built run carries on.
 */
export class Bot {
  readonly mem: Memory = { reserved: new Set(), hub: new Set(), lines: [], lanes: [], bad: new Map(), feed: new Set(), fails: new Map(), paused: new Map(), downed: [], reordered: 0, stage: new Map(), needs: new Map(), progress: { at: 0, score: -1 }, stalls: 0, rescued: 0, keep: new Set(), refit: [], siteTry: -Infinity };
  log: string[] = [];
  private zoneFor = 0;
  private last = -THINK_EVERY;
  /** Why steps did not run, for tests and the dev console (last decision of each step). */
  trace = new Map<string, string>();

  constructor(public world: World) {
    this.reserveUpgradeZone();
  }

  /**
   * Looks at a new copy of the same run (the autopilot worker rebuilds the world from a snapshot for every look);
   * the memory carries over.
   */
  see(world: World): void {
    this.world = world;
  }

  /**
   * The core grows right and down when upgraded. Until then its new footprint and the ring around it stay free, so
   * nothing is built there that the upgrade would swallow or that would hug the future core.
   */
  private reserveUpgradeZone(): void {
    const core = this.world.core;
    if (!core) return;
    const { W } = new Space(this.world, new Set());
    const size = this.world.def(core).size;
    this.zoneFor = size;
    this.mem.reserved.clear();
    for (const t of [...this.mem.keep, ...(this.mem.site ?? [])]) this.mem.reserved.add(t);
    this.reserveHub(core.x, core.y, W);
    if (size >= 4) return; // the Nucleus is not worth its price here: no further growth to protect
    for (let i = -1; i <= size + 1; i++) {
      for (const [x, y] of [[core.x + size, core.y + i], [core.x + size + 1, core.y + i], [core.x + i, core.y + size], [core.x + i, core.y + size + 1]] as const) {
        if (x >= 0 && y >= 0) this.mem.reserved.add(y * W + x);
      }
    }
  }

  /** The hub zone: an L around the core's south and east sides, kept for stations, unloaders and the plant. */
  private reserveHub(cx: number, cy: number, W: number): void {
    if (this.mem.hub.size) return;
    for (let y = cy - 1; y <= cy + HUB_REACH; y++) {
      for (let x = cx - 1; x <= cx + HUB_REACH; x++) {
        const inL = x >= cx + 4 || y >= cy + 4;
        // ore stays open: on a small map the hub zone covered the only iron patch and the opening never started
        if (inL && this.world.inBounds(x, y) && !this.oreAt(x, y)) this.mem.hub.add(y * W + x);
      }
    }
  }

  private oreAt(x: number, y: number): boolean {
    const f = this.world.state.map.floor[y * this.world.state.map.w + x] ?? 0;
    return f > 0 && this.world.content.floors.list[f - 1]?.ore !== undefined;
  }

  think(_events: readonly SimEvent[] = []): Command[] {
    const w = this.world;
    if (!w.core || w.state.tick - this.last < THINK_EVERY) return [];
    this.last = w.state.tick;
    const marks = [...surplusValves(w, this.mem), ...oreValves(w, this.mem), ...siliconSwitch(w, this.mem), ...coolantRefit(w, this.mem), ...supplyMarks(w, this.mem), ...trunkUpgrades(w, this.mem)];
    if (marks.length) return marks;
    this.watch();
    if (w.state.plans.length > QUEUE_MAX) return [];
    if (w.def(w.core).size !== this.zoneFor) this.reserveUpgradeZone();
    return this.next();
  }

  /** The first step in priority order that is wanted, has room and can be paid. */
  private next(): Command[] {
    let k = new Brain(this.world, this.mem);
    // a site held now must be in this look's space too (an ingot pod laid its belt on it in the same look)
    if (this.mem.site === undefined && late(k) && this.holdSite(k)) k = new Brain(this.world, this.mem);
    const short: Reserve = new Map();
    let tries = 0;
    for (const step of STEPS) {
      if (this.resting(step) || !step.when(k) || this.stillShort(k, step, short)) continue;
      const out = this.attempt(k, step, short);
      if (out) return out;
      if (++tries >= PLANS_PER_LOOK) break;
    }
    return [];
  }

  /**
   * Holds room for the accelerator as soon as the late chain begins: by the time the elevator stood, a small map
   * had no free corner for a 5x5 machine with its coolant plant and a belt to the core (S2 ice, S9 rust: the run
   * stopped at "Stage 3: Counterweight"). The plan is made on a copy and only its tiles are kept.
   */
  private holdSite(k: Brain): boolean {
    const w = this.world;
    if (w.state.tick - this.mem.siteTry < SITE_RETRY || k.count('particle-accelerator') > 0 || k.starAlloy() === null) return false;
    this.mem.siteTry = w.state.tick;
    const trial = new Brain(w, { ...this.mem, reserved: new Set(this.mem.reserved), keep: new Set(this.mem.keep) });
    const batch = trial.accelerator();
    if (!batch) return false;
    keepClear(trial.ctx, batch.plans);
    const W = w.state.map.w;
    const tiles = new Set<number>([...trial.mem.keep].filter((t) => !this.mem.keep.has(t)));
    // every piece, plus the ring around the accelerator itself (a station spot needs one, and its belt starts there)
    batch.plans.forEach((p, i) => {
      const size = w.content.buildings.get(p.kind).size;
      const m = i === 0 ? 1 : 0;
      for (let y = p.y - m; y < p.y + size + m; y++) for (let x = p.x - m; x < p.x + size + m; x++) if (w.inBounds(x, y)) tiles.add(y * W + x);
    });
    this.mem.site = [...tiles];
    this.mem.siteBatch = batch;
    for (const t of tiles) this.mem.reserved.add(t);
    this.log.push(`t${w.state.tick} accelerator site held (${tiles.size} tiles)`);
    return true;
  }

  /**
   * The watchdog: progress is an order done or the running orders moving on. After STALL_TICKS without it, every
   * resting step is woken and the bot turns `stalls` up, which widens what the planners try (supplied stations
   * instead of lanes, farther spots and patches).
   */
  private watch(): void {
    const w = this.world;
    const p = this.mem.progress;
    let score = w.state.progress.done.length * 1000;
    for (const a of w.state.progress.active) {
      const [have, need] = orderProgress(w, w.content.orders.get(a.id), a.count);
      score += need > 0 ? Math.floor((Math.min(have, need) / need) * 100) : 0;
    }
    if (score > p.score) {
      p.score = score;
      p.at = w.state.tick;
      return;
    }
    if (w.state.tick - p.at < STALL_TICKS) return;
    p.at = w.state.tick;
    this.mem.stalls++;
    this.mem.bad.clear();
    this.mem.fails.clear();
    this.mem.needs.clear();
    this.log.push(`t${w.state.tick} watchdog: no progress, plan wider (${this.mem.stalls})`);
  }

  /**
   * Whether a step that was too dear last time still is (its last plan's price against what is free now). Checked
   * without planning again, so dear steps cost nothing per look and do not use up PLANS_PER_LOOK.
   */
  private stillShort(k: Brain, step: Step, short: Reserve): boolean {
    const need = this.mem.needs.get(step.name);
    if (!need) return false;
    const lacking = lackingOf(k, need, short);
    if (!lacking.length) return false;
    this.short(k, step, need, lacking, short);
    return true;
  }

  /** Sets aside what a step that cannot be paid needs; a holding step also tells the drones what it lacks. */
  private short(k: Brain, step: Step, need: ReadonlyMap<string, number>, lacking: string[], short: Reserve): void {
    const hold = holds(k, step);
    reserve(short, need, hold ? [...need.keys()] : lacking);
    if (!hold) return;
    const wanting = (this.mem.wanting ??= new Map());
    for (const id of lacking) wanting.set(id, this.world.state.tick);
  }

  private resting(step: Step): boolean {
    return (this.mem.bad.get(step.name) ?? 0) > this.world.state.tick;
  }

  /** Plans one step; returns the commands when it can be paid now, else null (and notes what it lacks). */
  private attempt(k: Brain, step: Step, short: Reserve): Command[] | null {
    const w = this.world;
    // after a stall every planner may use the hub zone too
    k.space.allowHub = this.mem.stalls > 0;
    k.space.allowBand = false;
    const out = step.plan(k);
    if (!out) {
      this.trace.set(step.name, `t${w.state.tick} no room ${[...(k.ctx.why ?? [])].map(([r, n]) => `${r}x${n}`).join('; ')}`);
      const n = (this.mem.fails.get(step.name) ?? 0) + 1;
      this.mem.fails.set(step.name, n);
      this.mem.bad.set(step.name, w.state.tick + Math.min(FAIL_MAX, FAIL_WAIT * 2 ** (n - 1)));
      return null;
    }
    const batch = 'type' in out ? null : out;
    const need = needOf(k, step, batch);
    const lacking = lackingOf(k, need, short);
    if (lacking.length) {
      this.short(k, step, need, lacking, short);
      this.trace.set(step.name, `t${w.state.tick} short ${lacking.join(',')}`);
      this.mem.bad.set(step.name, w.state.tick + POOR_WAIT);
      this.mem.needs.set(step.name, need);
      return null;
    }
    this.mem.fails.delete(step.name);
    this.mem.needs.delete(step.name);
    step.paid?.(k);
    this.log.push(`t${w.state.tick} ${step.name}`);
    if (!batch) return [out as Command];
    this.remember(batch);
    return [{ type: 'place-many', plans: batch.plans }];
  }

  private remember(batch: Batch): void {
    this.mem.lines.push(...batch.lines);
    this.mem.lanes.push(...(batch.lanes ?? []));
    for (const t of batch.feed ?? []) this.mem.feed.add(t.y * this.world.state.map.w + t.x);
  }
}

/**
 * Items set aside by steps above that could not be paid: a later step may only spend what is left over. A step
 * that holds sets aside its whole price, any other only what it lacks (so a big price never bans an item outright,
 * which stopped every foundry while a printer waited for silicon).
 */
type Reserve = Map<string, number>;

function lackingOf(k: Brain, need: ReadonlyMap<string, number>, short: Reserve): string[] {
  return [...need].filter(([id, n]) => k.avail(id) - (short.get(id) ?? 0) < n).map(([id]) => id);
}

function reserve(short: Reserve, need: ReadonlyMap<string, number>, ids: string[]): void {
  for (const id of ids) short.set(id, (short.get(id) ?? 0) + (need.get(id) ?? 0));
}

function holds(k: Brain, step: Step): boolean {
  return typeof step.hold === 'function' ? step.hold(k) : step.hold === true;
}

/** What a step costs: its own fixed cost plus the ghosts of its batch. */
function needOf(k: Brain, step: Step, batch: Batch | null): Map<string, number> {
  const w = k.world;
  const need = new Map<string, number>(Object.entries(step.price?.(k) ?? step.cost ?? {}));
  for (const p of batch?.plans ?? []) for (const c of w.content.buildings.get(p.kind).cost) need.set(c.item, (need.get(c.item) ?? 0) + c.n);
  return need;
}
