import { Container, type Renderer, type Texture } from 'pixi.js';
import type { ContentRegistry } from '../../content/registry';
import type { PreviewGhost } from '../../game/interaction';
import { BELT_LEN, BELT_SLOTS, TICK_HZ } from '../../sim/constants';
import { beltGap, frontLimit, shownPos, sideDir, sideOffset } from '../../sim/blocks/conveyor';
import { DX, DY } from '../../sim/grid';
import type { Building, Dir } from '../../sim/state';
import type { World } from '../../sim/world';
import { hexToNumber } from '../art/color';
import type { Baked } from '../bake';
import type { Camera } from '../camera';
import { gridToWorld, heightScale, tileInView, worldX, worldY, type Rect } from '../iso';
import { depthKey, SpritePool } from '../sprite-pool';
import { beltCell, BeltArt, PHASES, TREADS } from './belt-art';
import { feedMask, feedMaskOf, nextPositions, pathPoint, worldProbe, type Probe, type TileProbe } from './belt-shape';
import { FILLS, flowCell, liquidCell, PipeArt } from './pipe-art';
import { flowReversed, pipeArms, pipeShape } from './pipe-shape';

/** Belt tiers tint the neutral art: the plain belt teal, then amber, then violet for faster ones. */
const TIER_TINTS = [0xa6efe6, 0xffd58c, 0xe3b0ff];
const HOLO = 0x7ff0e8;
const GHOST_BAD = 0xff7a6a;
/** Margin (world px) around the view where belts are still drawn. */
const MARGIN = 90;
/** Flow speed of the streaks in conduits, flow periods (half a tile) per second, on the sim clock. */
const FLOW = 1.1;
/** Item sprite width per tile width (the icon art has a glow margin; the visible item is about a third of a tile, Mindustry-like). */
const ITEM_SHARE = 0.62;
/**
 * Item sprite width per screen distance between two neighbouring items on a belt. The icon art is about 0.55 of its
 * sprite wide, so 2.0 lets the visible items only just touch on a full belt (items should at most lightly touch);
 * 2.5 made them overlap by about a third. Only the iso view needs it: its belts run diagonally, so a third of a
 * tile is just 0.19 tile widths on screen (top-down 0.33), and 0.62 of a tile width would pile the items up.
 */
const ITEM_PITCH = 2.0;
/** From this zoom in, two tread phases are blended so treads glide (far out one sprite per belt is enough). */
const BLEND_ZOOM = 0.45;
/** A belt whose front item stood this long (sim ticks) counts as clogged and its treads stop. */
const JAM_TICKS = TICK_HZ / 2;

/** Fill level 0..FILLS-1 of a conduit (0 = empty). */
function fillLevel(b: Building, capacity: number): number {
  const frac = b.liquidId >= 0 ? b.liquid / capacity : 0;
  if (frac < 0.02) return 0;
  return frac < 0.34 ? 1 : frac < 0.67 ? 2 : FILLS - 1;
}

const bakedOf = (t: Texture): Baked => ({ texture: t, ax: 0.5, ay: 0.5 });

/** A liquid's colour for the pipe: very dark liquids (oil) are lifted a little, so the pipe still reads. */
function pipeTint(color: number): number {
  const rgb = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const luma = (0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!) / 255;
  const k = Math.max(0, 0.25 - luma) * 2;
  const lift = (c: number): number => Math.round(c + (0x8a - c) * k);
  return (lift(rgb[0]!) << 16) | (lift(rgb[1]!) << 8) | lift(rgb[2]!);
}

/** A colour mixed `k` of the way to white. */
function mixWhite(color: number, k: number): number {
  const up = (c: number): number => Math.round(c + (255 - c) * k);
  return (up((color >> 16) & 255) << 16) | (up((color >> 8) & 255) << 8) | up(color & 255);
}

