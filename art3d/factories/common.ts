import type { Object3D } from 'three';
import { content as v2 } from '../../src/content';
import { at, bevelBox, group, Kit, LOOP_FPS, MAT, plan, plate, sprite, workLoop } from '../kit';

/**
 * Shared helpers of the factory and mega models (v2): the square pad, the footprint lookup and `machine`, which
 * registers a building's base sprite plus its work-animation frames.
 *
 * Sprite convention (shared with the world renderer):
 * - `building-<id>` is the idle picture (also what the game draws while the machine is off or out of power);
 * - the work loop of kit/loop.ts while the machine runs: `building-<id>-wb` (the machine without its moving parts,
 *   drawn still) and `building-<id>-w0 .. w<n-1>`, overlays of what moves, played at LOOP_FPS (12 frames = one
 *   second). Every frame carries the same meta (lights, vents, goods, wire) as the base.
 */

/** Frames of a factory's work loop (one second at LOOP_FPS). */
export const LOOP = 12;

/** Tiles per side of a building, from the content when it exists there yet, else the planned size. */
export function sizeOf(id: string, fallback: number): number {
  const def = v2.buildings.list.find((b) => b.id === id);
  return def ? def.size : fallback;
}

/** Position in a work loop. `t` runs 0..1 (excluded), `wave` is a smooth 0..1 breath, `turn` a full lap in radians. */
export interface Phase {
  /** Frame index, -1 for the idle base picture. */
  i: number;
  n: number;
  t: number;
  /** 0..1, smooth: sin over the loop; 0.5 when idle. */
  wave: number;
  /** Angle of a full lap over the loop (0 when idle). */
  lap: number;
  working: boolean;
}

const phaseOf = (i: number, n: number): Phase => {
  if (i < 0) return { i, n, t: 0, wave: 0.5, lap: 0, working: false };
  const t = i / n;
  return { i, n, t, wave: 0.5 - 0.5 * Math.cos(t * Math.PI * 2), lap: t * Math.PI * 2, working: true };
};

/** The square pad of a building: navy deck, a lighter inset and hazard stripes along the two edges you see. Top at 0.07. */
export function squarePad(n: number): Object3D {
  const w = n - 0.08;
  const deck = plate(w, w, 0.07, MAT.panel, 0.025);
  const inset = at(plate(w - 0.2, w - 0.2, 0.012, MAT.trim, 0.006), 0, 0.07, 0);
  const stripes: Object3D[] = [];
  const edge = w / 2 - 0.05;
  const count = Math.floor((w - 0.1) / 0.1);
  for (let i = 0; i < count; i++) {
    const t = -((count - 1) * 0.1) / 2 + i * 0.1;
    const mat = i % 2 === 0 ? MAT.hazard : MAT.deep;
    stripes.push(at(bevelBox(0.1, 0.012, 0.05, 0.004, mat, 1), t, 0.07, edge));
    stripes.push(at(bevelBox(0.05, 0.012, 0.1, 0.004, mat, 1), edge, 0.07, t));
  }
  return group(deck, inset, ...stripes);
}

export interface MachineSpec {
  id: string;
  /** Footprint the model was drawn for; a different size in the content scales the body to fit. */
  size: number;
  /** Work frames (0 = the machine does not move visibly). */
  frames: number;
  /** Builds the body standing on the pad (pad top is y = 0.07). `n` is the real footprint in tiles. */
  body: (k: Kit, f: Phase, n: number) => Object3D;
  /** Pad override (mega buildings use their own). */
  pad?: (n: number) => Object3D;
  samples?: number;
  exposure?: number;
}

function make(spec: MachineSpec, i: number, k: Kit): Object3D {
  const n = sizeOf(spec.id, spec.size);
  const scale = n / spec.size;
  const body = spec.body(k, phaseOf(i, spec.frames), n);
  if (scale !== 1) body.scale.setScalar(scale);
  return group((spec.pad ?? squarePad)(n), body);
}

/** Registers `building-<id>` and, when `frames > 0`, its work loop (`-wb`, `-w0..w<frames-1>`). */
export function machine(spec: MachineSpec): void {
  const base = `building-${spec.id}`;
  const common = { samples: spec.samples, exposure: spec.exposure };
  if (spec.frames > 0) {
    workLoop({ key: base, count: spec.frames, fps: LOOP_FPS, build: (k, i) => make(spec, i, k), idle: (k) => make(spec, -1, k) }, common, { idleSprite: true });
    return;
  }
  plan([base]);
  sprite({ id: base, ...common, build: (k) => make(spec, -1, k) });
}
