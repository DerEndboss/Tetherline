import { beltGap } from '../../sim/blocks/conveyor';
import { delayOf } from '../../sim/blocks/routing';
import { HOP_KEEP, HOP_STRIDE } from '../../sim/blocks/transit';
import { partnerOf } from '../../sim/blocks/transport';
import { BELT_LEN } from '../../sim/constants';
import { DX, DY, sideOf, type Rect as GridRect } from '../../sim/grid';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';
import { heightScale, tileInView, type Rect } from '../iso';
import { depthKey } from '../sprite-pool';

/**
 * The items inside junctions, routers, sorters, overflow gates and bridges (render-world). Belts draw their own
 * (belts-layer.ts); these blocks hold or pass items in other ways, and all of them used to vanish for a moment:
 *
 * - Junction: four queues of [item, ready tick]; an item glides across the tile in the time the sim keeps it
 *   (`delayOf`), items behind a blocked one keep a belt's gap and wait at the front edge.
 * - Router: one item; it slides from the side it came in on to the middle and sits there until a neighbour takes it,
 *   then (its log of exits) it slides on from the middle to the side it left by.
 * - Sorter and overflow gate pass an item in the tick it arrives, so the sim holds nothing. They keep a short log
 *   of passes (sim/blocks/transit.ts) and the item is drawn crossing the tile (edge, middle, edge) for PASS_TICKS.
 * - Bridge: items waiting in it sit on top of it (a little pile); each hop to the partner (the sender's log) is a
 *   flight over the span on a low arc, drawn for the span's length in ticks. Mass drivers have their own shot.
 *
 * Positions are a pure function of the sim state and the clock (`now` = tick + the fraction of the frame), so a
 * paused game stands still and 10x keeps pace. Items use the belt items' size and depth rule; no allocation per frame.
 */

/** Draws one item: its grid point, extra lift over the tile (world px, the view's height scale already in), size factor and sort key. */
export type Put = (item: number, gx: number, gy: number, lift: number, scale: number, z: number) => void;

/** The block kinds this draws (by behaviour). */
export const HUB_BEHAVIOURS: ReadonlySet<string> = new Set(['junction', 'router', 'sorter', 'overflow', 'bridge']);

/** Item height over the tile's top face: the same as on belts, so an item does not step at a seam. */
const LIFT = 10;
/** Extra height per item of a pile on a bridge. */
const PILE = 5;
const PILE_MAX = 3;
/** Ticks an item takes to cross a sorter or overflow gate (about a belt's pace). */
export const PASS_TICKS = 4;
/** Ticks an item takes from a router's middle to its edge. */
export const EXIT_TICKS = 2;
/** A flight takes this many ticks plus one per tile of span, never more than the log keeps. */
const FLIGHT_BASE = 2;
/** Height of a flight's arc over the span, per tile of span (iso px), and how much bigger the item looks at its top. */
const ARC = 3.5;
const ARC_MIN = 7;
const ARC_SIZE = 0.3;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How far along (0..1) the item that entered in `entered` is `now` (render time, ticks): it starts when the render
 * first shows the tick after the one that took it in, so it leaves the neighbour's edge exactly where the neighbour
 * drew it last, and it takes `span` ticks.
 */
export const progress = (now: number, entered: number, span: number): number => (now - entered - 1) / span;

export class HubItems {
  private view: Rect = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  private margin = 0;
  private readonly here: GridRect = { x: 0, y: 0, size: 1 };
  private readonly there: GridRect = { x: 0, y: 0, size: 1 };

  constructor(private readonly put: Put) {}

  /** The view this frame (world px) and the margin around it; blocks outside are skipped. */
  begin(view: Rect, margin: number): void {
    this.view = view;
    this.margin = margin;
  }

  private seen(x: number, y: number): boolean {
    return tileInView(x, y, this.view, this.margin);
  }

  /** One block's items at `now`; for any other behaviour it draws nothing. */
  draw(w: World, b: Building, behaviour: string, now: number): void {
    if (behaviour === 'bridge') return this.bridge(w, b, now);
    if (!this.seen(b.x, b.y)) return;
    if (behaviour === 'junction') this.junction(w, b, now);
    else if (behaviour === 'router') this.router(w, b, now);
    else if (behaviour === 'sorter' || behaviour === 'overflow') this.pass(b, now);
  }

  /** The sort key of items on a one-tile block: above its sprite and its work overlays, below the next row. */
  private tileDepth(b: Building): number {
    return depthKey(b.x, b.y) + 0.5;
  }

