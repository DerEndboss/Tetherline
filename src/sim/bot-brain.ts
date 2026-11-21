import { drillInfoAt } from './blocks/production';
import {
  claimBatch,
  layLine,
  layPod,
  layTerminal,
  lineBatch,
  mergeGoals,
  patchesFor,
  spots,
  ringGoals,
  type Batch,
  type Ctx,
  type Feeder,
  type Memory,
} from './bot-build';
import { ensurePower, layDock, layPlant, layStation, livePowerNets, ringRoom, type Station } from './bot-hub';
import { condenserAnnex, coolantAnnex, keepClear } from './bot-late';
import { orderNeeds, orderTree } from './bot-supply';
import { patchesOf, Space, type RouteGoal, type Tile } from './bot-space';
import type { Command, PlanSpec } from './commands';
import { placementProblem } from './placement';
import { powerGraph } from './power';
import type { BuildingDef } from '../content/types';
import type { Building } from './state';
import type { World } from './world';

/**
 * Buildings a build order gets straight away (`orderWants`): anything but drills, cores, mega machines and
 * crafters that make items (those come from their own planners, fed and in the right place). A crafter that only
 * makes a liquid (the coolant mixer) has no feed to plan.
 */
function byOrder(def: BuildingDef, w: World): boolean {
  if (def.behaviour === 'drill' || def.behaviour === 'core' || def.behaviour === 'mega') return false;
  if (def.behaviour !== 'crafter') return true;
  return (def.recipes ?? []).every((id) => w.content.recipes.get(id).outputs.length === 0);
}

/** What a build step can ask of the bot: the facts of the run and the planners, bound to one decision. */
/**
 * Buildings that take items from any neighbour and hand them to any neighbour. A loose one keeps a free ring: a mass
 * driver beside a coal bridge shot coal to its partner in the middle of the base, which sprayed it into ten product
 * belts, and the refinery's plastic never reached the core (M1 green: the cells order waited 40 minutes).
 */
const SPRAYS = new Set(['mass-driver']);

export class Brain {
  readonly ctx: Ctx;
  private readonly pend = new Map<string, number>();
  /** The last accelerator plan of this look (its coolant plant's surroundings are kept clear once it is paid). */
  private planned: Batch | null = null;

  constructor(
    readonly world: World,
    readonly mem: Memory,
  ) {
    this.ctx = { world, space: new Space(world, mem.reserved, mem.hub), mem, why: new Map(), bridges: false };
    this.countPending();
    this.ctx.bridges = this.coreSize() >= 4 && this.avail('iron-bar') >= 40;
  }

  get space(): Space {
    return this.ctx.space;
  }

  /* ----- facts ----- */

  mat(id: string): number {
    return this.world.content.materials.indexOf(id);
  }

  stock(id: string): number {
    return this.world.state.stock[this.mat(id)] ?? 0;
  }

  /** Stock minus what open sites and ghosts still have to pay. */
  avail(id: string): number {
    return this.stock(id) - (this.pend.get(id) ?? 0);
  }

  private countPending(): void {
    const w = this.world;
    for (const p of w.state.plans) for (const c of w.defs[p.kind]!.cost) this.add(c.item, c.n);
    for (const b of w.state.buildings) if (b.build < 1 && !b.removing) w.def(b).cost.forEach((c, i) => this.add(c.item, c.n - (b.spent[i] ?? 0)));
  }

  private add(id: string, n: number): void {
    this.pend.set(id, (this.pend.get(id) ?? 0) + n);
  }

  /** Finished or planned buildings of a kind. */
  count(id: string): number {
    const w = this.world;
    const k = w.content.buildings.indexOf(id);
    let n = 0;
    for (const b of w.state.buildings) if (b.kind === k && !b.removing) n++;
    for (const p of w.state.plans) if (p.kind === k) n++;
    return n;
  }

