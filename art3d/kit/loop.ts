import { Box3, Group, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { Kit, plan, sprite, type SpriteSpec } from './registry';

/**
 * Work loops as overlays (docs/art.md, "Work loops"). A machine that moves while it works gets:
 * - `<id>`        the idle picture (the whole model, frame 0), drawn while it waits;
 * - `<id>-wb`     the work base: the model without the parts that move during the loop. Square pad, housing and
 *                 silhouette are in it, so they can never jump or rattle: the game keeps it still under the loop;
 * - `<id>-w<i>`   one frame of the loop as an OVERLAY on the work base: only the pixels that differ from it (the
 *                 moving parts, their shadows and glow), trimmed. The game draws base + overlay (objects.ts).
 *
 * Which parts move is found, not declared: every frame is built once and a mesh whose world transform,
 * geometry and material are the same in every frame belongs to the base. All sprites of a loop share one
 * bounding box (the union over its frames), so the light rig and shadow camera stand exactly the same for
 * each of them and the static pixels match bit for bit (the overlay only has to carry what really changes).
 */

export interface LoopRef {
  /** The idle sprite id (`building-<id>`); the loop's sprites are `<key>-wb` and `<key>-w<i>`. */
  key: string;
  count: number;
  /** Playback rate in frames per second (written into each frame's meta as `fps`). */
  fps: number;
  /** Frame `i` (0..count-1) of the loop: the whole model in that pose. */
  build: (k: Kit, i: number) => Object3D;
  /** The idle model, when it differs from frame 0 (counts into the shared bounds). */
  idle?: (k: Kit) => Object3D;
}

export interface LoopRole {
  ref: LoopRef;
  role: 'idle' | 'base' | 'frame';
}

/** Default playback rate of a work loop. */
export const LOOP_FPS = 12;

interface Analysis {
  bounds: Box3;
  /** Signature -> how many meshes with it every frame has (the still parts). */
  still: Map<string, number>;
}

const analyses = new WeakMap<LoopRef, Analysis>();

const r6 = (n: number): string => (Math.abs(n) < 5e-7 ? '0' : n.toFixed(6));

const geoSigs = new WeakMap<BufferGeometry, string>();

/** A cheap but thorough hash of a geometry's positions (and index), stable across rebuilds of the same part. */
function geometrySig(g: BufferGeometry): string {
  const hit = geoSigs.get(g);
  if (hit) return hit;
  const pos = g.getAttribute('position');
  let h = 2166136261;
  const arr = pos ? (pos.array as ArrayLike<number>) : [];
  for (let i = 0; i < arr.length; i++) {
    h ^= Math.round((arr[i] ?? 0) * 1e5);
    h = Math.imul(h, 16777619);
  }
  const idx = g.getIndex();
  const sig = `${g.type}:${arr.length}:${idx ? idx.count : 0}:${(h >>> 0).toString(36)}`;
  geoSigs.set(g, sig);
  return sig;
}

const matSigs = new WeakMap<Material, string>();

/** What a material looks like (shared palette materials and fresh copies with the same values match). */
function materialSig(m: Material): string {
  const hit = matSigs.get(m);
  if (hit) return hit;
  const x = m as Material & { color?: { getHexString(): string }; emissive?: { getHexString(): string }; emissiveIntensity?: number; roughness?: number; metalness?: number; clearcoat?: number };
  const sig = [m.type, x.color?.getHexString(), x.emissive?.getHexString(), x.emissiveIntensity, x.roughness, x.metalness, x.clearcoat, m.opacity, m.transparent, m.visible, m.side, m.userData.glow ? 1 : 0].join(',');
  matSigs.set(m, sig);
  return sig;
}

function meshSig(m: Mesh): string {
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  return `${geometrySig(m.geometry)}|${mats.map(materialSig).join('/')}|${m.matrixWorld.elements.map(r6).join(',')}|${m.castShadow ? 1 : 0}`;
}

/** Every visible mesh of a model with its signature (world transform, geometry, material). */
function meshesOf(root: Object3D): { mesh: Mesh; sig: string }[] {
  root.updateMatrixWorld(true);
  const out: { mesh: Mesh; sig: string }[] = [];
  root.traverseVisible((o) => {
    if (o instanceof Mesh) out.push({ mesh: o, sig: meshSig(o) });
  });
  return out;
}

function counts(list: { sig: string }[]): Map<string, number> {
  const c = new Map<string, number>();
  for (const { sig } of list) c.set(sig, (c.get(sig) ?? 0) + 1);
  return c;
}

function dispose(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
  });
}

