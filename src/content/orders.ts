import '../sim/progression/schema';
import { buildings } from './buildings';
import { materials } from './materials';
import type { Id, OrderDef, OrderGoal } from './types';

/**
 * The story chain of Chill mode: about an hour of orders, each with a short radio line from
 * Control, from the first drill to the Space Elevator. Chapters: Touchdown (the guided first 5 minutes), Foothold,
 * Industry, Heavy Machines, Space Elevator (stages 1 to 5; the elevator itself is built in three segments).
 *
 * Orders may name materials and buildings the content may not have yet (Star Alloy, Fusion Reactor ...). Goals that
 * name something the content does not have are dropped and the chain closes the gap, so the game always has a
 * winnable chain; `droppedOrders` lists what was cut (the content test keeps it empty once everything exists).
 */

type Entry = Omit<OrderDef, 'after'> & { after?: Id[] };

const T = (hint: string, highlight?: Id) => ({ hint, highlight });

/** Chapter 1: the guided start. Every order here has a tutorial hint. */
const touchdown: Entry[] = [
  {
    id: 'first-drill', chapter: 'Touchdown', title: 'Drill for copper',
    radio: 'Welcome down, pilot. Put a drill on that copper ore.',
    goal: { kind: 'build', building: 'mechanical-drill', n: 1 },
    tutorial: T('Pick the Mechanical Drill, then place it on copper ore. Your drone flies out and builds it.', 'mechanical-drill'),
  },
  {
    id: 'belt-to-core', chapter: 'Touchdown', title: 'Belt it home',
    radio: 'Now a conveyor from the drill to the core. Drag a line, the drone does the rest.',
    goal: { kind: 'deliver', item: 'copper-ore', n: 30 },
    tutorial: T('Drag a conveyor line from the drill to the core. Press R to turn a piece.', 'conveyor'),
  },
  {
    id: 'more-drills', chapter: 'Touchdown', title: 'More drills',
    radio: 'More ore, more everything. Drills hand over to any neighbour that takes it.',
    goal: { kind: 'build', building: 'mechanical-drill', n: 4 },
    tutorial: T('Hold Shift to place several drills in a row.', 'mechanical-drill'),
  },
  {
    id: 'first-smelter', chapter: 'Touchdown', title: 'Smelt iron',
    radio: 'Iron ore wants a smelter. Put one right next to a drill on iron and it feeds itself.',
    goal: { kind: 'build', building: 'smelter', n: 1 },
    tutorial: T('Place a Smelter touching a drill that sits on iron ore.', 'smelter'),
  },
  {
    id: 'iron-bars', chapter: 'Touchdown', title: 'Iron bars to the core',
    radio: 'Run a belt from the smelter to the core. Bars are what we build with.',
    goal: { kind: 'deliver', item: 'iron-bar', n: 20 },
    tutorial: T('Lay a conveyor from the smelter to the core.', 'conveyor'),
  },
  {
    id: 'power-core', chapter: 'Touchdown', title: 'First power',
    radio: 'The core makes 4 units of power. Anything touching it gets some. Try a wire mill.',
    goal: { kind: 'build', building: 'wire-mill', n: 1 },
    tutorial: T('Place a Wire Mill so it touches the core: it runs on the core\'s power.', 'wire-mill'),
  },
  {
    id: 'copper-wire', chapter: 'Touchdown', title: 'Spool some wire',
    radio: 'The core keeps what it gets. An unloader takes copper back out and hands it to the mill next to it.',
    goal: { kind: 'deliver', item: 'copper-wire', n: 30 },
    tutorial: T('Place an Unloader touching both the core and the Wire Mill, and set it to copper ore.', 'unloader'),
    unlocks: ['bridge-conveyor', 'sorter', 'overflow-gate', 'container'],
    reward: 1,
  },
];

