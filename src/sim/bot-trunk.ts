import type { Memory } from './bot-build';
import type { Command, PlanSpec } from './commands';
import { DX, DY } from './grid';
import type { Building } from './state';
import { isCoreStock } from './storage';
import type { World } from './world';

/**
 * Trunk upgrade. Product lines join the nearest line on their way to the core (there are only so many core faces),
 * so late in a round one plain conveyor carries wire, graphite, silicon, plates and plastic at once. A plain belt
 * moves about 12 items a second; once it is full, a line that joins from the side waits for a gap that never comes
 * (M11 green: the refinery's plastic stood on 70 full belts for half an hour, the order at 0 of 30; M5 ice: the
 * kilns' glass). The bot does what a Mindustry player does: belts that carry several lines become fast conveyors,
 * swapped in place (the items on them stay).
 *
 * The bot never sees items on belts (the worker snapshot leaves them out), so the load of a belt is read from the
 * layout: how many line starts feed into it. A start is a belt tile no other belt hands items to.
 */

/** A belt that carries at least this many lines is a trunk. */
const TRUNK_SOURCES = 3;
/** Fast belts cost iron bars: none before the stock has this many. */
const IRON_FLOOR = 150;
/** Tiles per pass, so one pass never ties the drones up for long. */
const PER_PASS = 80;
/** Ticks between passes (one game minute). */
const EVERY = 1200;
/** Only while the drones have little else queued. */
const QUEUE_FREE = 4;

const FROM = 'conveyor';
const TO = 'fast-conveyor';

interface Graph {
  /** Belt tile -> the belt tile it hands items to (through junctions and bridges), or -2 for a store. */
  next: Map<number, number>;
  /** How many belt tiles hand items to each tile. */
  feeders: Map<number, number>;
}

const isBelt = (w: World, b: Building): boolean => w.def(b).behaviour === 'conveyor';

interface Step {
  x: number;
  y: number;
  rot: number;
}

/** Where an item that has entered a junction or bridge `b` (travelling `rot`) goes next; null when it stops there. */
function through(w: World, b: Building, rot: number): Step | null {
  const beh = w.def(b).behaviour;
  if (beh === 'junction') return { x: b.x + DX[rot]!, y: b.y + DY[rot]!, rot };
  if (beh !== 'bridge') return null;
  const p = b.link >= 0 ? w.byId.get(b.link) : undefined;
  if (!p) return { x: b.x + DX[rot]!, y: b.y + DY[rot]!, rot };
  const turn = p.x > b.x ? 0 : p.y > b.y ? 1 : p.x < b.x ? 2 : 3;
  return { x: p.x + DX[turn]!, y: p.y + DY[turn]!, rot: turn };
}

/** Where an item leaving `x, y` in direction `rot` ends up: a belt tile, a store (-2) or nothing (-1). */
function landing(w: World, x: number, y: number, rot: number): number {
  let at: Step | null = { x: x + DX[rot]!, y: y + DY[rot]!, rot };
  for (let hop = 0; hop < 12 && at; hop++) {
    const b = w.at(at.x, at.y);
    if (!b) return -1;
    if (isBelt(w, b)) return b.y * w.state.map.w + b.x;
    if (isCoreStock(w, b)) return -2;
    at = through(w, b, at.rot);
  }
  return -1;
}

function beltGraph(w: World): Graph {
  const next = new Map<number, number>();
  const feeders = new Map<number, number>();
  for (const b of w.state.buildings) {
    if (!isBelt(w, b) || b.removing) continue;
    const to = landing(w, b.x, b.y, b.rot);
    next.set(b.y * w.state.map.w + b.x, to);
    if (to >= 0) feeders.set(to, (feeders.get(to) ?? 0) + 1);
  }
  return { next, feeders };
}

/** The belt tiles from a start down to where its items leave the belts, and whether that is a store. */
function walk(g: Graph, start: number): { path: number[]; store: boolean } {
  const path: number[] = [];
  let at = start;
  // a loop in the belts stops at the tile count
  for (let n = 0; at >= 0 && n < g.next.size; n++) {
    path.push(at);
    at = g.next.get(at) ?? -1;
  }
  return { path, store: at === -2 };
}

/** Per belt tile: the line starts upstream of it, for the tiles whose belt reaches a store. */
function loads(g: Graph): Map<number, number> {
  const load = new Map<number, number>();
  const reaches = new Set<number>();
  for (const t of g.next.keys()) {
    if ((g.feeders.get(t) ?? 0) > 0) continue;
    const { path, store } = walk(g, t);
    for (const p of path) {
      load.set(p, (load.get(p) ?? 0) + 1);
      if (store) reaches.add(p);
    }
  }
  for (const t of [...load.keys()]) if (!reaches.has(t)) load.delete(t);
  return load;
}

/** Plain belts that carry a trunk's load, busiest first. */
export function trunkTiles(w: World): number[] {
  const load = loads(beltGraph(w));
  const W = w.state.map.w;
  const from = w.content.buildings.indexOf(FROM);
  return [...load]
    .filter(([t, n]) => n >= TRUNK_SOURCES && w.at(t % W, Math.floor(t / W))?.kind === from)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([t]) => t);
}

const stock = (w: World, id: string): number => w.state.stock[w.content.materials.indexOf(id)] ?? 0;

/** Ghosts that turn the busiest plain trunk belts into fast conveyors (empty when nothing needs it or it is too early). */
export function trunkUpgrades(w: World, mem: Memory): Command[] {
  if (w.state.tick - (mem.trunkAt ?? -EVERY) < EVERY || w.state.plans.length > QUEUE_FREE || stock(w, 'iron-bar') < IRON_FLOOR) return [];
  mem.trunkAt = w.state.tick;
  const W = w.state.map.w;
  const tiles = trunkTiles(w).slice(0, Math.min(PER_PASS, Math.floor(stock(w, 'iron-bar') / 2)));
  if (!tiles.length) return [];
  const plans: PlanSpec[] = tiles.map((t) => {
    const b = w.at(t % W, Math.floor(t / W))!;
    return { kind: TO, x: b.x, y: b.y, rot: b.rot };
  });
  return [{ type: 'place-many', plans }];
}