  /** Items per second the drills (built or planned) on an ore make. */
  rate(id: string): number {
    const w = this.world;
    const item = this.mat(id);
    let sum = 0;
    const one = (x: number, y: number, kind: number): void => {
      const def = w.defs[kind]!;
      if (def.behaviour !== 'drill' || !def.drill) return;
      const info = drillInfoAt(w, x, y, def.size, def.drill.tier);
      if (info.item === item) sum += (info.count / info.area / def.drill.seconds) * w.state.bonus.drill;
    };
    for (const b of w.state.buildings) if (!b.removing) one(b.x, b.y, b.kind);
    for (const p of w.state.plans) one(p.x, p.y, p.kind);
    return sum;
  }

  core(): Building {
    return this.world.core!;
  }

  /* ----- planners ----- */

  private coreRect(): { x: number; y: number; size: number } {
    const c = this.core();
    return { x: c.x, y: c.y, size: this.world.def(c).size };
  }

  coreGoals(): RouteGoal[] {
    return ringGoals(this.space, this.coreRect(), 9, 45, true);
  }

  goalsFor(cls: string): RouteGoal[] {
    return [...mergeGoals(this.ctx, cls), ...this.coreGoals()];
  }

  /** The drill to use on an ore of this hardness: mechanical while it can, else pneumatic. */
  drillFor(tier: number): { id: string; tier: number } {
    if (tier <= 1 && this.avail('graphite') < 60) return { id: 'mechanical-drill', tier: 1 };
    if (tier <= 2) return { id: 'pneumatic-drill', tier: 2 };
    return { id: 'electric-drill', tier: 3 };
  }

  hardness(item: string): number {
    const f = this.world.content.floors.list.find((o) => o.ore === item);
    return f?.hardness ?? 1;
  }

  /**
   * Electric drills dig about 2.4 times what pneumatic ones dig on the same ore. Late in a run the near patches
   * are taken and every new line must count, so lines and chains (which bring their own power nodes) use them
   * once silicon and graphite can pay for them.
   */
  private fastDrills(): boolean {
    return this.coreSize() >= 4 && this.avail('silicon') > 150 && this.avail('graphite') > 150;
  }

  feeder(item: string, maxDrills: number, fast = false): Feeder {
    const d = fast && this.fastDrills() ? { id: 'electric-drill', tier: 3 } : this.drillFor(this.hardness(item));
    return { item: this.mat(item), drill: d.id, size: this.world.content.buildings.get(d.id).size, tier: d.tier, maxDrills };
  }

  /** Raw ore into the core. Copper has its own lines (it fills the core first); other ores share theirs. */
  rawLine(item: string, maxDrills: number, direct = false): Batch | null {
    const line = (): Batch | null => this.lineWith(item, maxDrills, true, direct) ?? this.lineWith(item, maxDrills, false, direct);
    return line() ?? (this.lines(item) < 1 ? this.throughHub(line) : null);
  }

  /**
   * A first line or pod may cross the hub zone when nothing else reaches the core: on a small map the start ores
   * can lie south-east of the core, inside the L kept for stations, and the opening never laid a copper line
   * (S4: 400 copper burned on pods, 5 orders in two hours). A station planned later simply goes elsewhere.
   */
  private throughHub(plan: () => Batch | null): Batch | null {
    if (this.space.allowHub) return null;
    this.space.allowHub = true;
    const out = plan();
    this.space.allowHub = false;
    return out;
  }

  /** `direct`: straight into the core, never merged into another line (a busy trunk starves a side merge). */
  private lineWith(item: string, maxDrills: number, fast: boolean, direct: boolean): Batch | null {
    if (fast && !this.fastDrills()) return null;
    const f = this.feeder(item, maxDrills, fast);
    // ores other than copper share lines; an ore at the core's cap would stop the others on them, so the ore
    // valve (bot-supply.ts) takes its drills down until the stock drops
    const cls = item === 'copper-ore' ? item : 'raw';
    const spec = { ...f, goals: direct ? this.coreGoals() : this.goalsFor(cls), near: { x: this.core().x, y: this.core().y }, cls, itemId: item };
    const laid = layLine(this.ctx, spec, 3 + this.mem.stalls * 2);
    if (!laid) return null;
    const batch = lineBatch(this.ctx, spec, laid, `line ${item}`);
    claimBatch(this.space, this.world, batch);
    return this.powerDrills(batch, f.drill);
  }

