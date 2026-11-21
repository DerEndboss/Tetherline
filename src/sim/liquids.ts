import type { Behaviour } from '../content/types';
import { DX, DY, opposite, sideOf } from './grid';
import type { Building, Dir } from './state';
import type { World } from './world';

/**
 * Liquids: conduits, junctions, routers, tanks, conduit bridges and pumps form
 * networks; a network holds one liquid, pooled over its members' capacity. The graph is rebuilt only when the
 * layout changes (cached on `world.cache.liquid`). Machines next to a network draw from it or push into it.
 * A conduit connects along its axis (front and back) and takes a feed from its side from a conduit that points
 * into it, so a drawn L-line or T-piece is one pipe while parallel lines stay apart; a junction joins east-west
 * and north-south as two separate networks.
 */
export interface LiquidNet {
  liquid: number;
  amount: number;
  capacity: number;
  members: Building[];
}

interface LiquidGraph {
  nets: LiquidNet[];
  /** `${id}:${axis}` -> net index (axis 0 for every member but a junction's north-south side). */
  netOf: Map<string, number>;
  /** Non-member building id -> nets it touches (cached on demand). */
  touching: Map<number, number[]>;
}

const MEMBERS = new Set<Behaviour>(['conduit', 'liquid-junction', 'liquid-router', 'tank', 'liquid-bridge', 'pump']);

export function isLiquidMember(w: World, b: Building): boolean {
  return MEMBERS.has(w.def(b).behaviour) && w.ready(b);
}

/**
 * Whether a member opens towards side `d`. A conduit always opens front and back; to a side only where the
 * conduit next to it points into it (the bend of an L-line, the stem of a T), never to a parallel neighbour.
 */
function opens(w: World, b: Building, d: Dir): boolean {
  if (w.def(b).behaviour !== 'conduit' || d === b.rot || d === opposite(b.rot)) return true;
  const n = w.at(b.x + DX[d]!, b.y + DY[d]!);
  return !!n && n !== b && w.ready(n) && w.def(n).behaviour === 'conduit' && n.rot === opposite(d);
}

/** The member's node for side `d` (a junction has one per axis). */
function nodeKey(w: World, b: Building, d: Dir): string {
  return `${b.id}:${w.def(b).behaviour === 'liquid-junction' ? d & 1 : 0}`;
}

function axes(w: World, b: Building): number[] {
  return w.def(b).behaviour === 'liquid-junction' ? [0, 1] : [0];
}

