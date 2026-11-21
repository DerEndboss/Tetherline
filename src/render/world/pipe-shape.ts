import { DX, DY, opposite } from '../../sim/grid';
import { isLiquidMember, netOfMember } from '../../sim/liquids';
import type { Building, Dir } from '../../sim/state';
import type { World } from '../../sim/world';

/**
 * Which way a conduit tile is drawn. Pure maths (no Pixi): the atlas bake, the layer and the tests share it.
 * A pipe cell is described by its arms, the tile edges it opens to (east, south, west, north as bits 1, 2, 4, 8,
 * the same order as the headings), and drawn as one of eleven shapes: two straights, four bends (two neighbouring
 * arms), four tees (one arm missing) and a cross. Stubs (one arm or none) are drawn as the straight of their axis.
 */
export const ARM_E = 1;
export const ARM_S = 2;
export const ARM_W = 4;
export const ARM_N = 8;

/** The drawn shapes, as arm masks: the index is the atlas cell. */
export const PIPE_SHAPES: readonly number[] = [
  ARM_E | ARM_W,
  ARM_N | ARM_S,
  ARM_E | ARM_S,
  ARM_S | ARM_W,
  ARM_W | ARM_N,
  ARM_N | ARM_E,
  ARM_E | ARM_S | ARM_W,
  ARM_S | ARM_W | ARM_N,
  ARM_W | ARM_N | ARM_E,
  ARM_N | ARM_E | ARM_S,
  ARM_E | ARM_S | ARM_W | ARM_N,
];

const bitCount = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/** The atlas shape of a cell with `arms` heading `rot`: no arm or one arm is the straight of the axis. */
export function pipeShape(arms: number, rot: Dir): number {
  const m = arms & 15;
  const n = bitCount(m);
  if (n === 0) return PIPE_SHAPES.indexOf(rot & 1 ? ARM_N | ARM_S : ARM_E | ARM_W);
  if (n === 1) return PIPE_SHAPES.indexOf(m & (ARM_E | ARM_W) ? ARM_E | ARM_W : ARM_N | ARM_S);
  return PIPE_SHAPES.indexOf(m);
}

type Pt = readonly [number, number];

/** The lanes a shape runs along (grid points, tile centre = 0, 0, edges at +-0.5) and where its flow starts. */
export interface PipeGeometry {
  /** The lane through the cell: a straight edge to edge, or the quarter circle of a bend. */
  main: Pt[];
  /** Branches of a tee or cross: from an edge to the middle. */
  stubs: Pt[][];
  /** The arm the flow comes in from (it runs to the other end of `main`), so a pipe heading there flows reversed. */
  from: Dir;
  /** The tile edges the shape opens to. */
  arms: Dir[];
}

const edge = (d: number): Pt => [DX[d & 3]! * 0.5, DY[d & 3]! * 0.5];

/** A quarter circle around the inner corner, from the middle of the `side` edge to the middle of the `front` edge. */
export function arcPath(side: Dir, front: Dir, steps = 12): Pt[] {
  const [sx, sy] = edge(side);
  const [fx, fy] = edge(front);
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push([sx + fx - fx * Math.cos(a) - sx * Math.sin(a), sy + fy - fy * Math.cos(a) - sy * Math.sin(a)]);
  }
  return pts;
}

const armsOfMask = (m: number): Dir[] => ([0, 1, 2, 3] as Dir[]).filter((d) => m & (1 << d));

/** The first arm (clockwise) of a bend's two neighbouring arms. */
const bendStart = (m: number): Dir => (([0, 1, 2, 3] as Dir[]).find((d) => m === ((1 << d) | (1 << ((d + 1) & 3)))) ?? 0) as Dir;

/** The geometry of shape number `shape` (an index of PIPE_SHAPES). */
export function pipeGeometry(shape: number): PipeGeometry {
  const m = PIPE_SHAPES[shape] ?? ARM_E | ARM_W;
  const arms = armsOfMask(m);
  const n = arms.length;
  if (n === 2 && (m === (ARM_E | ARM_W) || m === (ARM_N | ARM_S))) {
    const from: Dir = m & ARM_E ? 2 : 3;
    return { main: [edge(from), edge(opposite(from))], stubs: [], from, arms };
  }
  if (n === 2) {
    const from = bendStart(m);
    return { main: arcPath(from, ((from + 1) & 3) as Dir), stubs: [], from, arms };
  }
  // tee or cross: the through lane runs west to east (or north to south for the tee that lacks east or west)
  const eastWest = (m & ARM_E) !== 0 && (m & ARM_W) !== 0;
  const from: Dir = eastWest ? 2 : 3;
  const through = eastWest ? ARM_E | ARM_W : ARM_N | ARM_S;
  const stubs = arms.filter((d) => !(through & (1 << d))).map((d): Pt[] => [edge(d), [0, 0]]);
  return { main: [edge(from), edge(opposite(from))], stubs, from, arms };
}

/** Whether a pipe heading `rot` drawn as `shape` flows against its canonical direction. */
export const flowReversed = (shape: number, rot: Dir): boolean => pipeGeometry(shape).from === rot;

/**
 * Whether conduit `b` and its neighbour `n` on side `d` are one pipe. Along its axis a conduit meets any liquid
 * member that opens towards it (a conduit only along its own axis); to the sides only a conduit that points into it
 * and shares its network: bends and tees show where the liquid networks really join, never where they do not.
 */
function joined(w: World, b: Building, n: Building, d: Dir): boolean {
  if (!isLiquidMember(w, n)) return false;
  const conduit = w.def(n).behaviour === 'conduit';
  if ((d & 1) === (b.rot & 1)) return !conduit || (n.rot & 1) === (d & 1);
  if (!conduit || n.rot !== opposite(d)) return false;
  const net = netOfMember(w, b);
  return net !== undefined && net === netOfMember(w, n);
}

/** The arms of conduit `b`: the sides on which it is joined to a neighbour. */
export function pipeArms(w: World, b: Building): number {
  let mask = 0;
  for (let d = 0; d < 4; d++) {
    const n = w.at(b.x + DX[d]!, b.y + DY[d]!);
    if (n && n !== b && joined(w, b, n, d as Dir)) mask |= 1 << d;
  }
  return mask;
}
