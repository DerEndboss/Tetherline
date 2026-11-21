import type { Id } from '../content/types';
import { drillInfo, drillInfoAt } from '../sim/blocks/production';
import { touches } from '../sim/grid';
import { powerGraph } from '../sim/power';
import type { Building } from '../sim/state';
import type { World } from '../sim/world';
import { beltHelp, lostUnloader, starvedSmelter, type Help } from './help';
import { around, between, coreRect, nextToAll, oreSpot, spotOf, type Spot } from './spots';

/** What a step may look at: the world and the player's tool in hand (copying a blueprint is not in the world). */
export interface StepContext {
  world: World;
  /** A blueprint has been copied (the clipboard holds one). */
  copied: boolean;
}

/** One lesson of the guided first round. Pure data plus predicates over the world, so it is testable without a browser. */
export interface TutorialStep {
  id: string;
  title: string;
  /** What to do, in one or two sentences. */
  hint: string;
  /** The palette entry to point at (the guide moves to its tab when it is on another one). */
  pick?: Id;
  /** A toolbar button to point at instead. */
  tool?: 'copy';
  /** Done when this holds; steps never go back once they were done. */
  done(c: StepContext): boolean;
  /** Whether the drone already has what this step asks for as a ghost or a building site. */
  queued(c: StepContext): boolean;
  /** Where on the map to look: the first spot gets the arrow. Empty while the drone has the thing as a ghost (the player did it). */
  spots(c: StepContext): Spot[];
  /** Why the player is stuck, when what they built cannot work (a belt that ends beside the core); null while all is well. */
  help?(c: StepContext): Help | null;
}

const DRILL = 'mechanical-drill';

function idx(w: World, id: Id): number {
  return w.content.materials.indexOf(id);
}

function ready(w: World): Building[] {
  return w.state.buildings.filter((b) => w.ready(b));
}

/** Finished drills standing on an ore. */
export function drillsOn(w: World, ore: Id): Building[] {
  const item = idx(w, ore);
  return ready(w).filter((b) => w.def(b).behaviour === 'drill' && drillInfo(w, b).item === item);
}

/** Finished buildings of one kind (by id). */
function finished(w: World, id: Id): Building[] {
  return ready(w).filter((b) => w.def(b).id === id);
}

/** Finished smelters (any crafter named like the id) that touch a drill on iron. */
export function smeltersAtIron(w: World): Building[] {
  const drills = new Set(drillsOn(w, 'iron-ore').map((b) => b.id));
  return finished(w, 'smelter').filter((b) => w.neighbours(b).some((n) => drills.has(n.id)));
}

/** The smelter the later steps talk about: one on the iron drill if there is one, else any finished smelter. */
export function theSmelter(w: World): Building | undefined {
  return smeltersAtIron(w)[0] ?? finished(w, 'smelter')[0];
}

/** Finished buildings that need power and share a network with the core. */
export function poweredFromCore(w: World): Building[] {
  const graph = powerGraph(w);
  const core = graph.netOf.get(w.state.core);
  if (core === undefined) return [];
  return ready(w).filter((b) => (w.def(b).power?.use ?? 0) > 0 && graph.netOf.get(b.id) === core);
}

const delivered = (w: World, id: Id): number => w.state.stats.delivered[idx(w, id)] ?? 0;

/** A ghost or an unfinished site of a building (by id) or of any conveyor (`'conveyor'` stands for all belts). */
function queuedOf(w: World, id: Id): boolean {
  const kind = w.content.buildings.indexOf(id);
  return w.state.plans.some((p) => p.kind === kind) || w.state.buildings.some((b) => b.kind === kind && b.build < 1);
}

