import { hash2 } from '../art/rand';
import { DECO_PROPS, variantsOf, type PropKind } from './ids';

/**
 * The deco plan: purely visual cables between nearby
 * buildings, junction boxes where they branch, and small 1x1 props (racks, terminals, masts, transformers, lamps,
 * RAM, boards ...) on free tiles next to buildings, every prop wired into the network. Pure and deterministic:
 * the same base always gives the same plan, and the plan is made of CHUNKS.
 *
 * - **Local by construction.** `planChunk` reads only the tiles and buildings within HALO of its chunk and writes
 *   only what it owns: the props standing on its tiles and the cables of the building pairs whose lower building
 *   (by y, then x) stands in it. Two plans of one base are therefore equal chunk by chunk, and a change at a tile
 *   can only alter the chunks within HALO of it (tests: deco/plan.test.ts). `DecoPlanner` keeps the chunk plans,
 *   diffs a new input against the last one and recomputes just the affected chunks, a few milliseconds per frame.
 * - **Subtle, but there from the first building.** Small pieces (a hashed share of the eligible tiles, kept
 *   SPACING+1 apart) and every building of size 2 or more gets at least one prop of its own (its best-scoring ring
 *   tile, two for a big one: an "anchor"), so a base never looks bare; links go from each building to its nearest
 *   neighbour(s), every piece at most 1x1.
 * - **Nothing loose.** A prop whose cable cannot reach the network is not placed; every cable ends in a
 *   footprint, a prop or another cable. Props that the player removed (REMOVED tiles) keep their place in the
 *   spacing, so neighbours do not jump in, but are neither placed nor wired.
 * - **Even mix.** A prop's kind is a weighted hash pick over all kinds the art has, a building's own kinds only
 *   slightly preferred: no kind dominates.
 * - **Cables never cross belts, pipes or footprints.** Occupied tiles are walls to the router: a cable goes around
 *   or is left out (and with it a prop that had no other way in). They cross each other freely (routed per chunk,
 *   bundled only within a chunk); obstacles only hide a prop, they never move one.
 */

/** What a tile is to the deco. */
export const FREE = 0;
/** A building footprint, closed fog or off the map: nothing goes here. */
export const BLOCK = 1;
/** A belt or pipe: cables never cross it (they go around or are left out), props never stand on it. */
export const BELT = 2;
/** Rubble on the tile: cables may run under it, a prop waits until it is cleared. */
export const ROUGH = 3;
/** Kept free for the player (an ore deposit, a megastructure site): cables may cross, no props. */
export const KEEP = 4;
/** A prop stands here (set by the planner while it routes). */
const PROP = 5;
/** The player removed the prop or junction box that stood here: free for cables, nothing new (it still counts for spacing). */
export const REMOVED = 6;

export interface DecoBuilding {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Art kind from content (lander, mine, lab ...): which props suit it. */
  art: string;
  /** Takes part in the cable network (finished buildings; power nodes have their own lasers). */
  node: boolean;
}

export interface DecoInput {
  w: number;
  h: number;
  seed: number;
  /** One class per tile (FREE, BLOCK, BELT, ROUGH, KEEP, REMOVED), row by row. */
  cells: Uint8Array;
  buildings: readonly DecoBuilding[];
  /** Prop kinds whose art exists (the rest are never planned); default every kind. */
  kinds?: readonly PropKind[];
}

export interface GridPt {
  x: number;
  y: number;
}

export interface DecoProp {
  x: number;
  y: number;
  kind: PropKind;
  variant: number;
}

export interface DecoPlan {
  /** Cable runs as polylines in grid units (tile centres, ends just inside a building or prop). */
  runs: GridPt[][];
  /** Tiles of the junction boxes (where three or more cables meet on free ground). */
  junctions: GridPt[];
  props: DecoProp[];
}

/** What one chunk owns. */
export interface ChunkPlan extends DecoPlan {
  /** Hash of the content: equal plans have equal signatures. */
  sig: number;
}

/** Tiles per chunk side. */
export const CHUNK = 24;
/** Building pairs further apart than this (tiles between footprints) are not linked. */
export const MAX_LINK = 6;
/** Largest footprint (the schema's maximum). */
const MAX_SIZE = 6;
/** A chunk reads this far around itself: a link (<= MAX_LINK + size) whose partner picks its own links, and a route's margin. */
export const HALO = 2 * (MAX_LINK + MAX_SIZE) + 6;
/** Share of the pairs that get a second link from a building (a mesh, not a bare chain). */
const SECOND_LINK = 0.4;
/**
 * Share of the eligible tiles that become props besides the anchors (before spacing). Measured on the bot's
 * bases (docs/decisions.md): 0.013 left an early base with 2 or 3 props and a 60-building base with one or two.
 */
const DENSITY = 0.025;
/** Props are this many tiles (Chebyshev) apart at least, plus one. */
const SPACING = 3;
/** Props stand up to this many tiles from a building. */
const RING = 4;
/** Share of straight cable tiles that may carry a relay box, and their least distance to another box. */
const RELAY_SHARE = 0.08;
const RELAY_GAP = 5;
/** Share of the cable ends at a building that get a small service box on their last tile, and their least distance to another box. */
const END_SHARE = 0.35;
const END_GAP = 3;
/** How far a prop's cable may go to reach the network. */
const PROP_REACH = 5;
/** Route costs: entering a tile, a turn, kept tiles, an existing cable. */
const STEP = 1;
const TURN = 1.6;
const ON_KEEP = 2.5;
const ALONG_CABLE = 0.35;
/** How far a cable's end reaches from its last tile's centre: just inside a building, to a prop's middle. */
const STUB = 0.62;
const STUB_PROP = 0.92;
/** Bucket size of the building index. */
const BUCKET = 16;