/** Index of flow streaks at `phase`: a pipe flowing against its canonical direction runs the phases backwards. */
const flowPhase = (phase: number, reversed: boolean): number => (reversed ? (PHASES - (phase % PHASES)) % PHASES : phase % PHASES);

/** World px between two neighbouring items on a full belt, along the belt axis that is shorter on screen. */
function itemPitch(slots: number): number {
  const along = (dx: number, dy: number): number => Math.hypot(worldX(dx / slots, dy / slots) - worldX(0, 0), worldY(dx / slots, dy / slots) - worldY(0, 0));
  return Math.min(along(1, 0), along(0, 1));
}

/**
 * Conveyors and conduits and what rides in them (render-world). Belts are ground sprites from an atlas of every
 * shape (straight, bends, merges) and heading with animated treads; items ride the exact path of their tile and
 * glide between sim ticks using the sim's own move rule; conduits are a glass tube with the liquid in it at its
 * fill level and flowing highlights. Ghosts of belts and conduits (queued plans and the cursor preview) are drawn
 * here too, with bends computed across the whole ghost line. Culled, pooled, no per-frame allocation (ghost
 * lines aside).
 */
/** Below this zoom only the front item of a belt is drawn (simpler far out). */
const FAR_ZOOM = 0.16;

export class BeltsLayer {
  /** Flat sprites under the depth-sorted objects. */
  readonly ground = new Container();
  private readonly beltPool: SpritePool;
  private readonly pipeBasePool: SpritePool;
  private readonly pipeLiquidPool: SpritePool;
  private readonly pipeFlowPool: SpritePool;
  private readonly pipeTopPool: SpritePool;
  private readonly ghostPool: SpritePool;
  private readonly items: SpritePool;
  private readonly art: BeltArt;
  private readonly pipeArt: PipeArt;
  private readonly belts: Baked[];
  private readonly pipeBase: Baked[];
  private readonly pipeLiquid: Baked[];
  private readonly pipeFlow: Baked[];
  private readonly pipeTop: Baked[];
  private readonly tints = new Map<number, number>();
  private readonly liquidColors: number[];
  /** The streaks of a liquid: its colour lightened, so they shine over the body. */
  private readonly streakColors: number[];
  /** Screen width of an item icon in world px (icons come in different texel sizes; each is normalised). */
  private readonly itemPx: number;
  private readonly masks = new Map<number, number>();
  private world: World | null = null;
  private layout = -1;
  private still = false;
  private readonly next = new Float32Array(BELT_SLOTS);
  /** Per belt: its front item's position and since which tick it stood there (for clogged belts). */
  private readonly jams = new Map<number, { front: number; since: number }>();
  /** The sim clock of the last frame (unchanged = paused). */
  private lastT = -1;
  private readonly at = { x: 0, y: 0 };
  private readonly ghostTiles = new Map<number, TileProbe>();
  private readonly probes: TileProbe[] = [];