/** A ghost or an unfinished site of a drill that would mine `ore` (a drill on other ground does not count for the step). */
function queuedDrill(w: World, ore: Id): boolean {
  const item = idx(w, ore);
  const mines = (kind: number, x: number, y: number): boolean => {
    const def = w.defs[kind];
    return def?.behaviour === 'drill' && drillInfoAt(w, x, y, def.size, def.drill?.tier ?? 1).item === item;
  };
  return w.state.plans.some((p) => mines(p.kind, p.x, p.y)) || w.state.buildings.some((b) => b.build < 1 && !b.removing && mines(b.kind, b.x, b.y));
}

/** The core and (when there is one) the drill the belt starts at. */
function beltEnds(w: World, drill: Building | undefined, from: string): Spot[] {
  const core = coreRect(w);
  const out: Spot[] = [];
  if (drill) out.push(spotOf(w.rect(drill), from));
  if (core) out.push(spotOf(core, 'Core'));
  return out;
}

function drillSpot(c: StepContext, ore: Id, label: string): Spot[] {
  if (queuedDrill(c.world, ore)) return []; // the ghost is the answer: a ring that moved on to the next free patch would jump
  const def = c.world.content.buildings.get(DRILL);
  const spot = oreSpot(c.world, def, ore);
  return spot ? [{ ...spot, label }] : [];
}

/** A tile to lean toward: the building's, else the core's. */
function toward(w: World, b?: Building): { x: number; y: number } {
  const pos = b ?? w.core;
  return { x: pos?.x ?? 0, y: pos?.y ?? 0 };
}

/** Finished Wire Mills. */
const wireMills = (w: World): Building[] => finished(w, 'wire-mill');

/** The mill the unloader step feeds: one that touches the core, else any. */
function theMill(w: World): Building | undefined {
  const core = coreRect(w);
  const all = wireMills(w);
  return (core ? all.find((m) => touches(w.rect(m), core)) : undefined) ?? all[0];
}

/** Where the Wire Mill goes: against the core, leaning toward the copper, on a side with room left for an unloader. */
function millSpot(c: StepContext): Spot[] {
  const w = c.world;
  const core = coreRect(w);
  if (!core || queuedOf(w, 'wire-mill')) return [];
  const options = nextToAll(w, w.content.buildings.get('wire-mill'), core, toward(w, drillsOn(w, 'copper-ore')[0]));
  const unloader = w.content.buildings.find('unloader');
  const roomy = unloader ? options.find((s) => between(w, unloader, core, { x: s.x, y: s.y, size: s.w })) : undefined;
  const spot = roomy ?? options[0];
  return spot ? [{ ...spot, label: 'Powered here' }] : [];
}

/** Where the Unloader goes: a tile that touches both the core and the mill. */
function unloaderSpot(c: StepContext): Spot[] {
  const w = c.world;
  const core = coreRect(w);
  const mill = theMill(w);
  const def = w.content.buildings.find('unloader');
  if (!core || !mill || !def || queuedOf(w, 'unloader')) return [];
  const spot = between(w, def, core, w.rect(mill));
  return spot ? [{ ...spot, label: 'Unloader here' }] : [];
}