const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

/** Which kinds suit which building (art kind): a mild preference, never a restriction. */
const SUITS: Record<string, readonly PropKind[]> = {
  lander: ['rack', 'terminal', 'antenna', 'dish'],
  lab: ['dish', 'antenna', 'terminal', 'motherboard'],
  generator: ['transformer', 'lamp'],
  solar: ['transformer', 'terminal'],
  mine: ['lamp', 'terminal', 'board'],
  smelter: ['transformer', 'rack', 'chip'],
  fabricator: ['rack', 'ram', 'chip', 'motherboard'],
  storage: ['terminal', 'ram', 'board'],
};
/** Weight of a kind a building suits, against 10 for the rest. */
const SUIT_WEIGHT = 16;
const BASE_WEIGHT = 10;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const unit = (h: number): number => h / 4294967296;
const chunkKey = (cx: number, cy: number): number => cy * 4096 + cx;
const bucketKey = (bx: number, by: number): number => by * 4096 + bx;
const byPosition = (a: { x: number; y: number }, b: { x: number; y: number }): number => a.y - b.y || a.x - b.x;

/* ---------- Shared work area ---------- */

/** Buildings by bucket, so a chunk finds the ones around it without scanning all. */
class Buckets {
  private readonly map = new Map<number, DecoBuilding[]>();

  constructor(buildings: readonly DecoBuilding[]) {
    for (const b of buildings) {
      const k = bucketKey(Math.floor(b.x / BUCKET), Math.floor(b.y / BUCKET));
      const list = this.map.get(k);
      if (list) list.push(b);
      else this.map.set(k, [b]);
    }
  }

  /** Buildings whose top-left tile lies in [x0, x1) x [y0, y1) (a bucket margin may add a few more), by position. */
  query(x0: number, y0: number, x1: number, y1: number): DecoBuilding[] {
    const out: DecoBuilding[] = [];
    for (let by = Math.floor(y0 / BUCKET); by <= Math.floor((y1 - 1) / BUCKET); by++) {
      for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor((x1 - 1) / BUCKET); bx++) {
        for (const b of this.map.get(bucketKey(bx, by)) ?? []) if (b.x >= x0 && b.x < x1 && b.y >= y0 && b.y < y1) out.push(b);
      }
    }
    return out.sort(byPosition);
  }
}

/** What every chunk of one input shares: the index, a work copy of the cells and the reusable scratch arrays. */
interface Ctx {
  input: DecoInput;
  index: Buckets;
  /** Work copy: props are marked into it while a chunk routes, then unmarked. */
  cells: Uint8Array;
  mask: Uint8Array;
  seen: Uint8Array;
  kinds: readonly PropKind[];
}

function makeCtx(input: DecoInput): Ctx {
  const n = input.w * input.h;
  return { input, index: new Buckets(input.buildings), cells: input.cells.slice(), mask: new Uint8Array(n), seen: new Uint8Array(n), kinds: input.kinds ?? DECO_PROPS.map((p) => p.kind) };
}

/* ---------- Chunk plans ---------- */

const EMPTY_SIG = 0;

function signature(plan: DecoPlan): number {
  let h = 17;
  const mix = (v: number): void => {
    h = (Math.imul(h, 31) + Math.round(v * 64)) | 0;
  };
  for (const r of plan.runs) {
    mix(r.length);
    for (const p of r) {
      mix(p.x);
      mix(p.y);
    }
  }
  for (const j of plan.junctions) mix(j.x * 7 + j.y);
  for (const p of plan.props) {
    mix(p.x * 13 + p.y);
    mix(p.variant + 1);
    h = (Math.imul(h, 31) + hash2(p.kind.length * 977 + p.kind.charCodeAt(0))) | 0;
  }
  return h;
}

/** The plan of chunk (cx, cy): a pure function of the input within HALO of it. */
export function planChunk(c: Ctx, cx: number, cy: number): ChunkPlan {
  const { w, h } = c.input;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(w, x0 + CHUNK);
  const y1 = Math.min(h, y0 + CHUNK);
  const near = c.index.query(x0 - HALO, y0 - HALO, x1 + HALO, y1 + HALO);
  if (!near.length) return { runs: [], junctions: [], props: [], sig: EMPTY_SIG };
  const win = { x0: Math.max(0, x0 - HALO), y0: Math.max(0, y0 - HALO), x1: Math.min(w, x1 + HALO), y1: Math.min(h, y1 + HALO) };
  const props = placeProps(c, near, win);
  for (const p of props) c.cells[p.y * w + p.x] = PROP;
  const net = new Net(c);
  const inChunk = (x: number, y: number): boolean => x >= x0 && x < x1 && y >= y0 && y < y1;
  linkBuildings(net, near, near.filter((b) => b.node && inChunk(b.x, b.y)), c.input.seed);
  const mine: DecoProp[] = [];
  for (const p of props) {
    if (!inChunk(p.x, p.y) || c.input.cells[p.y * w + p.x] === REMOVED) continue;
    if (wireProp(net, p, near)) mine.push(p);
  }
  const plan: DecoPlan = { runs: net.runs(), junctions: net.junctions(c.input.seed), props: mine };
  net.clear();
  for (const p of props) c.cells[p.y * w + p.x] = c.input.cells[p.y * w + p.x]!;
  return { ...plan, sig: signature(plan) };
}

