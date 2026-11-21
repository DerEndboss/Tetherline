import type { Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, emissive, group, LOOP_FPS, loopIds, MAT, plate, rivets, sprite, workLoop, type Kit } from '../kit';
import { content } from '../../src/content';

/**
 * Shared bits of the v2 mining and power models (docs/art.md applies). A model is a function
 * `(k, n, frame) => Object3D` where `n` is the footprint size read from the content (so the art follows a size
 * change), `frame` 0 is the idle pose and frames 0..WORK_FRAMES-1 are one loop of the work animation.
 *
 * Sprite ids: `building-<id>` is the idle pose; animated machines add the work loop of kit/loop.ts: the still
 * base `building-<id>-wb` and the overlay frames `building-<id>-w0 .. w11`, played at LOOP_FPS while the machine
 * works. Rotating parts have at least 3 or 4-fold symmetry and turn whole symmetry steps over the loop, so the loop
 * closes without a jump.
 */

export const WORK_FRAMES = 12;

/** Teal strip (the player's light) shared by the pads. */
export const STRIP = emissive(COLORS.tech, 2.4);
export const AMBER = emissive('#ffb347', 2.2);
export const GREEN = emissive('#7dffa8', 2);

export const TAU = Math.PI * 2;

/** Footprint size of a building from the content, or the size this art was drawn for. */
export function sizeOf(id: string, fallback: number): number {
  return content.buildings.find(id)?.size ?? fallback;
}

/** Every sprite id a model registers (idle + loop). */
export function idsOf(ids: readonly string[], animated: boolean): string[] {
  return ids.flatMap((id) => [`building-${id}`, ...(animated ? loopIds(`building-${id}`, WORK_FRAMES) : [])]);
}

/** A smooth 0..1..0 wave over the loop (frame 0 -> 0, the middle frame -> 1); `shift` in frames. */
export const tri = (frame: number, shift = 0): number => {
  const t = ((((frame + shift) % WORK_FRAMES) + WORK_FRAMES) % WORK_FRAMES) / WORK_FRAMES;
  return 0.5 - 0.5 * Math.cos(t * TAU);
};

/** `n` is the footprint size from the content; models drawn for one fixed size ignore it and are scaled. */
export type Model = (k: Kit, frame: number, n: number) => Object3D;

/**
 * Registers a model for one or more ids (aliases share the picture) at the footprint the content gives it.
 * `animated` adds the work loop. `dflt` is the size the model was drawn for (and the fallback when the id is not in the
 * content yet): it is uniformly scaled when the content's size differs, unless `own` says the model lays
 * itself out for the size it is given (parameter `n`).
 */
export function register(ids: readonly string[], dflt: number, model: Model, animated = false, opts: { shadow?: number; own?: boolean } = {}): void {
  const { own, ...spriteOpts } = opts;
  for (const id of ids) {
    const n = sizeOf(id, dflt);
    const sid = `building-${id}`;
    const build = (k: Kit, frame: number): Object3D => {
      const m = model(k, frame, n);
      const s = own ? 1 : n / dflt;
      if (s !== 1) m.scale.setScalar(s);
      return m;
    };
    if (animated) workLoop({ key: sid, count: WORK_FRAMES, fps: LOOP_FPS, build }, spriteOpts, { idleSprite: true });
    else sprite({ id: sid, build: (k) => build(k, 0), ...spriteOpts });
  }
}

/**
 * The square base of a mining building: a navy plate `n` tiles wide, a slate inset, hazard stripes along the two
 * edges the camera sees and bolts in the corners. The top stays below 0.08 so belts and pipes meet it cleanly.
 */
export function basePlate(n: number): Object3D {
  const size = n - 0.08;
  const deck = plate(size, size, 0.07, MAT.panel, 0.025);
  const inset = at(plate(size - 0.2, size - 0.2, 0.012, MAT.trim, 0.006), 0, 0.07, 0);
  const parts: Object3D[] = [deck, inset];
  const bars = Math.max(5, Math.round((size - 0.2) / 0.1));
  const e = size / 2 - 0.06;
  for (let i = 0; i < bars; i++) {
    const t = -(size - 0.24) / 2 + (i + 0.5) * ((size - 0.24) / bars);
    const mat = i % 2 === 0 ? MAT.hazard : MAT.deep;
    parts.push(at(bevelBox(0.1, 0.012, 0.05, 0.004, mat, 1), t, 0.07, e));
    parts.push(at(bevelBox(0.05, 0.012, 0.1, 0.004, mat, 1), e, 0.07, t));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) parts.push(at(rivets(0, 1, 0.016, MAT.steel), x * (size / 2 - 0.045), 0.07, z * (size / 2 - 0.045)));
  return group(...parts);
}

/** A bolted steel foot plate (leg bases, post bases). */
export function foot(r = 0.05): Object3D {
  return cylinder(r, 0.022, MAT.gunmetal, 14, 0.006);
}

/** Adds an optional light mesh to a part list. */
export function lamp(k: Kit, x: number, y: number, z: number, color: string, opts: { r?: number; phase?: number; work?: boolean; size?: number } = {}): Object3D[] {
  const l = k.light(x, y, z, color, { r: 10, size: 0.022, ...opts });
  return l ? [l] : [];
}