function wrap(o: Object3D): Group {
  const g = new Group();
  g.add(o);
  return g;
}

/** Bounds and still parts of a loop (built once per loop). */
export function analyse(ref: LoopRef): Analysis {
  const hit = analyses.get(ref);
  if (hit) return hit;
  const bounds = new Box3();
  let still: Map<string, number> | null = null;
  for (let i = 0; i < ref.count; i++) {
    const root = wrap(ref.build(new Kit(), i));
    const list = meshesOf(root);
    bounds.union(new Box3().setFromObject(root, true));
    const c = counts(list);
    if (!still) still = c;
    else for (const [sig, n] of still) still.set(sig, Math.min(n, c.get(sig) ?? 0));
    dispose(root);
  }
  if (ref.idle) {
    const root = wrap(ref.idle(new Kit()));
    bounds.union(new Box3().setFromObject(root, true));
    dispose(root);
  }
  const out = { bounds, still: still ?? new Map<string, number>() };
  analyses.set(ref, out);
  return out;
}

/** Removes the parts that move during the loop from frame 0's model (the work base). Returns how many it removed. */
export function stripMoving(root: Object3D, ref: LoopRef): number {
  const budget = new Map(analyse(ref).still);
  let removed = 0;
  for (const { mesh, sig } of meshesOf(root)) {
    const left = budget.get(sig) ?? 0;
    if (left > 0) {
      budget.set(sig, left - 1);
      continue;
    }
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
    removed++;
  }
  root.updateMatrixWorld(true);
  return removed;
}

export const workBaseId = (key: string): string => `${key}-wb`;
export const workFrameId = (key: string, i: number): string => `${key}-w${i}`;

/** Every sprite id of a loop besides the idle one: the work base and the frames. */
export function loopIds(key: string, count: number): string[] {
  return [workBaseId(key), ...Array.from({ length: count }, (_, i) => workFrameId(key, i))];
}

type Rest = Partial<Omit<SpriteSpec, 'id' | 'build' | 'loop'>>;

/**
 * Registers a work loop: the work base `<key>-wb` and the overlay frames `<key>-w0..w<count-1>`, and (with
 * `idle`) the idle sprite `<key>` itself, all sharing one bounding box. Plans the ids it registers.
 */
export function workLoop(ref: LoopRef, rest: Rest = {}, opts: { idleSprite?: boolean } = {}): LoopRef {
  const ids = loopIds(ref.key, ref.count);
  plan(opts.idleSprite ? [ref.key, ...ids] : ids);
  if (opts.idleSprite) sprite({ ...rest, id: ref.key, build: ref.idle ?? ((k) => ref.build(k, 0)), loop: { ref, role: 'idle' } });
  sprite({ ...rest, id: workBaseId(ref.key), build: (k) => ref.build(k, 0), loop: { ref, role: 'base' } });
  for (let i = 0; i < ref.count; i++) sprite({ ...rest, id: workFrameId(ref.key, i), build: (k) => ref.build(k, i), loop: { ref, role: 'frame' } });
  return ref;
}

/* ---------- Loop maths for models ---------- */

/** Where frame `i` of `n` is in its loop: t in 0..1 (excluded). */
export const loopT = (i: number, n: number): number => (((i % n) + n) % n) / n;

/** A smooth 0..1..0 breath over the loop (cosine), shifted by `shift` (fraction of the loop). */
export const breathe = (i: number, n: number, shift = 0): number => 0.5 - 0.5 * Math.cos((loopT(i, n) + shift) * Math.PI * 2);

/**
 * A stamp: fast down, short hold, slower up (0 = up, 1 = down), shifted by `shift`. Reads as a press or hammer.
 */
export function stamp(i: number, n: number, shift = 0): number {
  const t = (loopT(i, n) + shift + 1) % 1;
  if (t < 0.25) return Math.sin((t / 0.25) * (Math.PI / 2));
  if (t < 0.4) return 1;
  return 0.5 + 0.5 * Math.cos(((t - 0.4) / 0.6) * Math.PI);
}