/** The deco of a whole base: every chunk's plan together (tests, tools). */
export function planDeco(input: DecoInput): DecoPlan {
  const planner = new DecoPlanner();
  planner.setInput(input);
  planner.process(Infinity);
  const out: DecoPlan = { runs: [], junctions: [], props: [] };
  for (const key of [...planner.chunks.keys()].sort((a, b) => a - b)) {
    const p = planner.chunks.get(key)!;
    out.runs.push(...p.runs);
    out.junctions.push(...p.junctions);
    out.props.push(...p.props);
  }
  return out;
}

/** A change report of `DecoPlanner.process`: chunks whose plan is new or different (and which they were). */
export interface ChunkChange {
  key: number;
  cx: number;
  cy: number;
}

/**
 * Keeps the chunk plans of the current base. `setInput` diffs the new input against the last one and queues the
 * chunks within HALO of anything that changed; `process` recomputes them nearest to the focus first, within a time
 * budget, and reports the chunks whose plan really changed.
 */
export class DecoPlanner {
  readonly chunks = new Map<number, ChunkPlan>();
  private ctx: Ctx | null = null;
  private last: Uint8Array | null = null;
  private lastBuildings = new Map<number, number>();
  private readonly pending = new Set<number>();

  get queued(): number {
    return this.pending.size;
  }

  /** Forget everything (a new world). */
  reset(): void {
    this.chunks.clear();
    this.pending.clear();
    this.ctx = null;
    this.last = null;
    this.lastBuildings.clear();
  }

  setInput(input: DecoInput): void {
    const prev = this.ctx?.input;
    const same = prev && prev.w === input.w && prev.h === input.h && prev.seed === input.seed && sameKinds(prev.kinds, input.kinds);
    this.ctx = makeCtx(input);
    if (!same || !this.last) {
      this.reset();
      this.ctx = makeCtx(input);
      for (const b of input.buildings) this.dirty(b.x, b.y, b.x + b.w, b.y + b.h);
    } else {
      this.diffCells(input);
      this.diffBuildings(input);
    }
    this.last = input.cells.slice();
    this.lastBuildings = buildingSigs(input.buildings);
  }

  private diffCells(input: DecoInput): void {
    const last = this.last!;
    const { cells, w } = input;
    for (let t = 0; t < cells.length; t++) if (cells[t] !== last[t]) this.dirty(t % w, Math.floor(t / w), (t % w) + 1, Math.floor(t / w) + 1);
  }

  private diffBuildings(input: DecoInput): void {
    const now = buildingSigs(input.buildings);
    for (const b of input.buildings) {
      const k = b.y * 4096 + b.x;
      if (this.lastBuildings.get(k) !== now.get(k)) this.dirty(b.x, b.y, b.x + b.w, b.y + b.h);
    }
    for (const k of this.lastBuildings.keys()) if (!now.has(k)) this.dirty(k % 4096, Math.floor(k / 4096), (k % 4096) + MAX_SIZE, Math.floor(k / 4096) + MAX_SIZE);
  }