  /** Power nodes for drills that need power (electric drills on hard ore far out); null when no chain reaches. */
  private powerDrills(batch: Batch, drill: string): Batch | null {
    const def = this.world.content.buildings.get(drill);
    if (!def.power?.use) return batch;
    const nodes: PlanSpec[] = [];
    for (const p of batch.plans.filter((q) => q.kind === drill)) {
      const more = ensurePower(this.ctx, { x: p.x, y: p.y, size: def.size }, 16, nodes.map((n) => ({ x: n.x, y: n.y, size: 1 })));
      if (!more) return null;
      nodes.push(...more);
    }
    batch.plans.push(...nodes);
    return batch;
  }

  /** A crafter fed by a mining trunk; the product goes to the core (or joins other products). */
  pod(crafter: string, recipe: string, ore: string, maxDrills: number): Batch | null {
    const def = this.world.content.buildings.get(crafter);
    const pod = this.podLaid(crafter, recipe, ore, maxDrills);
    // no room for the crafter at the end of a trunk (small patches near rock): the same crafter by the core, fed by a line
    const batch = pod ?? this.terminal(crafter, recipe, [[ore, maxDrills]]) ?? this.byCore(crafter, recipe, ore);
    if (!pod || !batch || !def.power?.use) return batch;
    const at = batch.plans.find((p) => p.kind === crafter)!;
    const power = ensurePower(this.ctx, { x: at.x, y: at.y, size: def.size });
    if (!power) return null;
    batch.plans.push(...power);
    return batch;
  }

  /** The pod itself: crafter at the end of a trunk; the first of its kind may cross the hub zone. */
  private podLaid(crafter: string, recipe: string, ore: string, maxDrills: number): Batch | null {
    const def = this.world.content.buildings.get(crafter);
    const f = this.feeder(ore, maxDrills);
    const config = Math.max(0, (def.recipes ?? []).indexOf(recipe));
    const near = { x: this.core().x, y: this.core().y };
    const lay = (): Batch | null => layPod(this.ctx, { crafter, size: def.size, config, item: f.item, drill: f.drill, dsize: f.size, tier: f.tier, maxDrills, goals: this.goalsFor('products'), cls: 'products', near });
    return lay() ?? (this.count(crafter) < 1 ? this.throughHub(lay) : null);
  }

  /** Last resort for an opening crafter: a station by the core fed from the core's stock, once there is some. */
  private byCore(crafter: string, recipe: string, ore: string): Batch | null {
    return this.stock(ore) >= 20 ? this.station(crafter, recipe, [ore]) : null;
  }

  /** A crafter touching the core with a mining line into each input. */
  terminal(crafter: string, recipe: string, feeds: [string, number][]): Batch | null {
    const def = this.world.content.buildings.get(crafter);
    const config = Math.max(0, (def.recipes ?? []).indexOf(recipe));
    const batch = layTerminal(this.ctx, { crafter, size: def.size, config, feeders: feeds.map(([item, n]) => this.feeder(item, n)) });
    if (!batch) return null;
    const at = batch.plans[0]!;
    const power = def.power?.use ? ensurePower(this.ctx, { x: at.x, y: at.y, size: def.size }) : [];
    if (!power) return null;
    batch.plans.push(...power);
    return batch;
  }

  /**
   * A production chain away from the hub: ore lines into small crafters that touch the main one and hand their
   * product straight over (iron ore -> smelter -> foundry, coal -> press -> foundry); only the product goes to
   * the core. Needs neither unloaders nor drones.
   */
  chain(crafter: string, recipe: string, feeds: [string, number, [string, string]?][], topUp = false): Batch | null {
    return this.chainWith(crafter, recipe, feeds, topUp, true) ?? this.chainWith(crafter, recipe, feeds, topUp, false);
  }