export const STEPS: readonly TutorialStep[] = [
  {
    id: 'copper-drill',
    title: 'Drill for copper',
    hint: 'Pick the Mechanical Drill and put it on copper ore, the orange-brown flecks. Your drone flies out and builds it.',
    pick: DRILL,
    done: (c) => drillsOn(c.world, 'copper-ore').length > 0,
    queued: (c) => queuedDrill(c.world, 'copper-ore'),
    spots: (c) => drillSpot(c, 'copper-ore', 'Copper here'),
  },
  {
    id: 'copper-belt',
    title: 'Belt it home',
    hint: 'Pick the Conveyor and drag a line from the drill to the core. It turns corners by itself; R turns a piece.',
    pick: 'conveyor',
    done: (c) => delivered(c.world, 'copper-ore') > 0,
    queued: (c) => queuedOf(c.world, 'conveyor'),
    spots: (c) => beltEnds(c.world, drillsOn(c.world, 'copper-ore')[0], 'Drill'),
    help: (c) => beltHelp(c.world, drillsOn(c.world, 'copper-ore')[0], 'drill'),
  },
  {
    id: 'iron-drill',
    title: 'Drill for iron',
    hint: 'Iron ore needs a smelter. First put a second drill on iron ore, the grey-brown flecks.',
    pick: DRILL,
    done: (c) => drillsOn(c.world, 'iron-ore').length > 0,
    queued: (c) => queuedDrill(c.world, 'iron-ore'),
    spots: (c) => drillSpot(c, 'iron-ore', 'Iron here'),
  },
  {
    id: 'smelter',
    title: 'Build a smelter',
    hint: 'Place a Smelter touching the iron drill. Drills hand their ore straight to a neighbour that takes it.',
    pick: 'smelter',
    done: (c) => finished(c.world, 'smelter').length > 0,
    queued: (c) => queuedOf(c.world, 'smelter'),
    spots: (c) => {
      const w = c.world;
      const drill = drillsOn(w, 'iron-ore')[0];
      if (!drill || queuedOf(w, 'smelter')) return [];
      const spot = nextToAll(w, w.content.buildings.get('smelter'), w.rect(drill), toward(w))[0];
      return spot ? [{ ...spot, label: 'Smelter here' }] : [];
    },
  },
  {
    id: 'iron-belt',
    title: 'Bars to the core',
    hint: 'Drag a conveyor from the smelter to the core. Iron bars are what most things are built from.',
    pick: 'conveyor',
    done: (c) => delivered(c.world, 'iron-bar') > 0,
    queued: (c) => queuedOf(c.world, 'conveyor'),
    spots: (c) => beltEnds(c.world, theSmelter(c.world), 'Smelter'),
    help: (c) => starvedSmelter(c.world, theSmelter(c.world), drillsOn(c.world, 'iron-ore')) ?? beltHelp(c.world, theSmelter(c.world), 'smelter'),
  },
  {
    id: 'power',
    title: 'Connect power',
    hint: 'The core makes 4 power and shares it with whatever touches it. Put a Wire Mill against the core, or link a farther one with a Power Node.',
    pick: 'wire-mill',
    done: (c) => poweredFromCore(c.world).length > 0,
    queued: (c) => queuedOf(c.world, 'wire-mill'),
    spots: millSpot,
  },
  {
    id: 'unloader',
    title: 'Feed the mill',
    hint: 'The core keeps what it gets and hands nothing out. An Unloader touching the core and the mill takes copper out for it. Click it afterwards and pick Copper Ore.',
    pick: 'unloader',
    done: (c) => delivered(c.world, 'copper-wire') > 0,
    queued: (c) => queuedOf(c.world, 'unloader'),
    spots: unloaderSpot,
    help: (c) => lostUnloader(c.world, finished(c.world, 'unloader'), wireMills(c.world)),
  },
  {
    id: 'blueprint',
    title: 'Copy a blueprint',
    hint: 'Press B (or Copy), then drag a box around your smelter and its drill. Ctrl+V pastes the copy anywhere, so a good build is never built twice.',
    tool: 'copy',
    done: (c) => c.copied,
    queued: () => false,
    spots: (c) => {
      const smelter = theSmelter(c.world);
      const drills = drillsOn(c.world, 'iron-ore');
      const list = smelter ? [smelter, ...drillsTouching(c.world, smelter, drills)] : [];
      const spot = around(c.world, list, 'Copy this');
      return spot ? [spot] : [];
    },
  },
];

/** The drills (of a list) touching a smelter. */
function drillsTouching(w: World, smelter: Building, drills: Building[]): Building[] {
  const touching = new Set(w.neighbours(smelter).map((n) => n.id));
  return drills.filter((d) => touching.has(d.id));
}

/** Index of the first step from `from` on that is not done yet (STEPS.length when all are). Earlier steps are not asked again. */
export function firstOpen(c: StepContext, from = 0): number {
  for (let i = from; i < STEPS.length; i++) if (!STEPS[i]?.done(c)) return i;
  return STEPS.length;
}
