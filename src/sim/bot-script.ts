import type { Brain } from './bot-brain';
import type { Batch } from './bot-build';
import type { Command } from './commands';
import { droneCommand, helperPrice, nextPrice, type DroneTrack } from './drones';

/** One thing the bot wants, in priority order: `plan` runs only when `when` says something is missing. */
export interface Step {
  name: string;
  when: (k: Brain) => boolean;
  plan: (k: Brain) => Batch | Command | null;
  /** Items the step needs that are not ghost costs (a command pays when it runs). */
  cost?: Record<string, number>;
  /** Called when the step's commands go out. */
  paid?: (k: Brain) => void;
  /** Like `cost`, for prices that change during a run (drone upgrades). */
  price?: (k: Brain) => Record<string, number>;
  /** While the step cannot be paid, nothing below it may spend any item it needs. Steps that build what a story
   * order asks for hold, so the scaling steps below cannot starve the order (silicon for the two solar panels). */
  hold?: boolean | ((k: Brain) => boolean);
}

const minutes = (k: Brain): number => k.world.state.tick / 1200;

/** What the next core stage costs (read from the content, so a balance change cannot leave the bot behind). */
function upgradeCost(k: Brain): Record<string, number> {
  const next = k.world.def(k.core()).core?.next;
  return next ? priceOf(k.world.content.buildings.get(next).cost) : {};
}

const have = (k: Brain, id: string, n: number): boolean => k.stock(id) >= n;

/** The late chain may start once the core is upgraded and steel is cast. */
const late = (k: Brain): boolean => k.coreSize() >= 4 && k.countRecipe('steel-foundry', 'cast-steel') > 0;

const priceOf = (list: { item: string; n: number }[] | null): Record<string, number> => Object.fromEntries((list ?? []).map((p) => [p.item, p.n]));

/** A drone upgrade: wanted below `level`, paid when it runs. */
function upgrade(track: DroneTrack, level: number, when: (k: Brain) => boolean): Step {
  return {
    name: `drone-${track}-${level}`,
    when: (k) => (k.world.state.droneTech?.[track] ?? 0) < level && nextPrice(k.world, track) !== null && when(k),
    price: (k) => priceOf(nextPrice(k.world, track)),
    plan: () => droneCommand('drone-upgrade', { track }),
  };
}

/** Whether the bot has every item of a price that only a 3D printer makes (motors, frames, core chips). */
function printed(k: Brain, price: { item: string; n: number }[] | null): boolean {
  return (price ?? []).every((p) => !['motor', 'frame', 'core-chip'].includes(p.item) || k.stock(p.item) >= p.n);
}

/**
 * A helper drone: the drones carry everything the supplied machines eat, so they come before anything else that
 * wants steel. The price holds only once its printed parts are there: holding steel while the motors were still
 * missing starved the very printer that makes them.
 */
function helper(name: string, when: (k: Brain) => boolean): Step {
  return {
    name,
    hold: (k) => printed(k, helperPrice(k.world)),
    when: (k) => helperPrice(k.world) !== null && when(k),
    price: (k) => priceOf(helperPrice(k.world)),
    plan: () => droneCommand('drone-add', {}),
  };
}

/** Whether the core holds the parts of a building that only printers and furnaces make (carbide, chips ...). */
function partsFor(k: Brain, id: string): boolean {
  const basic = new Set(['copper-ore', 'iron-bar', 'steel', 'silicon', 'graphite', 'circuit', 'titanium-plate', 'glass']);
  return k.world.content.buildings.get(id).cost.every((c) => basic.has(c.item) || k.stock(c.item) >= c.n);
}

/** How many of an item the megastructure's stages eat in all (read from the content). */
function stageNeed(k: Brain, item: string): number {
  let n = 0;
  for (const b of k.world.content.buildings.list) {
    if (!b.stages) continue;
    for (const id of b.recipes ?? []) n += k.world.content.recipes.get(id).inputs.find((i) => i.item === item)?.n ?? 0;
  }
  return n;
}

