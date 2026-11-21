import { DX, DY, gapBetween } from '../grid';
import { offer } from '../items';
import type { Building } from '../state';
import { heldBy, isCoreStock, takeFrom } from '../storage';
import type { World } from '../world';
import { noteHop } from './transit';
import type { BlockBehaviour, TickContext } from './types';

/** Items waiting in a bridge or mass driver (queue 0, flat item indices). */
function held(b: Building): number[] {
  b.queue[0] ??= [];
  return b.queue[0];
}

/** The partner a bridge or driver sends to, when it still stands, is finished and is in range. */
export function partnerOf(w: World, b: Building): Building | undefined {
  if (b.link < 0) return undefined;
  const p = w.byId.get(b.link);
  if (!p || !w.ready(p) || w.def(p).behaviour !== w.def(b).behaviour) return undefined;
  return gapBetween(w.rect(b), w.rect(p)) <= (w.def(b).bridge?.range ?? 0) ? p : undefined;
}

/** Buildings whose link points at `b` (its sources): an end bridge never hands items back to them. */
function feedsInto(w: World, n: Building, b: Building): boolean {
  return n.link === b.id && w.def(n).behaviour === w.def(b).behaviour;
}

function dumpFront(w: World, b: Building): void {
  const q = held(b);
  if (!q.length) return;
  const ns = w.neighbours(b);
  for (let i = 0; i < ns.length; i++) {
    const n = ns[(b.rr + i) % ns.length]!;
    if (feedsInto(w, n, b) || !offer(w, b, n, q[0]!)) continue;
    b.rr = (b.rr + i + 1) % ns.length;
    q.shift();
    return;
  }
}

/** Moves up to `n` items from `b` into its partner while the partner has room; `seen` logs each hop for the picture. */
function send(w: World, b: Building, p: Building, n: number, seen = false): number {
  const from = held(b);
  const to = held(p);
  const cap = w.def(p).items ?? 10;
  let moved = 0;
  while (moved < n && from.length && to.length < cap) {
    const item = from.shift()!;
    to.push(item);
    if (seen) noteHop(b, 1, w.state.tick, item, 0, 0);
    moved++;
  }
  return moved;
}

const takesItems: BlockBehaviour['accept'] = (w, b, _item, source) => !feedsInto(w, b, source) && held(b).length < (w.def(b).items ?? 10);
const keepItem: BlockBehaviour['handle'] = (_w, b, item) => {
  held(b).push(item);
};

/** Bridge conveyor: jumps items to its partner over up to `bridge.range` tiles; the last one hands them on. */
export const bridge: BlockBehaviour = {
  accept: takesItems,
  handle: keepItem,
  update: (w, b, ctx) => {
    const p = partnerOf(w, b);
    if (!p) return dumpFront(w, b);
    b.work = Math.min(b.work + (w.def(b).bridge?.rate ?? 10) * ctx.dt, 2);
    const moved = send(w, b, p, Math.floor(b.work), true);
    b.work -= moved;
  },
  built: (w, b) => autoLinkInLine(w, b),
};

/** Mass driver: shoots batches of up to 10 items to its partner far away; needs power. */
export const massDriver: BlockBehaviour = {
  accept: takesItems,
  handle: keepItem,
  update: (w, b, ctx) => driverUpdate(w, b, ctx),
  wantsPower: (_w, b) => held(b).length > 0,
  built: (w, b) => autoLinkLatest(w, b),
};

const BATCH = 10;

function driverUpdate(w: World, b: Building, ctx: TickContext): void {
  const p = partnerOf(w, b);
  if (!p) return dumpFront(w, b);
  const rate = w.def(b).bridge?.rate ?? 20;
  b.work = Math.min(1, b.work + (rate / BATCH) * ctx.dt * ctx.power(b));
  if (b.work < 1 || held(b).length < Math.min(BATCH, w.def(b).items ?? BATCH)) return;
  const n = send(w, b, p, BATCH);
  if (n <= 0) return;
  b.work = 0;
  ctx.events.push({ type: 'shot', from: b.id, to: p.id, n });
}

/** The nearest finished building of `b`'s kind along its rotation (`sign` 1 ahead, -1 behind), within range. */
function alongLine(w: World, b: Building, sign: number): Building | undefined {
  const range = w.def(b).bridge?.range ?? 0;
  for (let i = 1; i <= range; i++) {
    const o = w.at(b.x + DX[b.rot]! * i * sign, b.y + DY[b.rot]! * i * sign);
    if (o && o.kind === b.kind && w.ready(o)) return o;
  }
  return undefined;
}

/**
 * Links a new bridge (item or conduit) into a line: the nearest bridge of the same kind behind it that faces
 * the same way and sends nowhere yet now sends to it, and it sends to the nearest one ahead.
 */
export function autoLinkInLine(w: World, b: Building): void {
  const back = alongLine(w, b, -1);
  if (back && back.rot === b.rot && back.link < 0) back.link = b.id;
  const ahead = alongLine(w, b, 1);
  if (ahead) b.link = ahead.id;
  w.touch();
}

/** A new mass driver: the most recent unlinked driver in range now shoots to it. */
function autoLinkLatest(w: World, b: Building): void {
  const range = w.def(b).bridge?.range ?? 0;
  const free = w.state.buildings.filter((o) => o !== b && o.kind === b.kind && o.link < 0 && w.ready(o) && gapBetween(w.rect(o), w.rect(b)) <= range);
  const best = free.reduce<Building | undefined>((a, o) => (!a || o.id > a.id ? o : a), undefined);
  if (best) best.link = b.id;
}

/** Unloader: takes its item (or any, round-robin) out of a neighbouring core/container and hands it on. */
export const unloader: BlockBehaviour = {
  update: (w, b, ctx) => {
    b.work = Math.min(b.work + (w.def(b).throughput ?? 10) * ctx.dt, 2);
    while (b.work >= 1 && unloadOne(w, b)) b.work -= 1;
  },
};

function isStore(w: World, n: Building): boolean {
  const beh = w.def(n).behaviour;
  return (beh === 'core' || beh === 'storage') && w.ready(n);
}

function unloadOne(w: World, b: Building): boolean {
  const ns = w.neighbours(b);
  const source = ns.find((n) => isStore(w, n));
  if (!source) return false;
  const item = pickItem(w, b, source);
  if (item < 0) return false;
  for (let i = 0; i < ns.length; i++) {
    const n = ns[(b.rr + i) % ns.length]!;
    if (isStore(w, n) && (isCoreStock(w, n) || n === source)) continue;
    if (!offer(w, b, n, item)) continue;
    takeFrom(w, source, item);
    b.rr = (b.rr + i + 1) % ns.length;
    return true;
  }
  return false;
}

/** The configured item, or the next material (after the last one) the source holds. */
function pickItem(w: World, b: Building, source: Building): number {
  if (b.config >= 0) return heldBy(w, source, b.config) > 0 ? b.config : -1;
  const n = w.content.materials.list.length;
  for (let i = 1; i <= n; i++) {
    const item = (b.queue[1]?.[0] ?? -1) + i;
    const m = ((item % n) + n) % n;
    if (heldBy(w, source, m) > 0) {
      b.queue[1] = [m];
      return m;
    }
  }
  return -1;
}