  private chainWith(crafter: string, recipe: string, feeds: [string, number, [string, string]?][], topUp: boolean, fast: boolean): Batch | null {
    if (fast && !this.fastDrills()) return null;
    const def = this.world.content.buildings.get(crafter);
    const feeders = feeds.map(([ore, n, via]) => {
      const f = this.feeder(ore, n, fast);
      if (!via) return f;
      return { ...f, via: { crafter: via[0], config: this.recipeIndex(via[0], via[1]), size: this.world.content.buildings.get(via[0]).size } };
    });
    const first = feeders[0]!;
    const patch = patchesFor(this.world, first.item, first.tier, this.core(), this.space)[0];
    if (!patch) return null;
    this.space.allowHub = true;
    const around = { x: patch.cx, y: patch.cy };
    const batch = layTerminal(this.ctx, { crafter, size: def.size, config: this.recipeIndex(crafter, recipe), feeders, around });
    if (!batch) return null;
    if (topUp) batch.feed = [batch.plans[0]!];
    return this.powerAll(batch);
  }

  /** Power nodes for every machine of a batch that needs power; null when one cannot be reached. */
  private powerAll(batch: Batch): Batch | null {
    const nodes: PlanSpec[] = [];
    for (const p of [...batch.plans]) {
      const def = this.world.content.buildings.get(p.kind);
      if (!def.power?.use || def.behaviour === 'conveyor') continue;
      const more = ensurePower(this.ctx, { x: p.x, y: p.y, size: def.size }, 10, nodes.map((n) => ({ x: n.x, y: n.y, size: 1 })));
      if (!more) return null;
      nodes.push(...more);
    }
    batch.plans.push(...nodes);
    return batch;
  }

  /* ----- hub ----- */

  /** Mining lines of an ore that were laid into the core. */
  lines(item: string): number {
    return this.mem.lines.filter((l) => l.item === item).length;
  }

  coreSize(): number {
    return this.world.def(this.core()).size;
  }

  done(order: string): boolean {
    return this.world.state.progress.done.includes(order);
  }

  recipeIndex(crafter: string, recipe: string): number {
    return Math.max(0, (this.world.content.buildings.get(crafter).recipes ?? []).indexOf(recipe));
  }

  /**
   * A crafter fed by lanes from the core's unloaders; when no lane finds a way (a crowded hub), the same crafter
   * fed by the drones instead. After the watchdog fired, drone supply comes first.
   */
  station(crafter: string, recipe: string, inputs: string[], output: string | null = 'products'): Batch | null {
    const st: Station = { crafter, config: this.recipeIndex(crafter, recipe), inputs, output };
    const fed = { ...st, supplied: true };
    if (this.mem.stalls > 0) return layStation(this.ctx, fed) ?? layStation(this.ctx, st);
    return layStation(this.ctx, st) ?? layStation(this.ctx, fed);
  }

  /** A crafter the drones keep supplied, with a belt for its product (and an annex beside it). */
  supplied(crafter: string, recipe: string, annex?: Station['annex']): Batch | null {
    return layStation(this.ctx, { crafter, config: this.recipeIndex(crafter, recipe), inputs: [], output: 'products', supplied: true, annex });
  }

  /** Refinery making plastic from graphite and gas, with its gas condenser. */
  plasticWorks(): Batch | null {
    return this.supplied('refinery', 'cook-gas', condenserAnnex);
  }

  /** The particle accelerator (star alloy first) with its coolant plant. */
  accelerator(): Batch | null {
    const mix = this.hasOre('frostine') ? 'mix-coolant-frost' : 'mix-coolant';
    this.planned = this.supplied('particle-accelerator', this.starAlloy() ?? 'compress-singularity', coolantAnnex(this.recipeIndex('coolant-mixer', mix)));
    return this.planned;
  }