const foothold: Entry[] = [
  {
    id: 'storage', chapter: 'Foothold', title: 'Make room',
    radio: 'The core is filling up. Containers dock to it and add room.',
    goal: { kind: 'build', building: 'container', n: 1 },
  },
  {
    id: 'coal-run', chapter: 'Foothold', title: 'Find coal',
    radio: 'Dark rock is coal. It burns, and it turns into graphite.',
    goal: { kind: 'deliver', item: 'coal', n: 80 },
  },
  {
    id: 'sorter', chapter: 'Foothold', title: 'Sort it out',
    radio: 'Two ores on one belt? A sorter lets the chosen item through and sends the rest to the sides.',
    goal: { kind: 'build', building: 'sorter', n: 1 },
  },
  {
    id: 'sand-run', chapter: 'Foothold', title: 'Dig sand',
    radio: 'Sand and coal together make silicon. Get the sand first.',
    goal: { kind: 'deliver', item: 'sand', n: 80 },
  },
  {
    id: 'graphite', chapter: 'Foothold', title: 'Press graphite',
    radio: 'A graphite press turns coal into something harder.',
    goal: { kind: 'deliver', item: 'graphite', n: 40 },
  },
  {
    id: 'generator', chapter: 'Foothold', title: 'Burn for power',
    radio: 'Four units will not last. A combustion generator eats coal and gives power. Link it with a node.',
    goal: { kind: 'build', building: 'combustion-generator', n: 1 },
    unlocks: ['power-node', 'battery'],
  },
  {
    id: 'bridges', chapter: 'Foothold', title: 'Over the top',
    radio: 'Belts in the way? A bridge conveyor jumps up to three tiles to another bridge. Lay a pair.',
    goal: { kind: 'build', building: 'bridge-conveyor', n: 2 },
  },
  {
    id: 'steady-iron', chapter: 'Foothold', title: 'A steady flow',
    radio: 'Now keep it going: 20 iron bars a minute for two minutes. Not a burst, a flow.',
    goal: { kind: 'rate', item: 'iron-bar', perMinute: 20, minutes: 2 },
    reward: 1,
  },
  {
    id: 'solar', chapter: 'Foothold', title: 'Catch some sun',
    radio: 'Solar panels need no fuel and no belts: wire and iron, and they run forever. Put four out in the open.',
    goal: { kind: 'build', building: 'solar-panel', n: 4 },
    unlocks: ['pneumatic-drill', 'electric-drill'],
  },
  {
    id: 'battery', chapter: 'Foothold', title: 'Save some for later',
    radio: 'Batteries keep spare power for the moment a big machine starts. Two will do.',
    goal: { kind: 'build', building: 'battery', n: 2 },
  },
];