  private junction(w: World, b: Building, now: number): void {
    const delay = delayOf(w, b);
    const gap = beltGap(w) / BELT_LEN;
    const lift = LIFT * heightScale();
    const z = this.tileDepth(b);
    for (let d = 0; d < b.queue.length; d++) {
      const q = b.queue[d];
      if (!q?.length) continue;
      let room = 1;
      for (let i = 0; i < q.length; i += 2) {
        const u = Math.min(clamp01(progress(now, q[i + 1]! - delay, delay)), room);
        if (u < 0) break;
        room = u - gap;
        this.put(q[i]!, b.x + 0.5 + DX[d]! * (u - 0.5), b.y + 0.5 + DY[d]! * (u - 0.5), lift, 1, z);
      }
    }
  }

  private router(w: World, b: Building, now: number): void {
    const log = b.queue[1];
    if (log?.length) this.routerExits(b, log, now);
    const q = b.queue[0];
    if (q?.length) this.routerHeld(w, b, q, now);
  }

  /** Items that just left: from the middle to the edge of the side they went out by. */
  private routerExits(b: Building, log: readonly number[], now: number): void {
    const lift = LIFT * heightScale();
    const z = this.tileDepth(b);
    for (let i = 0; i < log.length; i += HOP_STRIDE) {
      const u = progress(now, log[i]!, EXIT_TICKS);
      if (u < 0 || u >= 1) continue;
      const d = log[i + 3]! & 3;
      this.put(log[i + 1]!, b.x + 0.5 + DX[d]! * 0.5 * u, b.y + 0.5 + DY[d]! * 0.5 * u, lift, 1, z);
    }
  }

  /** The item it holds: from the side it came in on to the middle, then it stays. */
  private routerHeld(w: World, b: Building, q: readonly number[], now: number): void {
    const delay = delayOf(w, b);
    const u = clamp01(progress(now, q[2]! - delay, delay));
    const src = w.byId.get(q[1]!);
    let gx = b.x + 0.5;
    let gy = b.y + 0.5;
    if (src && u < 1) {
      this.here.x = b.x;
      this.here.y = b.y;
      this.there.x = src.x;
      this.there.y = src.y;
      this.there.size = w.defs[src.kind]!.size;
      const side = sideOf(this.here, this.there);
      gx += DX[side]! * 0.5 * (1 - u);
      gy += DY[side]! * 0.5 * (1 - u);
    }
    this.put(q[0]!, gx, gy, LIFT * heightScale(), 1, this.tileDepth(b));
  }

  /** A sorter or overflow gate: the items that passed in the last ticks, edge in, middle, edge out. */
  private pass(b: Building, now: number): void {
    const log = b.queue[0];
    if (!log?.length) return;
    const lift = LIFT * heightScale();
    const z = this.tileDepth(b);
    for (let i = 0; i < log.length; i += HOP_STRIDE) {
      const u = progress(now, log[i]!, PASS_TICKS);
      if (u < 0 || u >= 1) continue;
      const d = u < 0.5 ? log[i + 2]! : log[i + 3]!;
      const k = u < 0.5 ? 0.5 - u : u - 0.5;
      this.put(log[i + 1]!, b.x + 0.5 + DX[d & 3]! * k, b.y + 0.5 + DY[d & 3]! * k, lift, 1, z);
    }
  }

  /** A bridge: its waiting items as a pile on top, its hops as flights to the partner. */
  private bridge(w: World, b: Building, now: number): void {
    const p = partnerOf(w, b);
    const here = this.seen(b.x, b.y);
    if (!here && !(p && this.seen(p.x, p.y))) return;
    if (here) this.pile(b);
    const log = b.queue[1];
    if (p && log?.length) this.flights(b, p, log, now);
  }

  private pile(b: Building): void {
    const held = b.queue[0];
    if (!held?.length) return;
    const z = this.tileDepth(b);
    const lift = LIFT * heightScale();
    const n = Math.min(PILE_MAX, held.length);
    for (let i = 0; i < n; i++) this.put(held[i]!, b.x + 0.5, b.y + 0.5, lift + i * PILE * heightScale(), 1, z + i * 0.01);
  }

  private flights(b: Building, p: Building, log: readonly number[], now: number): void {
    const span = Math.hypot(p.x - b.x, p.y - b.y);
    const ticks = Math.min(HOP_KEEP - 1, FLIGHT_BASE + span);
    const arc = Math.max(ARC_MIN, ARC * span) * heightScale();
    const lift = LIFT * heightScale();
    const z = Math.max(depthKey(b.x, b.y), depthKey(p.x, p.y)) + 0.5;
    for (let i = 0; i < log.length; i += HOP_STRIDE) {
      const u = progress(now, log[i]!, ticks);
      if (u < 0 || u >= 1) continue;
      const bump = 4 * u * (1 - u);
      this.put(log[i + 1]!, b.x + 0.5 + (p.x - b.x) * u, b.y + 0.5 + (p.y - b.y) * u, lift + arc * bump, 1 + ARC_SIZE * bump, z);
    }
  }
}
