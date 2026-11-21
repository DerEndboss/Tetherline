import { ExtrudeGeometry, Mesh, Shape, Vector3, type Material, type Object3D } from 'three';
import { content as v2 } from '../../src/content';
import { at, bevelBox, group, turn } from './shapes';
import { Kit, plan, sprite, type SpriteSpec } from './registry';

/**
 * v2 building helpers (docs/art.md). A v2 building is `building-<content id>`; pieces that
 * face a direction add `-r0..3` (heading: 0 = +x, 1 = +y, 2 = -x, 3 = -y, like the sim's `rot`), belts and
 * conduits that bend add `-curve-l-r0..3` / `-curve-r-r0..3` (fed from the left / right side, seen along the
 * heading). Models are built heading +X (rot 0) and turned by `heading`. Bases are SQUARE and fill the whole
 * footprint, so neighbours touch without gaps; everything that carries items or liquid is open at the middle
 * of its edges (the ports of docs/art.md).
 */

/** Footprint edge length of a v2 building (tiles), from the content. */
export function sizeOf(id: string): number {
  return v2.buildings.get(id).size;
}

/** Heading of a model: turns a part built for rot 0 (+X) to `rot` (0 = +x, 1 = +z (grid y), 2 = -x, 3 = -z). */
export function heading<T extends Object3D>(o: T, rot: number): T {
  return turn(o, (-rot * Math.PI) / 2);
}

/** Sprite ids of a rotating piece: the plain id (rot 0) and `-r0..3`. */
export function rotIds(id: string): string[] {
  return [`building-${id}`, ...[0, 1, 2, 3].map((r) => `building-${id}-r${r}`)];
}

/** Sprite ids of the bends of a belt or conduit: fed from the left (`l`) or the right (`r`). */
export function curveIds(id: string): string[] {
  return (['l', 'r'] as const).flatMap((s) => [0, 1, 2, 3].map((r) => `building-${id}-curve-${s}-r${r}`));
}

/** Plans extra ids this category owns besides the ones the content gives it. */
export function planExtra(ids: readonly string[]): void {
  plan(ids);
}

type SpecRest = Partial<Omit<SpriteSpec, 'id' | 'build'>>;

/** Registers a non-rotating building sprite `building-<id>`. */
export function model(id: string, build: (k: Kit) => Object3D, rest: SpecRest = {}): void {
  sprite({ id: `building-${id}`, build, ...rest });
}

/** Registers `building-<id>` (rot 0) and `building-<id>-r0..3` from a model that takes the heading. */
export function rotating(id: string, build: (k: Kit, rot: number) => Object3D, rest: SpecRest = {}): void {
  sprite({ id: `building-${id}`, build: (k) => build(k, 0), ...rest });
  for (let r = 0; r < 4; r++) sprite({ id: `building-${id}-r${r}`, build: (k) => build(k, r), ...rest });
}

/** Registers the bends `building-<id>-curve-l|r-r0..3`; `build(k, side, rot)` with side 'l' or 'r'. */
export function bends(id: string, build: (k: Kit, side: 'l' | 'r', rot: number) => Object3D, rest: SpecRest = {}): void {
  for (const side of ['l', 'r'] as const) for (let r = 0; r < 4; r++) sprite({ id: `building-${id}-curve-${side}-r${r}`, build: (k) => build(k, side, r), ...rest });
}

/** A mesh that casts and receives shadows. */
function shadowed(geo: ConstructorParameters<typeof Mesh>[0], mat: Material): Mesh {
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A slice of a ring standing on y = 0 (a curved rail or lane): around the point (cx, cz), radii r0..r1, world
 * angles a0..a1 (atan2(z, x) in the XZ plane), `h` tall, with a small bevel. The curved belt and conduit parts.
 */
export function sector(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, h: number, mat: Material, bevel = 0.008): Mesh {
  const s = new Shape();
  // the shape lies in XY and is stood up by rotateX(-90deg): world z = -shape y, so negate the angles
  s.absarc(0, 0, r1, -a1, -a0, false);
  s.absarc(0, 0, r0, -a0, -a1, true);
  const depth = Math.max(0.001, h - bevel * 2);
  const geo = new ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 28 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, bevel, cz);
  return shadowed(geo, mat);
}

/** The square slab every v2 building stands on: fills `w` x `d` exactly (neighbours join), `h` tall, soft edge. */
export function slab(w: number, d: number, h: number, mat: Material, bevel = 0.012): Mesh {
  return bevelBox(w, h, d, Math.min(bevel, h * 0.45), mat, 2);
}

/** A flat bar between two points on the XZ plane (arrows, tread marks, braces), `y` its floor. */
export function bar(x0: number, z0: number, x1: number, z1: number, width: number, h: number, mat: Material, y = 0): Mesh {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const b = bevelBox(len, h, width, Math.min(h, width) * 0.35, mat, 1);
  const angle = Math.atan2(-(z1 - z0), x1 - x0);
  return at(turn(b, angle), (x0 + x1) / 2, y, (z0 + z1) / 2);
}

/** A chevron (">" pointing +X) centred at (x, z): `len` long arms, `spread` wide. */
export function chevron(x: number, z: number, len: number, spread: number, width: number, h: number, mat: Material, y = 0): Object3D {
  const tip = len / 2;
  return group(bar(x - tip, z + spread, x + tip, z, width, h, mat, y), bar(x - tip, z - spread, x + tip, z, width, h, mat, y));
}

/** A model point as a vector (readability in model files). */
export const v3 = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

/** World angle (atan2(z, x)) helpers for the quarter arcs of bends: entry from the left or right side. */
export function bendArc(side: 'l' | 'r'): { cx: number; cz: number; a0: number; a1: number } {
  // heading +X, exit at (0.5, 0); the entry is at the middle of the left (-z) or right (+z) edge
  return side === 'r' ? { cx: 0.5, cz: 0.5, a0: Math.PI, a1: (3 * Math.PI) / 2 } : { cx: 0.5, cz: -0.5, a0: Math.PI / 2, a1: Math.PI };
}