/** The accelerator's recipe should change: singularities once there is star alloy for them, then alloy again. */
function accelMode(k: Brain): Command | null {
  const acc = k.built('particle-accelerator')[0];
  const alloy = k.starAlloy();
  if (!acc || !alloy) return null;
  const sing = k.made('singularity') < stageNeed(k, 'singularity') && k.stock('star-alloy') >= 2 && (k.done('elevator-5') || k.made('star-alloy') >= 30);
  const want = k.recipeIndex('particle-accelerator', sing ? 'compress-singularity' : alloy);
  return acc.config === want ? null : { type: 'configure', id: acc.id, value: want };
}

/** The late chain (after titanium plates): plastic, cells, the printer, carbide, fusion, the elevator, the crown. */
const LATE: Step[] = [
  { name: 'accel-mode', when: (k) => accelMode(k) !== null, plan: (k) => accelMode(k) },
  // motors first: they buy the helper drones that carry everything the supplied machines eat
  { name: 'motors', hold: true, when: (k) => k.countRecipe('3d-printer', 'print-motor') < 1 && late(k) && have(k, 'circuit', 40), plan: (k) => k.supplied('3d-printer', 'print-motor') },
  helper('helper', (k) => k.world.state.drones.length < 3),
  // faster drones carry more to the supplied machines
  upgrade('speed', 1, (k) => have(k, 'copper-wire', 60)),
  upgrade('speed', 2, (k) => have(k, 'circuit', 40)),
  upgrade('speed', 3, (k) => have(k, 'motor', 30)),
  {
    name: 'circuit-chain',
    when: (k) => k.circuitIngot() !== null && k.countRecipe('circuit-assembler', k.circuitIngot()!.circuit) < 3 && late(k) && have(k, 'silicon', 60),
    plan: (k) => {
      const c = k.circuitIngot()!;
      const ingot: [string, number, [string, string]] = [c.ore, 3, ['smelter', c.smelt]];
      return k.chain('circuit-assembler', c.circuit, [ingot, ['copper-ore', 3, ['wire-mill', 'draw-wire']]], true) ?? k.chain('circuit-assembler', c.circuit, [ingot], true);
    },
  },
  {
    name: 'circuit-2',
    when: (k) => k.circuitIngot() !== null && k.countRecipe('circuit-assembler', k.circuitIngot()!.circuit) < 2 && late(k) && have(k, 'silicon', 60),
    plan: (k) => k.supplied('circuit-assembler', k.circuitIngot()!.circuit),
  },
  {
    name: 'lead-pod',
    when: (k) => k.hasOre('lead-ore') && k.countRecipe('smelter', 'smelt-lead') < 1 && late(k),
    plan: (k) => k.pod('smelter', 'smelt-lead', 'lead-ore', 3),
  },
  { name: 'plastic', hold: true, when: (k) => k.count('refinery') < 1 && late(k) && have(k, 'circuit', 15), plan: (k) => k.plasticWorks() },
  {
    name: 'cells',
    hold: true,
    when: (k) => k.countRecipe('circuit-assembler', k.cellRecipe()) < 1 && have(k, 'plastic', 10),
    plan: (k) => k.supplied('circuit-assembler', k.cellRecipe()),
  },
  {
    name: 'lithium-furnace',
    when: (k) => k.countRecipe('alloy-furnace', 'refine-lithium') < 1 && have(k, 'lithium-salt', 20),
    plan: (k) => k.supplied('alloy-furnace', 'refine-lithium'),
  },
  // frames take steel only: waiting for 40 circuits (which the motors ate) held seed 6 at 0 frames for 48 minutes
  { name: 'frames', hold: true, when: (k) => k.countRecipe('3d-printer', 'print-frame-steel') < 1 && k.count('3d-printer') > 0 && have(k, 'steel', 30), plan: (k) => k.supplied('3d-printer', 'print-frame-steel') },
  { name: 'chips', hold: true, when: (k) => k.countRecipe('3d-printer', 'print-core-chip') < 1 && k.count('3d-printer') > 1 && have(k, 'circuit', 40), plan: (k) => k.supplied('3d-printer', 'print-core-chip') },
  {
    name: 'chips-more',
    when: (k) => k.countRecipe('3d-printer', 'print-core-chip') < 3 && k.done('chips') && k.stock('core-chip') < 60 && have(k, 'circuit', 80),
    plan: (k) => k.supplied('3d-printer', 'print-core-chip'),
  },
  { name: 'kiln-2', when: (k) => k.count('glass-kiln') < 2 && late(k) && k.stock('glass') < 150, plan: (k) => k.station('glass-kiln', 'fire-glass', ['sand']) },
  {
    name: 'tungsten',
    when: (k) => k.hasOre('tungsten-ore') && k.lines('tungsten-ore') < 1 && late(k) && have(k, 'silicon', 60),
    plan: (k) => k.rawLine('tungsten-ore', 4),
  },
  { name: 'carbide', hold: true, when: (k) => k.countRecipe('alloy-furnace', 'forge-carbide') < 1 && have(k, 'tungsten-ore', 10), plan: (k) => k.supplied('alloy-furnace', 'forge-carbide') },
  upgrade('build', 1, (k) => have(k, 'copper-wire', 60)),
  upgrade('build', 2, (k) => have(k, 'circuit', 60)),
  // waits for its printed and forged parts (read from the content: a hard-coded 60 carbide outlived a cheaper reactor)
  { name: 'fusion', hold: true, when: (k) => k.count('fusion-reactor') < 1 && partsFor(k, 'fusion-reactor'), plan: (k) => k.loose('fusion-reactor', 5, 70) },
  // the elevator eats hundreds of items per stage, all brought by drones: bigger holds
  upgrade('cargo', 1, (k) => k.done('fusion')),
  upgrade('cargo', 2, (k) => k.done('fusion')),
  upgrade('cargo', 3, (k) => k.count('space-elevator') > 0),
  { name: 'elevator', when: (k) => k.count('space-elevator') < 1 && k.done('fusion'), hold: true, plan: (k) => k.loose('space-elevator', 6, 60) },
  {
    name: 'world-ore',
    // early, as soon as steel is cast: by the time the elevator (or even a printer) stood, the base had grown
    // around the path to the far patch and no line found room (seed 7 waited 20 minutes for star alloy)
    when: (k) => k.worldOre() !== null && k.lines(k.worldOre()!) < 1 && late(k) && have(k, 'silicon', 60),
    plan: (k) => k.rawLine(k.worldOre()!, 4),
  },
  { name: 'accelerator', when: (k) => k.count('particle-accelerator') < 1 && k.done('elevator-3') && k.starAlloy() !== null, hold: true, plan: (k) => k.accelerator() },
  // after the story steps: its lacking motors were set aside first, and the accelerator waited 20 minutes for 8
  helper('helper-late', (k) => k.world.state.drones.length >= 3),
];