  /**
   * Plans on the held accelerator site: its tiles are free for this plan only (they stay held until the step is
   * paid, see `releaseSite`).
   */
  onSite(plan: () => Batch | null): Batch | null {
    const site = this.mem.site ?? [];
    if (!site.length) return plan();
    const before = this.ctx.space;
    for (const t of site) this.mem.reserved.delete(t);
    this.ctx.space = new Space(this.world, this.mem.reserved, this.mem.hub);
    const out = plan() ?? this.heldPlan();
    for (const t of site) this.mem.reserved.add(t);
    // the rest of this look plans in the space that still holds the site (plus what was just planned)
    this.ctx.space = before;
    if (out) claimBatch(before, this.world, out);
    return out;
  }

  /**
   * The plan the site was held for, when every tile of it is still free: a fresh plan can fail where the held one
   * still works (its output joined a products line that later counted as full; S9 rust stopped at stage 3).
   */
  private heldPlan(): Batch | null {
    const held = this.mem.siteBatch;
    if (!held) return null;
    const { space, world } = this;
    space.allowHub = true;
    space.allowBand = true;
    const fits = held.plans.every((p) => space.freeRect(p.x, p.y, world.content.buildings.get(p.kind).size));
    space.allowBand = false;
    if (!fits) return null;
    const batch: Batch = { ...held, plans: held.plans.map((p) => ({ ...p })), lines: [...held.lines], lanes: [...(held.lanes ?? [])], feed: [...(held.feed ?? [])] };
    claimBatch(space, world, batch);
    this.planned = batch;
    return batch;
  }

  /** The accelerator is placed: its held site is free again (its ghosts stand there now), and the tiles around its
   * coolant plant are kept clear for good. */
  releaseSite(): void {
    for (const t of this.mem.site ?? []) if (!this.mem.keep.has(t)) this.mem.reserved.delete(t);
    this.mem.site = [];
    if (this.planned) keepClear(this.ctx, this.planned.plans);
  }

  /** The star alloy recipe of this world's ore, or null when the map has none. */
  starAlloy(): string | null {
    const by: [string, string][] = [['emberite', 'forge-star-alloy-ember'], ['verdite', 'forge-star-alloy-verdite'], ['frostine', 'forge-star-alloy-frost']];
    return by.find(([ore]) => this.hasOre(ore))?.[1] ?? null;
  }

  /** The world ore star alloy is made of on this map. */
  worldOre(): string | null {
    return ['emberite', 'verdite', 'frostine'].find((ore) => this.hasOre(ore)) ?? null;
  }

  /** Battery cells: lead and plastic when the map has lead, else tin, lithium and plastic. */
  cellRecipe(): string {
    return this.hasOre('lead-ore') ? 'make-battery-cell-plain' : 'make-battery-cell-tin';
  }

  /** Buildings of a kind that stand finished. */
  built(id: string): Building[] {
    const k = this.world.content.buildings.indexOf(id);
    return this.world.state.buildings.filter((b) => b.kind === k && b.build >= 1 && !b.removing);
  }

  made(id: string): number {
    return this.world.state.stats.made[this.mat(id)] ?? 0;
  }

  delivered(id: string): number {
    return this.world.state.stats.delivered[this.mat(id)] ?? 0;
  }

  plant(routers: number): Batch | null {
    return layPlant(this.ctx, routers, 'coal');
  }

  ringRoom(): number {
    return ringRoom(this.ctx);
  }

  dock(kind: string): Batch | null {
    return layDock(this.ctx, kind);
  }