  constructor(
    objects: Container,
    renderer: Renderer,
    bakeScale: number,
    content: ContentRegistry,
    private readonly itemSprite: (item: number) => Baked | undefined,
    tileWidth: number,
  ) {
    this.art = new BeltArt(renderer, bakeScale);
    this.pipeArt = new PipeArt(renderer, bakeScale);
    this.belts = this.art.belts.map(bakedOf);
    this.pipeBase = this.pipeArt.base.map(bakedOf);
    this.pipeLiquid = this.pipeArt.liquid.map(bakedOf);
    this.pipeFlow = this.pipeArt.flow.map(bakedOf);
    this.pipeTop = this.pipeArt.top.map(bakedOf);
    const layers = Array.from({ length: 6 }, () => new Container());
    this.ground.addChild(...layers);
    [this.beltPool, this.pipeBasePool, this.pipeLiquidPool, this.pipeFlowPool, this.pipeTopPool, this.ghostPool] = layers.map((l) => new SpritePool(l)) as [SpritePool, SpritePool, SpritePool, SpritePool, SpritePool, SpritePool];
    this.items = new SpritePool(objects);
    this.itemPx = Math.min(tileWidth * ITEM_SHARE, itemPitch(content.rules.beltSlots) * ITEM_PITCH);
    this.liquidColors = content.liquids.list.map((l) => pipeTint(hexToNumber(l.color)));
    this.streakColors = this.liquidColors.map((c) => mixWhite(c, 0.55));
    const conveyors = content.buildings.list.map((d, i) => ({ d, i })).filter((e) => e.d.behaviour === 'conveyor').sort((a, b) => (a.d.conveyor?.speed ?? 0) - (b.d.conveyor?.speed ?? 0));
    conveyors.forEach((e, rank) => this.tints.set(e.i, TIER_TINTS[Math.min(rank, TIER_TINTS.length - 1)]!));
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  update(w: World, camera: Camera, alpha: number, nowMs: number, preview: readonly PreviewGhost[]): void {
    if (w !== this.world || w.layout !== this.layout) {
      this.world = w;
      this.layout = w.layout;
      this.masks.clear();
      this.jams.clear();
    }
    const view = camera.viewRect();
    this.beltPool.begin();
    for (const pool of this.pipePools()) pool.begin();
    this.items.begin();
    // treads and liquid flow run on the sim clock: they stop with a pause and keep pace at 10x, like the items
    const t = (w.state.tick + alpha) / TICK_HZ;
    // blend only while the sim runs: a paused frame shows one crisp tread phase, not two faded ones
    const blend = camera.zoom >= BLEND_ZOOM && !this.still && t !== this.lastT;
    this.lastT = t;
    // far out an item is a few pixels: one per belt still shows the flow at a third of the cost
    const most = camera.zoom < FAR_ZOOM ? 1 : BELT_SLOTS;
    for (const b of w.state.buildings) this.line(w, b, view, t, alpha, blend, most);
    this.beltPool.end();
    for (const pool of this.pipePools()) pool.end();
    this.items.end();
    this.drawGhosts(w, preview, view);
  }

  private pipePools(): SpritePool[] {
    return [this.pipeBasePool, this.pipeLiquidPool, this.pipeFlowPool, this.pipeTopPool];
  }

  private maskOf(w: World, b: Building): number {
    let m = this.masks.get(b.id);
    if (m === undefined) {
      m = feedMaskOf(w, b);
      this.masks.set(b.id, m);
    }
    return m;
  }

  /** One belt (with its items) or conduit, when it is in view. */
  private line(w: World, b: Building, view: Rect, t: number, alpha: number, blend: boolean, most: number): void {
    const beh = w.def(b).behaviour;
    if ((beh !== 'conveyor' && beh !== 'conduit') || !tileInView(b.x, b.y, view, MARGIN)) return;
    if (beh === 'conduit') {
      this.pipe(w, b, t, blend);
      return;
    }
    this.belt(w, b, t, blend);
    if (b.slot >= 0) this.drawItems(w, b, alpha, most);
  }

  /** Tread position of a belt in phases (0..PHASES): its speed on the sim clock; 0 when still or clogged. */
  private treadFlow(w: World, b: Building, t: number): number {
    if (this.still || this.jammed(w, b)) return 0;
    const speed = (w.def(b).conveyor?.speed ?? 1) * w.state.bonus.belt;
    return ((t * speed * TREADS) % 1) * PHASES;
  }

  private belt(w: World, b: Building, t: number, blend: boolean): void {
    const flow = this.treadFlow(w, b, t);
    const phase = Math.floor(flow) % PHASES;
    const mask = this.maskOf(w, b);
    const c = gridToWorld(b.x + 0.5, b.y + 0.5);
    const site = b.build < 1 || b.removing;
    const tint = site ? HOLO : (this.tints.get(b.kind) ?? 0xffffff);
    const alpha = site ? 0.5 : 1;
    const s = this.beltPool.next(this.belts[beltCell(mask, b.rot, phase)]!, c.x, c.y);
    s.tint = tint;
    s.alpha = alpha;
    const frac = flow - Math.floor(flow);
    if (!blend || frac < 0.04) return;
    // the next tread step fades in over this one, so treads glide instead of stepping
    const n = this.beltPool.next(this.belts[beltCell(mask, b.rot, (phase + 1) % PHASES)]!, c.x, c.y);
    n.tint = tint;
    n.alpha = alpha * frac;
  }

  /**
   * A clogged belt stands still (Mindustry): items on it and its front item has not moved for half a second of
   * sim time. Kept per belt; cleared with the layout.
   */
  private jammed(w: World, b: Building): boolean {
    const n = b.slot >= 0 ? (w.state.belts.count[b.slot] ?? 0) : 0;
    if (n === 0) return false;
    const front = w.state.belts.pos[b.slot * BELT_SLOTS]!;
    const tick = w.state.tick;
    let j = this.jams.get(b.id);
    if (!j) {
      j = { front, since: tick };
      this.jams.set(b.id, j);
    }
    if (front !== j.front) {
      j.front = front;
      j.since = tick;
    }
    return tick - j.since >= JAM_TICKS;
  }

  private holo(alpha: number, s: { tint: number; alpha: number }): void {
    s.tint = HOLO;
    s.alpha = alpha;
  }

  /** The arms of a conduit (which tile edges it opens to), kept per conduit until the layout changes. */
  private armsOf(w: World, b: Building): number {
    let m = this.masks.get(b.id);
    if (m === undefined) {
      m = pipeArms(w, b);
      this.masks.set(b.id, m);
    }
    return m;
  }

  /** One conduit: shadow and shell, the liquid in it with its streaks, then the gloss and flanges over it. */
  private pipe(w: World, b: Building, t: number, blend: boolean): void {
    const site = b.build < 1 || b.removing;
    const shape = pipeShape(site ? 0 : this.armsOf(w, b), b.rot);
    const c = gridToWorld(b.x + 0.5, b.y + 0.5);
    const base = this.pipeBasePool.next(this.pipeBase[shape]!, c.x, c.y);
    const top = this.pipeTopPool.next(this.pipeTop[shape]!, c.x, c.y);
    if (site) {
      this.holo(0.5, base);
      this.holo(0.5, top);
      return;
    }
    const fill = fillLevel(b, w.def(b).liquid?.capacity ?? 1);
    if (fill === 0) return;
    this.pipeLiquidPool.next(this.pipeLiquid[liquidCell(shape, fill)]!, c.x, c.y).tint = this.liquidColors[b.liquidId] ?? 0x6fb6e0;
    this.flowStreaks(shape, b.rot, t, blend, c, this.streakColors[b.liquidId] ?? 0xcfe8f8);
  }

  /** The bright streaks of a pipe on the sim clock: the phase of this instant, the next one faded in over it. */
  private flowStreaks(shape: number, rot: Dir, t: number, blend: boolean, c: { x: number; y: number }, tint: number): void {
    const flow = this.still ? 0 : ((t * FLOW) % 1) * PHASES;
    const phase = Math.floor(flow);
    const reversed = flowReversed(shape, rot);
    this.pipeFlowPool.next(this.pipeFlow[flowCell(shape, flowPhase(phase, reversed))]!, c.x, c.y).tint = tint;
    const frac = flow - phase;
    if (!blend || frac < 0.04) return;
    const n = this.pipeFlowPool.next(this.pipeFlow[flowCell(shape, flowPhase(phase + 1, reversed))]!, c.x, c.y);
    n.tint = tint;
    n.alpha = frac;
  }

  /** Items of one belt: along the tile's path, between this tick's and the next tick's positions. */
  private drawItems(w: World, b: Building, alpha: number, most: number): void {
    const store = w.state.belts;
    const n = Math.min(most, store.count[b.slot] ?? 0);
    if (n === 0) return;
    const base = b.slot * BELT_SLOTS;
    const step = Math.round(((w.def(b).conveyor?.speed ?? 1) * w.state.bonus.belt * BELT_LEN) / TICK_HZ);
    nextPositions(store.pos, base, n, step, beltGap(w), frontLimit(w, w.facing(b, b.rot)), this.next);
    const mask = this.maskOf(w, b);
    const { at } = this;
    const lift = 10 * heightScale();
    for (let i = 0; i < n; i++) {
      const baked = this.itemSprite(store.item[base + i]!);
      if (!baked) continue;
      const p = store.pos[base + i]!;
      const from = store.from[base + i]!;
      const pos = shownPos(from, p + (this.next[i]! - p) * alpha);
      pathPoint(mask, b.rot, Math.min(1, Math.max(0, pos / BELT_LEN)), at);
      const side = sideOffset(from, pos);
      const d = sideDir(from, b.rot);
      const gx = b.x + 0.5 + at.x + DX[d]! * side;
      const gy = b.y + 0.5 + at.y + DY[d]! * side;
      const s = this.items.next(baked, worldX(gx, gy), worldY(gx, gy) - lift);
      s.scale.set(this.itemPx / baked.texture.orig.width);
      // by the item's own spot, so a nearer item covers the one behind it also inside a tile
      s.zIndex = depthKey(gx - 0.5, gy - 0.5) + 0.5;
    }
  }

  /* ---------- Ghosts ---------- */

  private probeAt(i: number): TileProbe {
    return (this.probes[i] ??= { belt: true, rot: 0 });
  }

  /** The probe over the world plus the ghost belts, so a dragged line bends at its corners. */
  private ghostProbe(w: World, base: Probe): Probe {
    const mw = w.state.map.w;
    return (x, y) => this.ghostTiles.get(y * mw + x) ?? base(x, y);
  }

  private drawGhosts(w: World, preview: readonly PreviewGhost[], view: Rect): void {
    this.ghostPool.begin();
    const mw = w.state.map.w;
    this.ghostTiles.clear();
    let used = 0;
    const note = (kind: number, x: number, y: number, rot: Dir): void => {
      if (w.defs[kind]!.behaviour !== 'conveyor') return;
      const p = this.probeAt(used++);
      p.rot = rot;
      this.ghostTiles.set(y * mw + x, p);
    };
    for (const p of w.state.plans) note(p.kind, p.x, p.y, p.rot);
    for (const p of preview) note(p.kind, p.x, p.y, p.rot);
    const probe = this.ghostProbe(w, worldProbe(w));
    for (const p of w.state.plans) this.ghostTile(w, p.kind, p.x, p.y, p.rot, 0.5, HOLO, probe, view);
    for (const p of preview) this.ghostTile(w, p.kind, p.x, p.y, p.rot, 0.7, p.ok ? HOLO : GHOST_BAD, probe, view);
    this.ghostPool.end();
  }

  private ghostTile(w: World, kind: number, x: number, y: number, rot: Dir, alpha: number, tint: number, probe: Probe, view: Rect): void {
    const beh = w.defs[kind]!.behaviour;
    if ((beh !== 'conveyor' && beh !== 'conduit') || !tileInView(x, y, view, MARGIN)) return;
    const c = gridToWorld(x + 0.5, y + 0.5);
    if (beh === 'conveyor') {
      this.ghostSprite(this.belts[beltCell(feedMask(probe, x, y, rot), rot, 0)]!, c, alpha, tint);
      return;
    }
    const shape = pipeShape(0, rot);
    this.ghostSprite(this.pipeBase[shape]!, c, alpha, tint);
    this.ghostSprite(this.pipeTop[shape]!, c, alpha, tint);
  }

  private ghostSprite(baked: Baked, c: { x: number; y: number }, alpha: number, tint: number): void {
    const s = this.ghostPool.next(baked, c.x, c.y);
    s.tint = tint;
    s.alpha = alpha;
  }

  destroy(): void {
    this.art.destroy();
    this.pipeArt.destroy();
  }
}