class Sets {
  private readonly parent = new Map<string, string>();
  add(k: string): void {
    this.parent.set(k, k);
  }
  find(k: string): string {
    let r = k;
    while (this.parent.get(r)! !== r) r = this.parent.get(r)!;
    this.parent.set(k, r);
    return r;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  keys(): string[] {
    return [...this.parent.keys()];
  }
}

function connect(w: World, sets: Sets, b: Building): void {
  for (const n of w.neighbours(b)) {
    if (!isLiquidMember(w, n)) continue;
    const d = sideOf(w.rect(b), w.rect(n));
    if (opens(w, b, d) && opens(w, n, opposite(d))) sets.union(nodeKey(w, b, d), nodeKey(w, n, opposite(d)));
  }
  if (w.def(b).behaviour !== 'liquid-bridge' || b.link < 0) return;
  const p = w.byId.get(b.link);
  if (p && isLiquidMember(w, p) && w.def(p).behaviour === 'liquid-bridge') sets.union(nodeKey(w, b, 0), nodeKey(w, p, 0));
}

/** The liquid networks of the current layout. Amounts come from the members' saved contents. */
export function liquidGraph(w: World): LiquidGraph {
  const hit = w.cache.liquid as LiquidGraph | undefined;
  if (hit) return hit;
  const members = w.state.buildings.filter((b) => isLiquidMember(w, b));
  const sets = new Sets();
  for (const b of members) for (const a of axes(w, b)) sets.add(`${b.id}:${a}`);
  for (const b of members) connect(w, sets, b);
  const graph: LiquidGraph = { nets: [], netOf: new Map(), touching: new Map() };
  const byRoot = new Map<string, number>();
  for (const key of sets.keys()) {
    const root = sets.find(key);
    let i = byRoot.get(root);
    if (i === undefined) {
      i = graph.nets.length;
      byRoot.set(root, i);
      graph.nets.push({ liquid: -1, amount: 0, capacity: 0, members: [] });
    }
    graph.netOf.set(key, i);
  }
  for (const b of members) gather(w, graph, b);
  w.cache.liquid = graph;
  return graph;
}

/** Adds a member's capacity and saved contents to its network(s); a junction splits over its two axes. */
function gather(w: World, graph: LiquidGraph, b: Building): void {
  const parts = axes(w, b);
  for (const a of parts) {
    const net = graph.nets[graph.netOf.get(`${b.id}:${a}`)!]!;
    net.members.push(b);
    net.capacity += (w.def(b).liquid?.capacity ?? 0) / parts.length;
    if (b.liquidId < 0 || b.liquid <= 0) continue;
    if (net.liquid < 0) net.liquid = b.liquidId;
    if (net.liquid === b.liquidId) net.amount += b.liquid / parts.length;
  }
}

/** Networks a (non-member) building touches through members that open towards it. */
function touching(w: World, b: Building): number[] {
  const g = liquidGraph(w);
  const hit = g.touching.get(b.id);
  if (hit) return hit;
  const out: number[] = [];
  for (const n of w.neighbours(b)) {
    if (!isLiquidMember(w, n)) continue;
    const d = sideOf(w.rect(n), w.rect(b));
    if (!opens(w, n, d)) continue;
    const i = g.netOf.get(nodeKey(w, n, d));
    if (i !== undefined && !out.includes(i)) out.push(i);
  }
  g.touching.set(b.id, out);
  return out;
}

/** The network a member belongs to (axis 0). */
export function netOfMember(w: World, b: Building): LiquidNet | undefined {
  const g = liquidGraph(w);
  const i = g.netOf.get(`${b.id}:0`);
  return i === undefined ? undefined : g.nets[i];
}

/** Takes up to `amount` of `liquid` from the networks next to `b`; returns what it got. */
export function drawLiquid(w: World, b: Building, liquid: number, amount: number): number {
  const g = liquidGraph(w);
  let got = 0;
  for (const i of touching(w, b)) {
    const net = g.nets[i]!;
    if (net.liquid !== liquid) continue;
    const take = Math.min(net.amount, amount - got);
    net.amount -= take;
    got += take;
    if (got >= amount) break;
  }
  return got;
}

/** Puts up to `amount` into one network (empty or same liquid); returns what fit. */
export function fillNet(net: LiquidNet, liquid: number, amount: number): number {
  if (net.liquid >= 0 && net.liquid !== liquid && net.amount > 1e-6) return 0;
  const fit = Math.min(amount, net.capacity - net.amount);
  if (fit <= 0) return 0;
  net.liquid = liquid;
  net.amount += fit;
  return fit;
}

/** Pushes up to `amount` into the networks next to `b`; returns what fit. */
export function pushLiquid(w: World, b: Building, liquid: number, amount: number): number {
  const g = liquidGraph(w);
  let put = 0;
  for (const i of touching(w, b)) {
    put += fillNet(g.nets[i]!, liquid, amount - put);
    if (put >= amount) break;
  }
  return put;
}

/** Writes each network's amount back into its members (by capacity), so saves and graph rebuilds keep it. */
export function settleLiquids(w: World): void {
  for (const net of liquidGraph(w).nets) {
    const share = net.capacity > 0 ? net.amount / net.capacity : 0;
    for (const b of net.members) {
      b.liquid = share * (w.def(b).liquid?.capacity ?? 0);
      b.liquidId = net.amount > 1e-6 ? net.liquid : -1;
    }
    if (net.amount <= 1e-6) net.liquid = -1;
  }
}