  loose(kind: string, min = 5, max = 14): Batch | null {
    const def = this.world.content.buildings.get(kind);
    const c = this.core();
    const centre = { x: c.x + Math.floor(this.world.def(c).size / 2), y: c.y + Math.floor(this.world.def(c).size / 2) };
    this.space.allowHub = true;
    // several spots, farther after a stall: the nearest one may have no way for its power (S5 ice waited 90
    // minutes for a mass driver whose only spot had no node chain)
    const far = max + this.mem.stalls * 6;
    const ringed = this.looseAt(def, spots(this.ctx, def.size, centre, min, far).slice(0, 8));
    if (ringed || SPRAYS.has(def.behaviour)) return ringed;
    // a full small map has no 8x8 left for the elevator (S5 rust waited 80 minutes): a spot without a free ring
    // will do for what needs no belt, as long as nothing pushes items into it
    return this.looseAt(def, spots(this.ctx, def.size, centre, min, far, 12, false).slice(0, 8));
  }

  /** The first of these spots with a way for its power: the building and its node chain. */
  private looseAt(def: BuildingDef, at: Tile[]): Batch | null {
    for (const t of at) {
      const local: Ctx = { ...this.ctx, space: this.space.clone() };
      local.space.claim(t.x, t.y, def.size, def.behaviour);
      const power = def.power?.use ? ensurePower(local, { x: t.x, y: t.y, size: def.size }, 8) : [];
      if (!power) continue;
      const batch: Batch = { plans: [{ kind: def.id, x: t.x, y: t.y, rot: 0, config: -1 }, ...power], lines: [], note: def.id };
      if (def.behaviour === 'mega') batch.feed = [batch.plans[0]!];
      claimBatch(this.space, this.world, batch);
      if (SPRAYS.has(def.behaviour)) this.keepRing(t, def.size);
      return batch;
    }
    return null;
  }

  /** The ring around a footprint stays free for good (nothing is built there later). */
  private keepRing(at: Tile, size: number): void {
    const W = this.space.W;
    for (let y = at.y - 1; y <= at.y + size; y++) {
      for (let x = at.x - 1; x <= at.x + size; x++) {
        const inside = x >= at.x && y >= at.y && x < at.x + size && y < at.y + size;
        if (inside || !this.world.inBounds(x, y)) continue;
        this.mem.keep.add(y * W + x);
        this.mem.reserved.add(y * W + x);
      }
    }
  }

  /** The core upgrade, when its footprint is free. */
  /** One building a story order asks for: on a liquid for a pump that needs one, else loose near the core. */
  forOrder(kind: string): Batch | null {
    const def = this.world.content.buildings.get(kind);
    if (def.behaviour === 'pump' && !def.pump?.anywhere) return this.onLiquid(def);
    return this.loose(kind, 4, 30);
  }

