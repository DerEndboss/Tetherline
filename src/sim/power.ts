import { BLOCKS } from './blocks/registry';
import { gapBetween } from './grid';
import type { Building } from './state';
import { mapEffect } from './map-effects';
import type { World } from './world';

/**
 * Power: networks are the connected parts of a graph whose edges are touching footprints
 * (neighbours share power) and laser links of power nodes. The graph is rebuilt only when the layout changes
 * (cached on `world.cache.power`); each tick balances supply, demand and batteries per network.
 */
export interface PowerNet {
  members: Building[];
  /** Units per second made and wanted last tick, and the share of demand met (0..1). */
  made: number;
  wanted: number;
  satisfaction: number;
  /** Battery charge and capacity (units). */
  stored: number;
  capacity: number;
}

export interface PowerGraph {
  nets: PowerNet[];
  /** Building id -> index into nets. */
  netOf: Map<number, number>;
}

/** Whether a building takes part in power at all. */
export function hasPower(w: World, b: Building): boolean {
  return w.def(b).power !== undefined;
}

function find(parent: Map<number, number>, id: number): number {
  let root = id;
  while (parent.get(root)! !== root) root = parent.get(root)!;
  let cur = id;
  while (cur !== root) {
    const next = parent.get(cur)!;
    parent.set(cur, root);
    cur = next;
  }
  return root;
}

function union(parent: Map<number, number>, a: number, b: number): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
}

/** The power graph of the current layout (cached until the next layout change). */
export function powerGraph(w: World): PowerGraph {
  const hit = w.cache.power as PowerGraph | undefined;
  if (hit) return hit;
  const members = w.state.buildings.filter((b) => w.ready(b) && hasPower(w, b));
  const parent = new Map<number, number>(members.map((b) => [b.id, b.id]));
  for (const b of members) {
    for (const n of w.neighbours(b)) if (parent.has(n.id)) union(parent, b.id, n.id);
    for (const id of b.links) if (parent.has(id)) union(parent, b.id, id);
  }
  const graph: PowerGraph = { nets: [], netOf: new Map() };
  const byRoot = new Map<number, number>();
  for (const b of members) {
    const root = find(parent, b.id);
    let i = byRoot.get(root);
    if (i === undefined) {
      i = graph.nets.length;
      byRoot.set(root, i);
      graph.nets.push({ members: [], made: 0, wanted: 0, satisfaction: 0, stored: 0, capacity: 0 });
    }
    graph.nets[i]!.members.push(b);
    graph.netOf.set(b.id, i);
  }
  w.cache.power = graph;
  return graph;
}

/** Units per second a building makes right now. */
export function powerMade(w: World, b: Building): number {
  const def = w.def(b);
  const make = def.power?.make ?? 0;
  if (!make) return 0;
  switch (def.behaviour) {
    case 'generator':
      if (def.generator?.wind) return make * mapEffect(w, 'wind');
      return b.work > 0 ? make : 0;
    case 'solar':
      return make * mapEffect(w, 'solar');
    default:
      return make;
  }
}

/** Units per second a consumer wants right now (0 when idle). */
export function powerWanted(w: World, b: Building): number {
  const use = w.def(b).power?.use ?? 0;
  if (!use) return 0;
  const wants = BLOCKS[w.def(b).behaviour].wantsPower;
  return !wants || wants(w, b) ? use : 0;
}

/** Balances one network for a tick of `dt` seconds: batteries buffer the difference. */
function balance(w: World, net: PowerNet, dt: number): void {
  let made = 0;
  let wanted = 0;
  let stored = 0;
  let capacity = 0;
  for (const b of net.members) {
    made += powerMade(w, b) * w.state.bonus.power;
    wanted += powerWanted(w, b);
    const store = w.def(b).power?.store ?? 0;
    capacity += store;
    stored += Math.min(b.charge, store);
  }
  const surplus = (made - wanted) * dt;
  const used = surplus >= 0 ? Math.min(surplus, capacity - stored) : -Math.min(-surplus, stored);
  const met = wanted > 0 ? Math.min(1, (made * dt + Math.max(0, -used)) / (wanted * dt)) : 1;
  Object.assign(net, { made, wanted, satisfaction: met, stored: stored + used, capacity });
  if (capacity > 0) spreadCharge(w, net, stored + used, capacity);
}

/** Batteries hold charge in proportion to their size. */
function spreadCharge(w: World, net: PowerNet, total: number, capacity: number): void {
  for (const b of net.members) {
    const store = w.def(b).power?.store ?? 0;
    if (store) b.charge = (total * store) / capacity;
  }
}

/** Runs the power balance of every network (called once per tick before the buildings update). */
export function stepPower(w: World, dt: number): void {
  for (const net of powerGraph(w).nets) balance(w, net, dt);
}

/** The share of its demand a building gets (1 for buildings that use no power, 0 when unconnected). */
export function powerFactor(w: World, b: Building): number {
  if (!(w.def(b).power?.use ?? 0)) return 1;
  const g = powerGraph(w);
  const i = g.netOf.get(b.id);
  return i === undefined ? 0 : g.nets[i]!.satisfaction;
}

/** Nodes link by laser to buildings within `laserRange` tiles (footprint edge to edge). */
export function inLaserRange(w: World, node: Building, other: Building): boolean {
  return gapBetween(w.rect(node), w.rect(other)) <= (w.def(node).power?.laserRange ?? 0);
}

function linkFree(w: World, node: Building): boolean {
  return node.links.length < (w.def(node).power?.maxLinks ?? 0);
}

/** Adds a laser link both ways (nodes list each other; a plain building is listed by its node only). */
export function addLink(w: World, node: Building, other: Building): void {
  if (node.links.includes(other.id) || node === other) return;
  node.links.push(other.id);
  if (w.def(other).behaviour === 'power-node' && !other.links.includes(node.id)) other.links.push(node.id);
  w.touch();
}

export function removeLink(w: World, node: Building, other: Building): void {
  node.links = node.links.filter((id) => id !== other.id);
  other.links = other.links.filter((id) => id !== node.id);
  w.touch();
}

/**
 * A finished power building joins the grid on its own (Mindustry-like): a new node links to the nodes and
 * unconnected power buildings in its range; any other power building is picked up by one node in range that
 * is not yet in its network.
 */
export function autoLink(w: World, b: Building): void {
  if (!hasPower(w, b)) return;
  const nodes = w.state.buildings.filter((n) => n !== b && w.def(n).behaviour === 'power-node' && w.ready(n));
  if (w.def(b).behaviour === 'power-node') {
    const others = w.state.buildings.filter((o) => o !== b && w.ready(o) && hasPower(w, o) && inLaserRange(w, b, o));
    for (const o of others) {
      if (!linkFree(w, b)) break;
      if (!sameNet(w, b, o)) addLink(w, b, o);
    }
    return;
  }
  for (const node of nodes) {
    if (linkFree(w, node) && inLaserRange(w, node, b) && !sameNet(w, node, b)) {
      addLink(w, node, b);
      return;
    }
  }
}

function sameNet(w: World, a: Building, b: Building): boolean {
  const g = powerGraph(w);
  const na = g.netOf.get(a.id);
  return na !== undefined && na === g.netOf.get(b.id);
}

/** Drops every link to a building that is going away. */
export function unlinkAll(w: World, b: Building): void {
  for (const o of w.state.buildings) if (o.links.includes(b.id)) o.links = o.links.filter((id) => id !== b.id);
  b.links = [];
}