/** More of what the late chain eats: each grows while its product runs low. */
const SCALE: Step[] = [
  { name: 'iron-more', when: (k) => k.count('smelter') < 9 && late(k) && k.stock('iron-bar') < 300, plan: (k) => k.pod('smelter', 'smelt-iron', 'iron-ore', 3) },
  { name: 'graphite-more', when: (k) => k.count('graphite-press') < 4 && late(k) && k.stock('graphite') < 300, plan: (k) => k.pod('graphite-press', 'press-graphite', 'coal', 3) },
  {
    // graphite feeds steel, plates and silicon: late runs died when the presses fell behind
    name: 'graphite-chain',
    when: (k) => k.count('graphite-press') < 6 && late(k) && k.stock('graphite') < 600,
    plan: (k) => k.chain('graphite-press', 'press-graphite', [['coal', 4]]),
  },
  {
    name: 'steel-chain',
    when: (k) => k.countRecipe('steel-foundry', 'cast-steel') < 6 && late(k) && k.stock('steel') < 800,
    plan: (k) => k.chain('steel-foundry', 'cast-steel', [['iron-ore', 3, ['smelter', 'smelt-iron']]], true),
  },
  {
    name: 'plate-chain',
    when: (k) => k.hasOre('titanium-ore') && k.countRecipe('steel-foundry', 'roll-titanium') < 3 && late(k) && k.stock('titanium-plate') < 400,
    plan: (k) => k.chain('steel-foundry', 'roll-titanium', [['titanium-ore', 4]], true),
  },
  {
    name: 'steel-more',
    when: (k) => k.countRecipe('steel-foundry', 'cast-steel') < 6 && late(k) && k.stock('steel') < 500 && have(k, 'iron-bar', 150),
    plan: (k) => k.station('steel-foundry', 'cast-steel', ['iron-bar', 'graphite']),
  },
  {
    name: 'ti-more',
    when: (k) => k.hasOre('titanium-ore') && k.lines('titanium-ore') < 3 && late(k) && k.stock('titanium-ore') < 150,
    plan: (k) => k.rawLine('titanium-ore', 4),
  },
  {
    name: 'plates-more',
    when: (k) => k.countRecipe('steel-foundry', 'roll-titanium') < 2 && late(k) && k.stock('titanium-plate') < 300 && have(k, 'titanium-ore', 150),
    plan: (k) => k.station('steel-foundry', 'roll-titanium', ['titanium-ore', 'graphite']),
  },
  {
    // a sand line straight into the smelter, graphite (which piles up) by drone
    name: 'silicon-chain',
    when: (k) => k.countRecipe('silicon-smelter', 'smelt-silicon-graphite') < 4 && late(k) && k.stock('silicon') < 400 && k.stock('graphite') > 200,
    plan: (k) => k.chain('silicon-smelter', 'smelt-silicon-graphite', [['sand', 4]], true),
  },
  {
    name: 'silicon-more',
    when: (k) => k.count('silicon-smelter') < 5 && late(k) && k.stock('silicon') < 300 && k.stock('sand') > 200,
    plan: (k) => (k.stock('coal') < k.stock('graphite') ? k.station('silicon-smelter', 'smelt-silicon-graphite', ['sand', 'graphite']) : k.station('silicon-smelter', 'smelt-silicon', ['sand', 'coal'])),
  },
  { name: 'coal-more', when: (k) => k.lines('coal') < 3 && late(k) && k.stock('coal') < 150, plan: (k) => k.rawLine('coal', 4) },
  { name: 'sand-more', when: (k) => k.lines('sand') < 3 && late(k) && k.stock('sand') < 150, plan: (k) => k.rawLine('sand', 4) },
  {
    // wire for circuits, motors and the cells' assembler: a copper line straight into a mill
    name: 'wire-chain',
    when: (k) => k.count('wire-mill') < 5 && late(k) && k.stock('copper-wire') < 200,
    plan: (k) => k.chain('wire-mill', 'draw-wire', [['copper-ore', 3]]),
  },
  { name: 'wire-more', when: (k) => k.count('wire-mill') < 4 && late(k) && k.stock('copper-wire') < 100, plan: (k) => k.station('wire-mill', 'draw-wire', ['copper-ore']) },
  // sun power needs no coal: the plants starve when coal runs short, and everything slows with them
  { name: 'solar-big', when: (k) => k.power().use * 0.7 > k.power().make && late(k) && have(k, 'silicon', 150) && have(k, 'glass', 40), plan: (k) => k.loose('large-solar', 5, 60) },
];

