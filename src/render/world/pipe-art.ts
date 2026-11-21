import { Graphics, type Renderer, type Texture } from 'pixi.js';
import { DX, DY } from '../../sim/grid';
import { atlas, bandPoly, cellSize, PHASES, sample, type Pt } from './belt-art';
import { PIPE_SHAPES, pipeGeometry, type PipeGeometry } from './pipe-shape';

/**
 * The flat ground art of conduits (render-world): a glass pipe in a metal shell, about half a tile wide, with a
 * flange ring at every tile edge, a shadow on the ground, a gloss streak on the glass and the liquid inside it at
 * its fill level with bright streaks that flow. Drawn once into four atlases (like the belts, with tile-local grid
 * maths projected by the view), one sprite each per conduit, bottom to top:
 *   base   the shadow, the shell and the empty channel         per shape
 *   liquid the liquid body, tinted per liquid                  per shape x fill level (low, half, full)
 *   flow   bright streaks sliding along the lanes, tinted      per shape x flow phase
 *   top    the gloss on the glass and the flanges              per shape
 * Shapes are those of pipe-shape.ts (straights, bends, tees, a cross), so a bend is one round pipe, not two stubs.
 */

/** Conduit fill levels with art: empty, low, half, full. */
export const FILLS = 4;

const COL = {
  shadow: 0x05070d,
  rim: 0x232b43,
  shell1: 0x3f4d75,
  shell2: 0x5a6a97,
  shell3: 0x7586b4,
  shell4: 0x95a7d3,
  rimLight: 0xdbe5ff,
  hollow: 0x141a2b,
  bodyDark: 0x6c7890,
  body: 0x9ba7bf,
  bodyLit: 0xe2eaf6,
  flange: 0x3b4666,
  flangeFace: 0x8493bb,
  white: 0xffffff,
};

/** Half widths in tiles: the shell is about half a tile wide, the channel inside it a third of that. */
const HALF = { shadow: 0.3, rim: 0.287, s1: 0.268, s2: 0.238, s3: 0.205, s4: 0.178, hollow: 0.165, flange: 0.305, flangeFace: 0.292 };
/** Where the shadow falls (grid shift, straight down on screen in the iso view) and where the light streaks sit. */
const SHADOW_AT = 0.085;
const LIGHT_AT = -0.075;
/** The share of the channel's width the liquid takes at each fill level (index = level). */
const LEVEL = [0, 0.46, 0.74, 1];
/** Flange ring length inside a tile (two neighbours make one ring twice this long). */
const FLANGE_LEN = 0.05;
/** Streak length and spacing along a lane, in tiles. */
const STREAK = 0.17;
const SPACING = 0.5;

/** Each point of a lane moved by the part of (dx, dy) that is across it, so a shift never slides along the lane. */
function pushed(path: readonly Pt[], dx: number, dy: number): Pt[] {
  const n = path.length;
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(n - 1, i + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const k = dx * nx + dy * ny;
    return [p[0] + nx * k, p[1] + ny * k] as Pt;
  });
}

const lanesOf = (geo: PipeGeometry): Pt[][] => [geo.main, ...geo.stubs];

/** One band along every lane, all of one colour so the lanes of a tee or cross join into one body. */
function bands(g: Graphics, geo: PipeGeometry, half: number, fill: { color: number; alpha?: number }, shift = 0): void {
  for (const lane of lanesOf(geo)) g.poly(bandPoly(shift === 0 ? lane : pushed(lane, shift, shift), half)).fill(fill);
}

/** The base cell: shadow, rim, shell, its lit side and the dark channel. */
function drawBase(g: Graphics, geo: PipeGeometry): void {
  bands(g, geo, HALF.shadow, { color: COL.shadow, alpha: 0.3 }, SHADOW_AT);
  bands(g, geo, HALF.rim, { color: COL.rim });
  bands(g, geo, HALF.s1, { color: COL.shell1 });
  bands(g, geo, HALF.s2, { color: COL.shell2 }, LIGHT_AT * 0.15);
  bands(g, geo, HALF.s3, { color: COL.shell3 }, LIGHT_AT * 0.3);
  bands(g, geo, HALF.s4, { color: COL.shell4 }, LIGHT_AT * 0.45);
  for (const lane of litLanes(geo)) g.poly(bandPoly(pushed(lane, -0.262, -0.262), 0.011)).fill({ color: COL.rimLight, alpha: 0.75 });
  bands(g, geo, HALF.hollow, { color: COL.hollow });
}

/** The liquid at fill `level` (1..3): it sits low in the channel, its surface a lighter band. */
function drawLiquid(g: Graphics, geo: PipeGeometry, level: number): void {
  const share = LEVEL[level] ?? 1;
  const low = (1 - share) * 0.05;
  bands(g, geo, HALF.hollow * share, { color: COL.bodyDark }, low);
  bands(g, geo, HALF.hollow * share * 0.82, { color: COL.body }, low + LIGHT_AT * 0.08);
  bands(g, geo, HALF.hollow * share * 0.42, { color: COL.bodyLit }, low + LIGHT_AT * 0.3);
}