  /** Queues the chunks whose window touches the tile box. */
  private dirty(x0: number, y0: number, x1: number, y1: number): void {
    const { w, h } = this.ctx!.input;
    const cx0 = Math.max(0, Math.floor((x0 - HALO) / CHUNK));
    const cy0 = Math.max(0, Math.floor((y0 - HALO) / CHUNK));
    const cx1 = Math.min(Math.floor((w - 1) / CHUNK), Math.floor((x1 + HALO) / CHUNK));
    const cy1 = Math.min(Math.floor((h - 1) / CHUNK), Math.floor((y1 + HALO) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.pending.add(chunkKey(cx, cy));
  }

  /** The queued chunk keys, nearest to `focus` first (else by key). */
  private order(focus?: GridPt): number[] {
    const order = [...this.pending];
    if (!focus) return order.sort((a, b) => a - b);
    const fx = focus.x / CHUNK;
    const fy = focus.y / CHUNK;
    const dist = (k: number): number => Math.hypot((k % 4096) + 0.5 - fx, Math.floor(k / 4096) + 0.5 - fy);
    return order.sort((a, b) => dist(a) - dist(b) || a - b);
  }

  /** Recomputes queued chunks (nearest to `focus` first) for up to `budgetMs`; returns the ones that changed. */
  process(budgetMs: number, focus?: GridPt): ChunkChange[] {
    const ctx = this.ctx;
    const changed: ChunkChange[] = [];
    if (!ctx) return changed;
    const until = budgetMs === Infinity ? Infinity : performance.now() + budgetMs;
    for (const key of this.order(focus)) {
      const cx = key % 4096;
      const cy = Math.floor(key / 4096);
      if (this.store(key, planChunk(ctx, cx, cy))) changed.push({ key, cx, cy });
      if (performance.now() > until) break;
    }
    return changed;
  }

  /** Keeps a recomputed plan; whether it differs from what was there (an empty plan is not kept). */
  private store(key: number, plan: ChunkPlan): boolean {
    this.pending.delete(key);
    const old = this.chunks.get(key);
    if (plan.sig === EMPTY_SIG) this.chunks.delete(key);
    else this.chunks.set(key, plan);
    return (old?.sig ?? EMPTY_SIG) !== plan.sig;
  }
}

function sameKinds(a: readonly PropKind[] | undefined, b: readonly PropKind[] | undefined): boolean {
  return (a?.join() ?? '') === (b?.join() ?? '');
}

function buildingSigs(list: readonly DecoBuilding[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of list) m.set(b.y * 4096 + b.x, (b.w * 8 + b.h) * 4 + (b.node ? 1 : 0) + hash2(b.art.length * 31 + b.art.charCodeAt(0)) * 2);
  return m;
}

/* ---------- Props ---------- */

/** Tiles between a coordinate and a span (0 inside it). */
function gapOf(v: number, start: number, len: number): number {
  return v < start ? start - v : v >= start + len ? v - (start + len - 1) : 0;
}

/** Ring distance (1..RING) of each window tile to the nearest building, and that building's index in `near`. */
function ringsOf(near: readonly DecoBuilding[], r: { x0: number; y0: number; x1: number; y1: number }): { ring: Uint8Array; owner: Int32Array } {
  const rw = r.x1 - r.x0;
  const ring = new Uint8Array(rw * (r.y1 - r.y0));
  const owner = new Int32Array(ring.length).fill(-1);
  near.forEach((b, i) => {
    for (let y = Math.max(r.y0, b.y - RING); y < Math.min(r.y1, b.y + b.h + RING); y++) {
      for (let x = Math.max(r.x0, b.x - RING); x < Math.min(r.x1, b.x + b.w + RING); x++) {
        const d = Math.max(gapOf(x, b.x, b.w), gapOf(y, b.y, b.h));
        const t = (y - r.y0) * rw + (x - r.x0);
        if (d > 0 && (ring[t] === 0 || d < ring[t]!)) {
          ring[t] = d;
          owner[t] = i;
        }
      }
    }
  });
  return { ring, owner };
}

/** The kind of a prop on a tile next to building `art`: a weighted hash pick over every kind the art has. */
function pickKind(kinds: readonly PropKind[], art: string, h: number): PropKind {
  const suits = SUITS[art] ?? [];
  const weight = (k: PropKind): number => (suits.includes(k) ? SUIT_WEIGHT : BASE_WEIGHT);
  let total = 0;
  for (const k of kinds) total += weight(k);
  let at = h % total;
  for (const k of kinds) {
    at -= weight(k);
    if (at < 0) return k;
  }
  return kinds[0]!;
}

/** Smallest building (footprint side) that is dressed for sure, and the ring distance its anchors may stand at. */
const ANCHOR_SIZE = 2;
const ANCHOR_RING = 3;
/** An anchor's score is this much of its hash, so it wins every contest of spacing and always passes the density. */
const ANCHOR_SCALE = 0.02;

/** How many props a building gets for sure: one from 2x2, four from 3x3 (the core: one on each side), six from 5x5. */
const anchorsFor = (b: DecoBuilding): number => {
  const side = Math.min(b.w, b.h);
  return side < ANCHOR_SIZE ? 0 : side >= 5 ? 6 : side >= 3 ? 4 : 1;
};

/** A window of tiles: [x0, x1) x [y0, y1). */
interface Win {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Cand {
  t: number;
  x: number;
  y: number;
  h: number;
}

/** The ring tiles building `b` (index i in `near`) may put an anchor on, best hash first. */
function anchorCandidates(c: Ctx, b: DecoBuilding, i: number, r: Win, owner: Int32Array, ring: Uint8Array, hash: (t: number) => number): Cand[] {
  const { w } = c.input;
  const rw = r.x1 - r.x0;
  const cands: Cand[] = [];
  for (let y = Math.max(r.y0, b.y - ANCHOR_RING); y < Math.min(r.y1, b.y + b.h + ANCHOR_RING); y++) {
    for (let x = Math.max(r.x0, b.x - ANCHOR_RING); x < Math.min(r.x1, b.x + b.w + ANCHOR_RING); x++) {
      const l = (y - r.y0) * rw + (x - r.x0);
      const t = y * w + x;
      const cls = c.cells[t];
      // rubble counts too: the prop waits until it is cleared, and clearing it never moves a prop
      if (owner[l] === i && ring[l]! <= ANCHOR_RING && (cls === FREE || cls === ROUGH || cls === REMOVED)) cands.push({ t, x, y, h: hash(t) });
    }
  }
  return cands.sort((p, q) => p.h - q.h || p.t - q.t);
}

/**
 * The tiles that get a prop for sure ("anchors"): for each building its best-scoring ring tile within ANCHOR_RING
 * (free, rubble or removed: the same tiles that take part in the spacing), and for a big building more, each one
 * more than SPACING from the ones before. A pure function of the tiles around the building, so every chunk that
 * sees it agrees. Returns window tile indices (y * w + x).
 */
function anchorsOf(c: Ctx, near: readonly DecoBuilding[], r: Win, owner: Int32Array, ring: Uint8Array, hash: (t: number) => number): Set<number> {
  const out = new Set<number>();
  near.forEach((b, i) => {
    if (!anchorsFor(b)) return;
    const taken: Cand[] = [];
    for (const k of anchorCandidates(c, b, i, r, owner, ring, hash)) {
      if (taken.length >= anchorsFor(b)) break;
      if (taken.some((o) => Math.max(Math.abs(o.x - k.x), Math.abs(o.y - k.y)) <= SPACING)) continue;
      taken.push(k);
      out.add(k.t);
    }
  });
  return out;
}

/** Every prop in a window (the chunk's own and its neighbours', so cables route around all of them). */
function placeProps(c: Ctx, near: readonly DecoBuilding[], win: Win): DecoProp[] {
  const { w, h, seed } = c.input;
  const kinds = c.kinds.filter((k) => variantsOf(k) > 0);
  if (!kinds.length) return [];
  const r = { x0: Math.max(0, win.x0 - SPACING), y0: Math.max(0, win.y0 - SPACING), x1: Math.min(w, win.x1 + SPACING), y1: Math.min(h, win.y1 + SPACING) };
  const rw = r.x1 - r.x0;
  const { ring, owner } = ringsOf(near, r);
  const salt = hash2(seed, 0xdec0);
  const anchors = anchorsOf(c, near, r, owner, ring, (t) => unit(hash2(t, salt)));
  const score = (x: number, y: number): number => {
    if (x < r.x0 || y < r.y0 || x >= r.x1 || y >= r.y1) return 2;
    const t = y * w + x;
    const cls = c.cells[t];
    const ok = ring[(y - r.y0) * rw + (x - r.x0)]! > 0 && (cls === FREE || cls === ROUGH || cls === REMOVED);
    return ok ? unit(hash2(t, salt)) * (anchors.has(t) ? ANCHOR_SCALE : 1) : 2;
  };
  const props: DecoProp[] = [];
  for (let y = win.y0; y < win.y1; y++) {
    for (let x = win.x0; x < win.x1; x++) {
      const s = score(x, y);
      if (s >= DENSITY || c.cells[y * w + x] === ROUGH || !lowestAround(x, y, s, score)) continue;
      const t = y * w + x;
      const art = near[owner[(y - r.y0) * rw + (x - r.x0)]!]!.art;
      const hh = hash2(t, salt ^ 0x51ed);
      const kind = pickKind(kinds, art, hh);
      props.push({ x, y, kind, variant: (hh >>> 12) % variantsOf(kind) });
    }
  }
  return props;
}

/** No eligible tile within SPACING scores lower (ties: the earlier tile wins). */
function lowestAround(x: number, y: number, s: number, score: (x: number, y: number) => number): boolean {
  for (let yy = y - SPACING; yy <= y + SPACING; yy++) {
    for (let xx = x - SPACING; xx <= x + SPACING; xx++) {
      if (xx === x && yy === y) continue;
      const so = score(xx, yy);
      if (so < s || (so === s && (yy < y || (yy === y && xx < x)))) return false;
    }
  }
  return true;
}

/* ---------- Network ---------- */

/** Tiles between two footprints (0 when they touch or overlap). */
function rectGap(a: Rect, b: Rect): number {
  const gx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return gx + gy;
}

/** Who `a` wants a cable to: its nearest neighbour(s) that do not already touch it, within MAX_LINK. */
function picksOf(a: DecoBuilding, near: readonly DecoBuilding[], seed: number): DecoBuilding[] {
  const cands: { b: DecoBuilding; d: number }[] = [];
  for (const b of near) {
    if (b === a || !b.node) continue;
    const d = rectGap(a, b);
    if (d > 0 && d <= MAX_LINK) cands.push({ b, d });
  }
  cands.sort((p, q) => p.d - q.d || byPosition(p.b, q.b));
  const out = cands.slice(0, 1).map((e) => e.b);
  const second = cands[1];
  if (second && unit(hash2(a.y * 4096 + a.x, hash2(second.b.y * 4096 + second.b.x, hash2(seed, 0x10b5)))) < SECOND_LINK) out.push(second.b);
  return out;
}

/** The links this chunk lays: pairs wanted by either end whose lower building (y, then x) it owns. */
function linkBuildings(net: Net, near: readonly DecoBuilding[], owned: readonly DecoBuilding[], seed: number): void {
  const picks = new Map<DecoBuilding, DecoBuilding[]>();
  const of = (b: DecoBuilding): DecoBuilding[] => {
    let p = picks.get(b);
    if (!p) picks.set(b, (p = picksOf(b, near, seed)));
    return p;
  };
  for (const a of owned) {
    const mine = of(a);
    for (const b of near) {
      if (b === a || !b.node || byPosition(a, b) > 0 || rectGap(a, b) > MAX_LINK) continue;
      if (mine.includes(b) || of(b).includes(a)) net.route(a, b, 4);
    }
  }
}

/** A prop's cable to the nearest cable within reach, else to the building it stands by. Whether it got one. */
function wireProp(net: Net, p: DecoProp, near: readonly DecoBuilding[]): boolean {
  const self = { x: p.x, y: p.y, w: 1, h: 1 };
  if (net.route(self, null, PROP_REACH)) return true;
  let best: DecoBuilding | undefined;
  let bestD = Infinity;
  for (const b of near) {
    const d = rectGap(self, b);
    if (b.node && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best !== undefined && bestD <= PROP_REACH && net.route(self, best, 2);
}

/** Bits of a tile's cable mask: links to the neighbour in direction d (0 +x, 1 +y, 2 -x, 3 -y). */
const bit = (d: number): number => 1 << d;
const popcount = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/** A binary min-heap of (cost, state) for the router; reused between routes. */
class Heap {
  private cost: number[] = [];
  private item: number[] = [];

  get size(): number {
    return this.item.length;
  }

  clear(): void {
    this.cost.length = 0;
    this.item.length = 0;
  }

  push(c: number, s: number): void {
    const { cost, item } = this;
    let i = item.length;
    cost.push(c);
    item.push(s);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cost[p]! <= c) break;
      cost[i] = cost[p]!;
      item[i] = item[p]!;
      i = p;
    }
    cost[i] = c;
    item[i] = s;
  }

  /** Cost of the top entry. */
  peek(): number {
    return this.cost[0]!;
  }

  pop(): number {
    const { cost, item } = this;
    const top = item[0]!;
    const lc = cost.pop()!;
    const li = item.pop()!;
    if (item.length) this.sift(lc, li);
    return top;
  }

  private sift(c: number, s: number): void {
    const { cost, item } = this;
    const n = item.length;
    let i = 0;
    for (;;) {
      let k = 2 * i + 1;
      if (k >= n) break;
      if (k + 1 < n && cost[k + 1]! < cost[k]!) k += 1;
      if (cost[k]! >= c) break;
      cost[i] = cost[k]!;
      item[i] = item[k]!;
      i = k;
    }
    cost[i] = c;
    item[i] = s;
  }
}

/** One search: a window of the map, best cost and back links per (tile, heading). */
interface Search {
  x0: number;
  y0: number;
  w: number;
  h: number;
  dist: Float64Array;
  prev: Int32Array;
}

/** The cable network on the tile grid: a 4-bit link mask per tile, built route by route. */
class Net {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint8Array;
  readonly mask: Uint8Array;
  private readonly seen: Uint8Array;
  private readonly heap = new Heap();
  /** Tiles with any link bit, in the order they got one (cleared afterwards, so the shared arrays stay empty). */
  private readonly touched: number[] = [];

  constructor(c: Ctx) {
    this.w = c.input.w;
    this.h = c.input.h;
    this.cells = c.cells;
    this.mask = c.mask;
    this.seen = c.seen;
  }

  /** Empties the shared arrays again. */
  clear(): void {
    for (const t of this.touched) {
      this.mask[t] = 0;
      this.seen[t] = 0;
    }
    this.touched.length = 0;
  }

  private setBit(t: number, b: number): void {
    if (!this.mask[t]) this.touched.push(t);
    this.mask[t]! |= b;
  }

  /** Cost to lay cable on a tile (Infinity: impossible). */
  private enter(t: number): number {
    const c = this.cells[t];
    if (c === BLOCK || c === PROP || c === BELT) return Infinity;
    if (this.mask[t]) return ALONG_CABLE;
    return c === KEEP ? ON_KEEP : STEP;
  }

  /**
   * Lays the cheapest cable from `from` to `to` (or, with `to` null, to any cable already laid) within a window
   * `margin` tiles around both. Returns whether a route was found.
   */
  route(from: Rect, to: Rect | null, margin: number): boolean {
    const box = windowOf(from, to ?? from, margin, this.w, this.h);
    const s = this.search(box, from, to);
    const end = this.cheapestEnd(s, to);
    if (end < 0) return false;
    this.commit(s, end, from, to);
    return true;
  }

  private search(box: Rect, from: Rect, to: Rect | null): Search {
    const n = box.w * box.h * 4;
    const s: Search = { x0: box.x, y0: box.y, w: box.w, h: box.h, dist: new Float64Array(n).fill(Infinity), prev: new Int32Array(n).fill(-1) };
    const heap = this.heap;
    heap.clear();
    for (const [x, y, d] of sideTiles(from)) {
      const i = this.localIndex(s, x, y);
      if (i < 0) continue;
      const cost = this.enter(y * this.w + x);
      if (cost < s.dist[i * 4 + d]!) {
        s.dist[i * 4 + d] = cost;
        heap.push(cost, i * 4 + d);
      }
    }
    this.relax(s, to);
    return s;
  }

  private localIndex(s: Search, x: number, y: number): number {
    const lx = x - s.x0;
    const ly = y - s.y0;
    return lx < 0 || ly < 0 || lx >= s.w || ly >= s.h ? -1 : ly * s.w + lx;
  }

  /** Dijkstra over (tile, heading): straight on, left or right, never back. Stops at the first goal reached. */
  private relax(s: Search, to: Rect | null): void {
    const heap = this.heap;
    while (heap.size) {
      const c = heap.peek();
      const st = heap.pop();
      if (c > s.dist[st]!) continue;
      const i = st >> 2;
      const d = st & 3;
      const x = (i % s.w) + s.x0;
      const y = Math.floor(i / s.w) + s.y0;
      if (to === null && this.mask[y * this.w + x]) return;
      for (const nd of [d, (d + 1) & 3, (d + 3) & 3]) this.step(s, st, c, x + DX[nd]!, y + DY[nd]!, nd, nd !== d);
    }
  }

  private step(s: Search, from: number, c: number, x: number, y: number, d: number, turned: boolean): void {
    const i = this.localIndex(s, x, y);
    if (i < 0) return;
    const cost = c + this.enter(y * this.w + x) + (turned ? TURN : 0);
    const k = i * 4 + d;
    if (cost >= s.dist[k]!) return;
    s.dist[k] = cost;
    s.prev[k] = from;
    this.heap.push(cost, k);
  }

  /** The reached goal state with the lowest cost, -1 when none. Entering a building sideways costs a turn. */
  private cheapestEnd(s: Search, to: Rect | null): number {
    let best = -1;
    let bestCost = Infinity;
    const ends = to ? sideTiles(to).map(([x, y, d]) => [x, y, (d + 2) & 3] as const) : this.netTiles(s);
    for (const [x, y, inward] of ends) {
      const i = this.localIndex(s, x, y);
      if (i < 0) continue;
      for (let d = 0; d < 4; d++) {
        const c = s.dist[i * 4 + d]! + (to && d !== inward ? TURN : 0);
        if (c < bestCost) {
          bestCost = c;
          best = i * 4 + d;
        }
      }
    }
    return best;
  }

  /** Every cable tile inside the window, as goals (any heading). */
  private netTiles(s: Search): (readonly [number, number, number])[] {
    const out: (readonly [number, number, number])[] = [];
    for (let y = s.y0; y < s.y0 + s.h; y++) for (let x = s.x0; x < s.x0 + s.w; x++) if (this.mask[y * this.w + x]) out.push([x, y, -1]);
    return out;
  }

  /** Writes the route into the masks: links between its tiles, and stubs into both ends' footprints. */
  private commit(s: Search, end: number, from: Rect, to: Rect | null): void {
    const tiles: number[] = [];
    for (let st = end; st >= 0; st = s.prev[st]!) tiles.push(st >> 2);
    tiles.reverse();
    const world = tiles.map((i) => (Math.floor(i / s.w) + s.y0) * this.w + (i % s.w) + s.x0);
    for (let k = 1; k < world.length; k++) this.link(world[k - 1]!, world[k]!);
    this.stub(world[0]!, from);
    if (to) this.stub(world[world.length - 1]!, to);
  }

  private link(a: number, b: number): void {
    const d = dirBetween(this.w, a, b);
    this.setBit(a, bit(d));
    this.setBit(b, bit((d + 2) & 3));
  }

  /** A link from a tile next to a footprint into it (the side it touches). */
  private stub(t: number, r: Rect): void {
    const x = t % this.w;
    const y = Math.floor(t / this.w);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx >= r.x && ny >= r.y && nx < r.x + r.w && ny < r.y + r.h) {
        this.setBit(t, bit(d));
        return;
      }
    }
  }

  /** Whether the tile in direction d is a cable tile linked back (else d is a stub into a footprint). */
  private linked(t: number, d: number): boolean {
    const n = t + DY[d]! * this.w + DX[d]!;
    const x = (t % this.w) + DX[d]!;
    return x >= 0 && x < this.w && n >= 0 && n < this.mask.length && (this.mask[n]! & bit((d + 2) & 3)) !== 0;
  }

  /**
   * Junction boxes: where three or more cables meet, and now and then on a long straight run (a relay node every
   * few tiles), always on free ground and never two within three tiles.
   */
  junctions(seed: number): GridPt[] {
    const out: GridPt[] = [];
    const salt = hash2(seed, 0x7e1a);
    const tiles = [...this.touched].sort((a, b) => a - b);
    const taken = (t: number, gap: number): boolean => out.some((p) => Math.max(Math.abs(p.x - (t % this.w)), Math.abs(p.y - Math.floor(t / this.w))) <= gap);
    // a box the player removed (REMOVED) still holds its place in the spacing, so no other relay jumps in beside it
    for (const pass of [0, 1, 2]) {
      for (const t of tiles) {
        if ((this.cells[t] !== FREE && this.cells[t] !== REMOVED) || !this.junctionAt(t, pass, salt) || (pass > 0 && taken(t, pass === 1 ? RELAY_GAP : END_GAP))) continue;
        out.push({ x: t % this.w, y: Math.floor(t / this.w) });
      }
    }
    return out.filter((p) => this.cells[p.y * this.w + p.x] !== REMOVED);
  }

  /** Pass 0: a branch; pass 1: a relay on a straight stretch between cable tiles; pass 2: a service box where a cable meets a building. */
  private junctionAt(t: number, pass: number, salt: number): boolean {
    const m = this.mask[t]!;
    if (pass === 0) return popcount(m) >= 3;
    return pass === 2 ? this.serviceBoxAt(t, salt) : this.relayAt(t, salt);
  }

  private relayAt(t: number, salt: number): boolean {
    const m = this.mask[t]!;
    const straight = m === 5 || m === 10;
    return straight && unit(hash2(t, salt)) < RELAY_SHARE && this.linked(t, m === 5 ? 0 : 1) && this.linked(t, m === 5 ? 2 : 3);
  }

  private serviceBoxAt(t: number, salt: number): boolean {
    return popcount(this.mask[t]!) <= 2 && this.entersBuilding(t) && unit(hash2(t, salt ^ 0xe4d)) < END_SHARE;
  }

  /** Whether a cable on this tile ends in a building's footprint (not in a prop). */
  private entersBuilding(t: number): boolean {
    for (let d = 0; d < 4; d++) {
      if (this.mask[t]! & bit(d) && !this.linked(t, d) && this.cells[t + DY[d]! * this.w + DX[d]!] === BLOCK) return true;
    }
    return false;
  }

  /** The masks as polylines between ends (stubs) and branch tiles; loops are cut where they start. */
  runs(): GridPt[][] {
    const seen = this.seen;
    const tiles = [...this.touched].sort((a, b) => a - b);
    const out: GridPt[][] = [];
    for (const pass of [0, 1, 2]) {
      for (const t of tiles) {
        const m = this.mask[t]!;
        for (let d = 0; d < 4; d++) {
          if (!(m & bit(d)) || seen[t]! & bit(d) || !this.startsRun(t, d, pass)) continue;
          out.push(this.walk(t, d, seen, pass === 0));
        }
      }
    }
    return out;
  }

  /** Pass 0: from a stub end; pass 1: from a branch or dead end; pass 2: anything left (loops). */
  private startsRun(t: number, d: number, pass: number): boolean {
    if (pass === 0) return !this.linked(t, d);
    if (pass === 1) return popcount(this.mask[t]!) !== 2;
    return true;
  }

  private centre(t: number): GridPt {
    return { x: (t % this.w) + 0.5, y: Math.floor(t / this.w) + 0.5 };
  }

  private stubEnd(t: number, d: number): GridPt {
    const c = this.centre(t);
    const into = this.cells[t + DY[d]! * this.w + DX[d]!] === PROP ? STUB_PROP : STUB;
    return { x: c.x + DX[d]! * into, y: c.y + DY[d]! * into };
  }

  /**
   * One polyline. From a stub (`fromStub`): starts inside the footprint, enters tile t, then leaves t the other
   * way. Otherwise starts at t's centre and leaves via d. Ends at a stub, a branch tile or where it started.
   */
  private walk(t: number, d: number, seen: Uint8Array, fromStub: boolean): GridPt[] {
    const pts: GridPt[] = [];
    seen[t]! |= bit(d);
    if (fromStub) {
      pts.push(this.stubEnd(t, d), this.centre(t));
      if (popcount(this.mask[t]!) !== 2) return pts;
      d = otherDir(this.mask[t]!, d);
    } else {
      pts.push(this.centre(t));
    }
    return this.follow(t, d, seen, pts);
  }

  private follow(t: number, d: number, seen: Uint8Array, pts: GridPt[]): GridPt[] {
    for (;;) {
      seen[t]! |= bit(d);
      if (!this.linked(t, d)) {
        pts.push(this.stubEnd(t, d));
        return pts;
      }
      const n = t + DY[d]! * this.w + DX[d]!;
      const back = (d + 2) & 3;
      if (seen[n]! & bit(back)) {
        pts.push(this.centre(n));
        return pts;
      }
      seen[n]! |= bit(back);
      pts.push(this.centre(n));
      if (popcount(this.mask[n]!) !== 2) return pts;
      t = n;
      d = otherDir(this.mask[n]!, back);
    }
  }
}

/** The other set bit of a two-bit mask. */
function otherDir(mask: number, d: number): number {
  for (let k = 0; k < 4; k++) if (k !== d && mask & bit(k)) return k;
  return d;
}

function dirBetween(w: number, a: number, b: number): number {
  const diff = b - a;
  if (diff === 1) return 0;
  if (diff === w) return 1;
  if (diff === -1) return 2;
  return 3;
}

/** Tiles touching a footprint's sides with the outward heading: [x, y, heading]. */
function sideTiles(r: Rect): (readonly [number, number, number])[] {
  const out: (readonly [number, number, number])[] = [];
  for (let i = 0; i < r.h; i++) out.push([r.x + r.w, r.y + i, 0], [r.x - 1, r.y + i, 2]);
  for (let i = 0; i < r.w; i++) out.push([r.x + i, r.y + r.h, 1], [r.x + i, r.y - 1, 3]);
  return out;
}

/** The search window: both footprints with a margin, clamped to the map. */
function windowOf(a: Rect, b: Rect, margin: number, w: number, h: number): Rect {
  const x0 = Math.max(0, Math.min(a.x, b.x) - margin);
  const y0 = Math.max(0, Math.min(a.y, b.y) - margin);
  const x1 = Math.min(w, Math.max(a.x + a.w, b.x + b.w) + margin);
  const y1 = Math.min(h, Math.max(a.y + a.h, b.y + b.h) + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * A run with rounded corners, sampled into `out` as flat [x, y, ...] grid coordinates: straight between
 * corners, a quadratic bend of `radius` tiles at each turn (affine, so it stays round in any projection).
 */
export function smoothRun(pts: readonly GridPt[], radius: number, out: number[]): number[] {
  out.length = 0;
  if (pts.length < 2) return out;
  out.push(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i++) bend(pts[i - 1]!, pts[i]!, pts[i + 1]!, radius, out);
  const last = pts[pts.length - 1]!;
  out.push(last.x, last.y);
  return out;
}

const BEND_STEPS = 6;

function bend(a: GridPt, b: GridPt, c: GridPt, radius: number, out: number[]): void {
  const ix = Math.sign(b.x - a.x);
  const iy = Math.sign(b.y - a.y);
  const ox = Math.sign(c.x - b.x);
  const oy = Math.sign(c.y - b.y);
  if (ix === ox && iy === oy) return;
  const r = Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
  const sx = b.x - ix * r;
  const sy = b.y - iy * r;
  const ex = b.x + ox * r;
  const ey = b.y + oy * r;
  for (let k = 0; k <= BEND_STEPS; k++) {
    const t = k / BEND_STEPS;
    const u = 1 - t;
    out.push(u * u * sx + 2 * u * t * b.x + t * t * ex, u * u * sy + 2 * u * t * b.y + t * t * ey);
  }
}