  /** The free spot nearest the core where a pump stands on its liquid. */
  private onLiquid(def: BuildingDef): Batch | null {
    const c = this.core();
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = c.y - 40; y <= c.y + 40; y++) {
      for (let x = c.x - 40; x <= c.x + 40; x++) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (best && d >= best.d) continue;
        if (this.space.freeRect(x, y, def.size) && !placementProblem(this.world, def, x, y)) best = { x, y, d };
      }
    }
    if (!best) return null;
    const batch: Batch = { plans: [{ kind: def.id, x: best.x, y: best.y, rot: 0, config: -1 }], lines: [], note: def.id };
    claimBatch(this.space, this.world, batch);
    return batch;
  }

  /** The building a running build order still lacks, when no planner below makes it on its way. */
  orderWants(): string | null {
    const w = this.world;
    for (const a of w.state.progress.active) {
      const g = w.content.orders.get(a.id).goal;
      if (g.kind !== 'build' || this.count(g.building) >= g.n) continue;
      if (byOrder(w.content.buildings.get(g.building), w)) return g.building;
    }
    return null;
  }

  /** Whether a running order asks for this item (delivered, made or at a rate). */
  ordered(item: string): boolean {
    return this.world.state.progress.active.some((a) => {
      const g = this.world.content.orders.get(a.id).goal;
      return g.kind !== 'build' && g.item === item;
    });
  }

  /**
   * The ore a running delivery order asks for when no mining line brings it to the core, or when nothing has
   * arrived for 90 s (a line merged into a busy trunk starves at the merge: seed 7 waited half an hour for titanium).
   */
  orderedOre(): string | null {
    const w = this.world;
    for (const a of w.state.progress.active) {
      const g = w.content.orders.get(a.id).goal;
      if (g.kind !== 'deliver' || !this.hasOre(g.item) || !w.content.floors.list.some((f) => f.ore === g.item)) continue;
      const stuck = w.state.tick - a.since > 1800 && this.delivered(g.item) <= a.count;
      if (this.lines(g.item) < 1 || (stuck && this.lines(g.item) < 3)) return g.item;
    }
    return null;
  }

  /** Whether a running build order asks for this building. */
  wants(kind: string): boolean {
    return this.world.state.progress.active.some((a) => {
      const g = this.world.content.orders.get(a.id).goal;
      return g.kind === 'build' && g.building === kind;
    });
  }

  upgrade(): Command | null {
    const core = this.core();
    const next = this.world.def(core).core?.next;
    if (!next || core.upgrade) return null;
    const def = this.world.content.buildings.get(next);
    const grow = def.size - this.coreSize();
    const x = core.x - Math.floor(grow / 2);
    const y = core.y - Math.floor(grow / 2);
    return placementProblem(this.world, def, x, y, core) ? null : { type: 'upgrade-core' };
  }

  /** Crafters of a kind set to a recipe (built or planned). */
  countRecipe(crafter: string, recipe: string): number {
    const w = this.world;
    const k = w.content.buildings.indexOf(crafter);
    const idx = Math.max(0, (w.defs[k]?.recipes ?? []).indexOf(recipe));
    const mine = [...w.state.buildings.filter((b) => !b.removing).map((b) => ({ kind: b.kind, config: this.mem.paused.get(b.id) ?? b.config })), ...w.state.plans.map((p) => ({ kind: p.kind, config: p.config }))];
    return mine.filter((b) => b.kind === k && Math.max(0, b.config ?? 0) === idx).length;
  }

  /**
   * A finished machine of the late chain (mega buildings, the machines the drones feed, pumps) whose power network
   * cannot carry it (see `livePowerNets`): its node chain never joined the grid, or it joined an island. S8 ice:
   * the accelerator, its coolant annex and a printer sat on a network of their own for an hour with the crown two
   * singularities short.
   */
  unpowered(): Building | null {
    const w = this.world;
    const g = powerGraph(w);
    const live = livePowerNets(w);
    for (const b of w.state.buildings) {
      if (!this.needsGrid(b)) continue;
      const net = g.netOf.get(b.id);
      if (net !== undefined && !live.has(net)) return b;
    }
    return null;
  }

  /** A finished machine that uses power and matters for the finale (see `unpowered`). */
  private needsGrid(b: Building): boolean {
    const w = this.world;
    const def = w.def(b);
    if (!(def.power?.use ?? 0) || !w.ready(b) || b.removing) return false;
    return def.category === 'mega' || def.behaviour === 'pump' || this.mem.feed.has(b.y * w.state.map.w + b.x);
  }

  /** A node chain from a machine to the grid (see `unpowered`). */
  repower(b: Building): Batch | null {
    this.space.allowHub = true;
    // a live node in reach is not enough: a finished building links only when it is built, so a network that lost
    // its maker stays dark beside the grid (S2 green: the elevator, a printer and two foundries for an hour). A new
    // node links to both sides.
    const plans = ensurePower(this.ctx, { x: b.x, y: b.y, size: this.world.def(b).size }, 12, [], true);
    return plans?.length ? { plans, lines: [], note: 'repower' } : null;
  }

  /**
   * A late ore whose line could not be laid (the base walled the way to the far patch: S2 ice, S5, M5 waited
   * an hour for tungsten): the helper drones mine it into the core instead, once their holds can take it.
   * Each entry: the ore, and whether its line step is wanted and keeps failing.
   */
  droneOre(): string | null {
    // an ore the running order waits for comes first, then the chosen one sticks (the watchdog clears the
    // failures), but only while something still wants it: iron mined for the motors stuck for 35 minutes while
    // carbide waited for tungsten (S5 rust), and star alloy for emberite or frostine (S4 rust, S2 ice)
    const starved = this.mem.stalls > 0 ? this.starvedOre() : null;
    if (starved) return starved;
    const now = this.mem.mining;
    if (now && this.stock(now) < 300 && this.stillMined(now)) return now;
    return this.linelessOre();
  }

  /** A late ore whose line step keeps failing and that no line brings. */
  private linelessOre(): string | null {
    const failing = (step: string): boolean => (this.mem.fails.get(step) ?? 0) >= 2;
    const want: [string | null, boolean][] = [
      ['tungsten-ore', failing('tungsten')],
      [this.worldOre(), failing('world-ore')],
      ['titanium-ore', failing('ti-line') || failing('ti-more')],
    ];
    const hit = want.find(([ore, fails]) => ore !== null && fails && this.hasOre(ore) && this.lines(ore) < 1 && this.stock(ore) < 300);
    return hit?.[0] ?? null;
  }

  /** Whether an ore the drones mine is still wanted: a late ore no line brings, or one a running order eats. */
  private stillMined(ore: string): boolean {
    const late = ['tungsten-ore', 'titanium-ore', this.worldOre()].includes(ore) && this.lines(ore) < 1;
    return late || this.orderOres().includes(ore);
  }

  /** The ores the running orders' products are made of (see `orderTree`), nearest first. */
  orderOres(): string[] {
    return orderTree(this.world).filter((id) => this.hasOre(id));
  }

  /**
   * After a stall: an ore the running order's product is made of that the core is out of (M5 ice: a tungsten line
   * stood, but its ore never got through a full shared belt, and carbide sat at 9 of 24 for an hour). What it goes
   * into must run short too: iron ore is always scarce in the core (the smelters stand on its lines), and mining it
   * for the accelerator's steel while its glass waited for sand cost S7 rust 23 minutes.
   */
  private starvedOre(): string | null {
    const low = (id: string): boolean => this.stock(id) < 50;
    return orderNeeds(this.world).find((n) => this.hasOre(n.item) && low(n.item) && (n.into === null || low(n.into)))?.item ?? null;
  }

  /** Whether the map has an ore at all (patches of it). */
  hasOre(id: string): boolean {
    const item = this.mat(id);
    return patchesOf(this.world).some((p) => p.item === item);
  }

  /**
   * Units per second the power buildings can make and the consumers use when busy (planned ones included).
   * Generators that burn items count only while the core has fuel for them (the plants are fed from the core:
   * with the coal gone the base ran on 9 of 57 units), and a reactor counts only with lithium.
   */
  power(): { make: number; use: number } {
    const w = this.world;
    const kinds = [...w.state.buildings.filter((b) => !b.removing).map((b) => b.kind), ...w.state.plans.map((p) => p.kind)];
    let make = 0;
    let use = 0;
    for (const k of kinds) {
      make += this.fuelled(w.defs[k]!) ? (w.defs[k]!.power?.make ?? 0) : 0;
      use += w.defs[k]!.power?.use ?? 0;
    }
    return { make, use };
  }

  private fuelled(def: BuildingDef): boolean {
    const g = def.generator;
    if (!g?.items) return true;
    if (g.burn) return Object.keys(g.burn).some((id) => this.stock(id) > 20);
    return this.stock('coal') > 50;
  }

  /** The ingot circuits are made with on this map (tin first, else lead), or null when the map has neither. */
  circuitIngot(): { ore: string; ingot: string; smelt: string; circuit: string } | null {
    if (this.hasOre('tin-ore')) return { ore: 'tin-ore', ingot: 'tin-ingot', smelt: 'smelt-tin', circuit: 'make-circuit' };
    if (this.hasOre('lead-ore')) return { ore: 'lead-ore', ingot: 'lead-ingot', smelt: 'smelt-lead', circuit: 'make-circuit-lead' };
    return null;
  }
}