/**
 * The watchdog's own step: after a stall, one more machine for what the running order asks for, fed by drones
 * (a kiln whose lane was cut kept the glass order at 17 of 60 for two hours). One per stall.
 */
function rescue(k: Brain): Batch | null {
  const w = k.world;
  for (const a of w.state.progress.active) {
    const g = w.content.orders.get(a.id).goal;
    if (g.kind === 'build') continue;
    for (const b of w.content.buildings.list) {
      if (b.behaviour !== 'crafter') continue;
      const r = (b.recipes ?? []).map((id) => w.content.recipes.get(id)).find((x) => x.outputs.some((o) => o.item === g.item) && !x.liquidIn?.length && x.inputs.every((i) => k.stock(i.item) > 0));
      if (r) return k.supplied(b.id, r.id);
    }
  }
  return null;
}

export const STEPS: Step[] = [
  {
    name: 'rescue',
    when: (k) => k.mem.stalls > k.mem.rescued,
    plan: (k) => {
      const out = rescue(k);
      if (!out) k.mem.rescued = k.mem.stalls; // nothing to add for this stall
      return out;
    },
    paid: (k) => {
      k.mem.rescued = k.mem.stalls;
    },
  },
  // what a story order asks for and no planner below makes on its way (a sorter, bridges, a pump, batteries ...)
  { name: 'order-build', hold: true, when: (k) => k.orderWants() !== null, plan: (k) => k.forOrder(k.orderWants()!) },
  { name: 'order-ore', when: (k) => k.orderedOre() !== null, plan: (k) => k.rawLine(k.orderedOre()!, 4, true) ?? k.rawLine(k.orderedOre()!, 4) },
  { name: 'copper-1', when: (k) => k.rate('copper-ore') < 2.4, plan: (k) => k.rawLine('copper-ore', 6) },
  { name: 'iron-pod-1', when: (k) => k.count('smelter') < 1, plan: (k) => k.pod('smelter', 'smelt-iron', 'iron-ore', 3) },
  { name: 'copper-2', when: (k) => k.rate('copper-ore') < 4.5, plan: (k) => k.rawLine('copper-ore', 6) },
  { name: 'graphite-pod', when: (k) => k.count('graphite-press') < 1, plan: (k) => k.pod('graphite-press', 'press-graphite', 'coal', 3) },
  { name: 'silicon', when: (k) => k.count('silicon-smelter') < 1, plan: (k) => k.terminal('silicon-smelter', 'smelt-silicon', [['sand', 4], ['coal', 2]]) ?? (have(k, 'sand', 20) && have(k, 'coal', 20) ? k.station('silicon-smelter', 'smelt-silicon', ['sand', 'coal']) : null) },
  { name: 'iron-pod-2', when: (k) => k.count('smelter') < 2 && minutes(k) > 2, plan: (k) => k.pod('smelter', 'smelt-iron', 'iron-ore', 3) },
  { name: 'upgrade', when: (k) => k.coreSize() < 4, hold: true, price: upgradeCost, plan: (k) => k.upgrade() },
  { name: 'coal-line', when: (k) => k.lines('coal') < 1 && minutes(k) > 3, plan: (k) => k.rawLine('coal', 4) },
  { name: 'sand-line', when: (k) => k.lines('sand') < 1 && minutes(k) > 3, plan: (k) => k.rawLine('sand', 3) },
  { name: 'plant-1', when: (k) => k.count('combustion-generator') < 4 && k.coreSize() >= 4 && have(k, 'silicon', 30), plan: (k) => k.plant(2) },
  { name: 'wire-mill', when: (k) => k.count('wire-mill') < 1 && (k.coreSize() >= 4 || k.wants('wire-mill')), plan: (k) => k.station('wire-mill', 'draw-wire', ['copper-ore']) },
  { name: 'ring', when: (k) => k.coreSize() >= 4 && k.count('container') < 2 && have(k, 'iron-bar', 60), plan: (k) => k.dock('container') },
  {
    name: 'ring-vault',
    when: (k) => k.coreSize() >= 4 && k.count('container') >= 2 && k.count('vault') < 3 && have(k, 'steel', 80) && have(k, 'titanium-plate', 30),
    plan: (k) => k.dock('vault'),
  },
  { name: 'container', when: (k) => k.count('container') < 1 && k.coreSize() >= 4, plan: (k) => k.dock('container') },
  {
    name: 'foundry-1',
    hold: true,
    when: (k) => k.countRecipe('steel-foundry', 'cast-steel') < 1 && k.coreSize() >= 4 && have(k, 'silicon', 30),
    plan: (k) => k.station('steel-foundry', 'cast-steel', ['iron-bar', 'graphite']),
  },
  {
    name: 'ti-line',
    when: (k) => k.lines('titanium-ore') < 1 && k.hasOre('titanium-ore') && k.countRecipe('steel-foundry', 'cast-steel') > 0 && have(k, 'graphite', 80),
    plan: (k) => k.rawLine('titanium-ore', 4),
  },
  {
    name: 'roller',
    hold: true,
    when: (k) => k.countRecipe('steel-foundry', 'roll-titanium') < 1 && have(k, 'titanium-ore', 30) && have(k, 'silicon', 30),
    plan: (k) => k.station('steel-foundry', 'roll-titanium', ['titanium-ore', 'graphite']),
  },
  {
    name: 'ingot-pod',
    when: (k) => {
      const c = k.circuitIngot();
      return c !== null && k.countRecipe('smelter', c.smelt) < 1 && k.countRecipe('steel-foundry', 'cast-steel') > 0;
    },
    plan: (k) => {
      const c = k.circuitIngot()!;
      return k.pod('smelter', c.smelt, c.ore, 3);
    },
  },
  {
    name: 'circuit-1',
    hold: true,
    when: (k) => {
      const c = k.circuitIngot();
      return c !== null && k.countRecipe('circuit-assembler', c.circuit) < 1 && have(k, c.ingot, 5) && have(k, 'copper-wire', 40) && have(k, 'silicon', 40);
    },
    plan: (k) => {
      const c = k.circuitIngot()!;
      return k.station('circuit-assembler', c.circuit, ['copper-wire', 'silicon', c.ingot]);
    },
  },
  { name: 'iron-pod-3', when: (k) => k.count('smelter') < 4 && k.count('steel-foundry') > 0 && k.stock('iron-bar') < 400, plan: (k) => k.pod('smelter', 'smelt-iron', 'iron-ore', 3) },
  { name: 'graphite-pod-2', when: (k) => k.count('graphite-press') < 2 && k.count('steel-foundry') > 0 && k.stock('graphite') < 300, plan: (k) => k.pod('graphite-press', 'press-graphite', 'coal', 3) },
  {
    name: 'silicon-2',
    when: (k) => k.count('silicon-smelter') < 2 && k.coreSize() >= 4 && k.stock('silicon') < 250 && k.stock('sand') > 200,
    plan: (k) => k.station('silicon-smelter', 'smelt-silicon', ['sand', 'coal']),
  },
  {
    // a sand line straight into the kiln first: a drone-fed kiln starved while the one drone served the rest
    name: 'kiln',
    hold: true,
    when: (k) => k.count('glass-kiln') < 1 && (k.coreSize() >= 4 || k.ordered('glass')),
    plan: (k) => k.terminal('glass-kiln', 'fire-glass', [['sand', 4]]) ?? (have(k, 'sand', 100) ? k.station('glass-kiln', 'fire-glass', ['sand']) : null),
  },
  { name: 'plant-2', when: (k) => k.power().use > k.power().make - 6 && k.coreSize() >= 4 && have(k, 'silicon', 30) && have(k, 'coal', 150), plan: (k) => k.plant(3) },
  ...SCALE,
  ...LATE,
];