const industry: Entry[] = [
  {
    id: 'glass', chapter: 'Industry', title: 'Fire some glass',
    radio: 'Sand in a kiln comes out as glass. Pipes and screens will want it.',
    goal: { kind: 'deliver', item: 'glass', n: 40 },
  },
  {
    id: 'silicon', chapter: 'Industry', title: 'Silicon',
    radio: 'Silicon is the brain of every machine. Sand, coal and a bit of power.',
    goal: { kind: 'deliver', item: 'silicon', n: 50 },
  },
  {
    id: 'water', chapter: 'Industry', title: 'Water works',
    radio: 'Water makes drills 60 % faster. Put a pump on a pond and lead a conduit to your drills.',
    goal: { kind: 'build', building: 'mechanical-pump', n: 1 },
  },
  {
    id: 'steel', chapter: 'Industry', title: 'Cast steel',
    radio: 'Iron and graphite into the foundry. Steel is what the big things are made of.',
    goal: { kind: 'deliver', item: 'steel', n: 60 },
    unlocks: ['steel-foundry', 'vault', 'unloader', 'laser-drill', 'large-solar', 'wind-turbine'],
  },
  {
    id: 'core-up', chapter: 'Industry', title: 'Grow the core',
    radio: 'Time to upgrade the core. It grows right where it stands, nothing to move.',
    goal: { kind: 'build', building: 'core-foundation', n: 1 },
    reward: 1,
  },
  {
    id: 'titanium', chapter: 'Industry', title: 'Titanium',
    radio: 'Scans show titanium ore out there, far from home. A pneumatic drill bites it. Mine 40, to the core or straight into a foundry.',
    // mined, not delivered: a run that rolls its plates at the patch counts too (the bot sat 40 minutes on a cut belt)
    goal: { kind: 'make', item: 'titanium-ore', n: 40 },
  },
  {
    id: 'plates', chapter: 'Industry', title: 'Titanium plates',
    radio: 'Roll it into plates in the foundry. Light, strong, and we will need a lot.',
    goal: { kind: 'deliver', item: 'titanium-plate', n: 40 },
  },
  {
    id: 'mass-driver', chapter: 'Industry', title: 'Long shot',
    radio: 'The good ore is always far away. A mass driver shoots a whole belt to another one up to 55 tiles off. Build a pair.',
    goal: { kind: 'build', building: 'mass-driver', n: 2 },
  },
  {
    id: 'circuit-flow', chapter: 'Industry', title: 'Circuit line',
    radio: 'Eight circuits a minute for two minutes: wire, silicon and tin or lead. If you can do that, you have a real factory.',
    goal: { kind: 'rate', item: 'circuit', perMinute: 8, minutes: 2 },
    unlocks: ['circuit-assembler', 'refinery', 'mass-driver', 'oil-generator'],
    reward: 1,
  },
  {
    id: 'plastic', chapter: 'Industry', title: 'Plastic',
    radio: 'Oil makes plastic in a refinery. No oil seep? An atmospheric condenser pulls gas out of the air for it.',
    goal: { kind: 'deliver', item: 'plastic', n: 30 },
  },
  {
    id: 'oil-power', chapter: 'Industry', title: 'Fuel to power',
    radio: 'A refinery on oil makes fuel as well. An oil generator burns fuel, oil or gas for 20 units.',
    goal: { kind: 'build', building: 'oil-generator', n: 1 },
  },
  {
    id: 'cells', chapter: 'Industry', title: 'Battery cells',
    radio: 'Battery cells for the grid and for the heavy machines: lead or tin ingots and plastic.',
    goal: { kind: 'deliver', item: 'battery-cell', n: 10 },
    reward: 1,
  },
];

const heavy: Entry[] = [
  {
    id: 'frames', chapter: 'Heavy Machines', title: 'Frames',
    radio: 'The 3D printer builds frames, the skeleton of mega machines. Feed it steel.',
    goal: { kind: 'deliver', item: 'frame', n: 15 },
    unlocks: ['printer-3d', '3d-printer'],
  },
  {
    id: 'motors', chapter: 'Heavy Machines', title: 'Motors',
    radio: 'Motors next. Wire, steel, circuits. You know the drill.',
    goal: { kind: 'deliver', item: 'motor', n: 15 },
  },
  {
    id: 'carbide', chapter: 'Heavy Machines', title: 'Tungsten carbide',
    radio: 'Tungsten ore is hard: only an electric drill bites it. The alloy furnace turns it into carbide for the reactor.',
    goal: { kind: 'deliver', item: 'tungsten-carbide', n: 24 },
  },
  {
    id: 'chips', chapter: 'Heavy Machines', title: 'Core chips',
    radio: 'Core chips are the best thing we can make by hand. They are the key to the rest.',
    goal: { kind: 'deliver', item: 'core-chip', n: 12 },
    unlocks: ['fusion-reactor', 'particle-accelerator'],
  },
  {
    id: 'chip-flow', chapter: 'Heavy Machines', title: 'Chip line',
    radio: 'Three chips a minute for two minutes. A line that never stops.',
    goal: { kind: 'rate', item: 'core-chip', perMinute: 3, minutes: 2 },
    reward: 1,
  },
  {
    id: 'coolant', chapter: 'Heavy Machines', title: 'Keep it cool',
    radio: 'The reactor runs hot. A coolant mixer turns water and a little titanium into coolant. Pipe it in later.',
    goal: { kind: 'build', building: 'coolant-mixer', n: 1 },
  },
  {
    id: 'fusion', chapter: 'Heavy Machines', title: 'Fusion reactor',
    radio: 'Build the fusion reactor. Small sun, big appetite. The elevator will need all of it.',
    goal: { kind: 'build', building: 'fusion-reactor', n: 1 },
    reward: 2,
  },
];