/** The part of a lane between distances `a` and `b` along it, as grid points. */
function slice(lane: readonly Pt[], a: number, b: number): Pt[] {
  const o = { x: 0, y: 0 };
  const d = { x: 0, y: 0 };
  const pts: Pt[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    sample(lane, a + ((b - a) * i) / steps, o, d);
    pts.push([o.x, o.y]);
  }
  return pts;
}

function laneLength(lane: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < lane.length; i++) len += Math.hypot(lane[i]![0] - lane[i - 1]![0], lane[i]![1] - lane[i - 1]![1]);
  return len;
}

/** Bright streaks along every lane, shifted by `phase` of `PHASES` of their spacing (they run from the lane's start). */
function drawFlow(g: Graphics, geo: PipeGeometry, phase: number): void {
  for (const lane of lanesOf(geo)) {
    const len = laneLength(lane);
    for (let s = (phase / PHASES) * SPACING - SPACING; s < len; s += SPACING) {
      const a = Math.max(0, s);
      const b = Math.min(len, s + STREAK);
      if (b - a < 0.03) continue;
      g.poly(bandPoly(pushed(slice(lane, a, b), 0.012, 0.012), 0.042, 0)).fill({ color: COL.white, alpha: 0.85 });
    }
  }
}

/** The lanes light streaks run along: the main lane whole, the branches of a tee only up to the main lane's shell. */
function litLanes(geo: PipeGeometry): Pt[][] {
  return [geo.main, ...geo.stubs.map((s) => slice(s, 0, 0.21))];
}

/** Gloss on the glass over the channel: a long streak on the lit side and a faint one opposite. */
function drawGloss(g: Graphics, geo: PipeGeometry): void {
  for (const lane of litLanes(geo)) {
    g.poly(bandPoly(pushed(lane, LIGHT_AT, LIGHT_AT), 0.017, 0)).fill({ color: COL.white, alpha: 0.78 });
    g.poly(bandPoly(pushed(lane, -LIGHT_AT * 0.8, -LIGHT_AT * 0.8), 0.011, 0)).fill({ color: COL.white, alpha: 0.2 });
  }
}

/** A flange ring on the tile edge towards heading `d`: a dark ring with a lit face, the half that lies in this tile. */
function drawFlange(g: Graphics, d: number): void {
  const edge: Pt = [DX[d]! * 0.5, DY[d]! * 0.5];
  const inward = (len: number): Pt => [DX[d]! * (0.5 - len), DY[d]! * (0.5 - len)];
  g.poly(bandPoly([edge, inward(FLANGE_LEN)], HALF.flange, 0)).fill(COL.flange);
  g.poly(bandPoly([edge, inward(FLANGE_LEN * 0.55)], HALF.flangeFace, 0)).fill(COL.flangeFace);
}

/** The top cell: gloss first, then the flanges over its ends. */
function drawTop(g: Graphics, geo: PipeGeometry): void {
  drawGloss(g, geo);
  for (const d of geo.arms) drawFlange(g, d);
}

export class PipeArt {
  /** Shadow, shell and channel by shape. */
  readonly base: Texture[];
  /** The liquid body by `liquidCell`. */
  readonly liquid: Texture[];
  /** Flow streaks by `flowCell`. */
  readonly flow: Texture[];
  /** Gloss and flanges by shape. */
  readonly top: Texture[];

  constructor(renderer: Renderer, scale: number) {
    const { cw, ch } = cellSize();
    const s = Math.min(2, Math.max(1, scale * 0.6));
    const shapes = PIPE_SHAPES.length;
    const geos = PIPE_SHAPES.map((_m, i) => pipeGeometry(i));
    this.base = atlas(renderer, shapes, cw, ch, s, (g, i) => drawBase(g, geos[i]!));
    this.liquid = atlas(renderer, shapes * (FILLS - 1), cw, ch, s, (g, i) => drawLiquid(g, geos[Math.floor(i / (FILLS - 1))]!, (i % (FILLS - 1)) + 1));
    this.flow = atlas(renderer, shapes * PHASES, cw, ch, s, (g, i) => drawFlow(g, geos[Math.floor(i / PHASES)]!, i % PHASES));
    this.top = atlas(renderer, shapes, cw, ch, s, (g, i) => drawTop(g, geos[i]!));
  }

  destroy(): void {
    for (const t of [...this.base, ...this.liquid, ...this.flow, ...this.top]) t.destroy(false);
  }
}

/** Index of the liquid body of `shape` at fill level 1..FILLS-1. */
export const liquidCell = (shape: number, fill: number): number => shape * (FILLS - 1) + fill - 1;
/** Index of the flow streaks of `shape` at `phase`. */
export const flowCell = (shape: number, phase: number): number => shape * PHASES + phase;