const elevator: Entry[] = [
  {
    id: 'elevator-1', chapter: 'Space Elevator', stage: 1, title: 'Stage 1: Groundwork',
    radio: 'Last job, pilot, and the big one. A space elevator. Put its base down: six by six, near the core.',
    goal: { kind: 'build', building: 'space-elevator', n: 1 },
    unlocks: ['space-elevator'],
  },
  {
    id: 'elevator-2', chapter: 'Space Elevator', stage: 1, title: 'Stage 1: Foundation',
    radio: 'Feed it steel, frames and titanium plates. It pours the foundation itself.',
    goal: { kind: 'make', item: 'elevator-segment', n: 1 },
    reward: 1,
  },
  {
    id: 'elevator-3', chapter: 'Space Elevator', stage: 2, title: 'Stage 2: Tower',
    radio: 'Now the tower. Steel, motors, circuits and core chips, all into the elevator.',
    goal: { kind: 'make', item: 'elevator-segment', n: 2 },
    reward: 1,
  },
  {
    id: 'elevator-4', chapter: 'Space Elevator', stage: 3, title: 'Stage 3: Counterweight',
    radio: 'A particle accelerator will make the singularity that holds the other end up.',
    goal: { kind: 'build', building: 'particle-accelerator', n: 1 },
  },
  {
    id: 'elevator-5', chapter: 'Space Elevator', stage: 4, title: 'Stage 4: Star alloy',
    radio: 'The crown needs star alloy, forged from this world\'s own ore. Nobody has made it at this scale. Good luck.',
    goal: { kind: 'deliver', item: 'star-alloy', n: 10 },
    reward: 1,
  },
  {
    id: 'elevator-6', chapter: 'Space Elevator', stage: 5, title: 'Stage 5: Crown',
    radio: 'Star alloy, singularity, chips and plates into the elevator. Raise the crown.',
    goal: { kind: 'make', item: 'elevator-segment', n: 3 },
    reward: 3,
  },
];

/** The whole intended chain, in order; each order follows the one before it. */
export const fullChain: OrderDef[] = [...touchdown, ...foothold, ...industry, ...heavy, ...elevator].map((e, i, all) => ({
  ...e,
  after: e.after ?? (i === 0 ? [] : [all[i - 1]!.id]),
}));

function goalExists(g: OrderGoal, items: Set<Id>, blocks: Set<Id>): boolean {
  return g.kind === 'build' ? blocks.has(g.building) : items.has(g.item);
}

/** Keeps the orders whose goals exist and closes the chain around the dropped ones. */
export function fitChain(chain: readonly OrderDef[], items: Set<Id>, blocks: Set<Id>): { orders: OrderDef[]; dropped: Id[] } {
  const dropped = chain.filter((o) => !goalExists(o.goal, items, blocks));
  const gone = new Set(dropped.map((o) => o.id));
  const after = (o: OrderDef): Id[] => {
    const out: Id[] = [];
    for (const id of o.after) {
      if (!gone.has(id)) out.push(id);
      else out.push(...after(chain.find((c) => c.id === id)!));
    }
    return [...new Set(out)];
  };
  const orders = chain
    .filter((o) => !gone.has(o.id))
    .map((o) => ({ ...o, after: after(o), unlocks: o.unlocks?.filter((u) => blocks.has(u)) }));
  return { orders, dropped: dropped.map((o) => o.id) };
}

const fitted = fitChain(fullChain, new Set(materials.map((m) => m.id)), new Set(buildings.map((b) => b.id)));

export const orders: OrderDef[] = fitted.orders;
export const droppedOrders: readonly Id[] = fitted.dropped;
