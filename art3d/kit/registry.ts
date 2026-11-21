import { Mesh, SphereGeometry, Vector3, type Object3D } from 'three';
import { ART_CATEGORIES, type ArtCategory } from '../../src/render/art-manifest';
import { project, type ScreenPt } from './iso';
import { emissive } from './palette';
import type { LoopRole } from './loop';

/**
 * The model registry. Each category file (art3d/<category>/index.ts) calls `plan(ids)` with every sprite id
 * it owns and `sprite({...})` for each one that has a model. `npm run art -- --only <category>` renders the
 * models of that category; ids that are planned but have no model keep their SVG art in the game.
 */

export const CATEGORIES = ART_CATEGORIES;
export type Category = ArtCategory;

/** A pulsing light the game draws on top of the sprite (additive glow), like `SpriteLight` in svg.ts. */
export interface LightMark {
  pos: Vector3;
  color: string;
  /** Glow radius in world px. */
  r: number;
  phase: number;
  work: boolean;
}

/**
 * What a model tells the game besides its picture: where its lights, hatch, vents, goods and power wire are
 * (model units; the renderer projects them to world px), and its visual top. Mirrors `SpriteMeta`.
 */
export class Kit {
  readonly lights: LightMark[] = [];
  readonly glints: Vector3[] = [];
  readonly vents: Vector3[] = [];
  hatchAt: Vector3 | null = null;
  goodsAt: Vector3 | null = null;
  wireAt: Vector3 | null = null;
  /** Visual top in model units (default: the bounding box top). */
  topAt: number | null = null;

  /**
   * A light: a small glowing lamp mesh in the model (returned, already placed) plus a pulse the game draws.
   * `work` lights flicker while the machine runs and dim while it waits.
   */
  light(x: number, y: number, z: number, color: string, opts: { r?: number; phase?: number; work?: boolean; size?: number; lamp?: boolean } = {}): Object3D | null {
    this.lights.push({ pos: new Vector3(x, y, z), color, r: opts.r ?? 12, phase: opts.phase ?? 0, work: opts.work ?? false });
    if (opts.lamp === false) return null;
    const lamp = new Mesh(new SphereGeometry(opts.size ?? 0.028, 12, 8), emissive(color, 3));
    lamp.position.set(x, y, z);
    return lamp;
  }

  hatch(x: number, y: number, z: number): void {
    this.hatchAt = new Vector3(x, y, z);
  }

  goods(x: number, y: number, z: number): void {
    this.goodsAt = new Vector3(x, y, z);
  }

  wire(x: number, y: number, z: number): void {
    this.wireAt = new Vector3(x, y, z);
  }

  vent(x: number, y: number, z: number): void {
    this.vents.push(new Vector3(x, y, z));
  }

  glint(x: number, y: number, z: number): void {
    this.glints.push(new Vector3(x, y, z));
  }

  top(y: number): void {
    this.topAt = y;
  }
}

/** A fixed sprite box in world px (icons, items): the model is scaled to fit it, centred on the anchor. */
export interface FixedBox {
  w: number;
  h: number;
  /** Anchor as a fraction of the box (default 0.5, 0.5). */
  ax?: number;
  ay?: number;
  /** Share of the box the model fills (default 0.86). */
  fill?: number;
}

export interface SpriteSpec {
  /** The game's sprite id (building-mine-1, obstacle-crystal-rubble-0, icon-iron-ore ...). */
  id: string;
  /** Builds the model in tile units (see kit/iso.ts for the axes); returns the root object. */
  build: (k: Kit) => Object3D;
  /** 'shadow' (default): cast and contact shadow on an invisible ground. 'none': floating things, icons. */
  ground?: 'shadow' | 'none';
  /** Also render `<id>-glow`: the emissive parts blurred, which the game adds on top and lets breathe. */
  glow?: boolean;
  /** Halo around emissive parts baked into the sprite itself (0 = none, default 0.35). */
  bloom?: number;
  /** Fixed box in world px (icons). Without it the box hugs the model and its shadow. */
  box?: FixedBox;
  /** Output px per world px (default 5: crisp at zoom 2.5 on a 2x screen; icons default 8). */
  scale?: number;
  /** Accumulated samples (anti-aliasing, soft shadows, sky occlusion). Default 32. */
  samples?: number;
  /** Exposure multiplier before tone mapping (default 1). */
  exposure?: number;
  /** Shadow opacity on the ground (default 0.5). */
  shadow?: number;
  /** Part of a work loop (kit/loop.ts): shared bounds; `base` drops the moving parts, `frame` is an overlay. */
  loop?: LoopRole;
}

/** What the game reads for a sprite (world px, relative to the anchor), see `SpriteMeta` in svg.ts. */
export interface MetaOut {
  glints?: ScreenPt[];
  lights?: (ScreenPt & { color: string; r: number; phase: number; work?: boolean })[];
  hatch?: ScreenPt;
  top?: number;
  vents?: ScreenPt[];
  goods?: ScreenPt;
  wire?: ScreenPt;
  /** Work-loop frames: playback rate in frames per second. */
  fps?: number;
}

const specs = new Map<string, SpriteSpec>();
const planned = new Set<string>();

/** Declares ids this category owns (with or without a model yet). */
export function plan(ids: readonly string[]): void {
  for (const id of ids) planned.add(id);
}

/** Registers a model for one sprite id. The id must be planned by this category (checked in `registered`). */
export function sprite(spec: SpriteSpec): void {
  if (specs.has(spec.id)) throw new Error(`Sprite ${spec.id} is registered twice`);
  specs.set(spec.id, spec);
}

/**
 * Registers a run of frames that share one model function: building levels, animation frames, print stages.
 * `ids[i]` is rendered with `build(k, i)`.
 */
export function frames(ids: readonly string[], spec: Omit<SpriteSpec, 'id' | 'build'> & { build: (k: Kit, frame: number) => Object3D }): void {
  ids.forEach((id, i) => sprite({ ...spec, id, build: (k) => spec.build(k, i) }));
}

/** Every registered model; throws when one is not owned by this category (docs/art.md, ownership map). */
export function registered(): SpriteSpec[] {
  const foreign = [...specs.keys()].filter((id) => !planned.has(id));
  if (foreign.length) throw new Error(`Not planned in this category (see docs/art.md, ownership map): ${foreign.join(', ')}`);
  return [...specs.values()];
}

export function plannedIds(): string[] {
  return [...planned];
}

/** Projects the kit's marks to world px around the anchor; `s` scales model units (fitted icons). */
export function metaOf(k: Kit, top: number, s = 1): MetaOut {
  const p = (v: Vector3): ScreenPt => {
    const q = project(v.x * s, v.y * s, v.z * s);
    return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 };
  };
  const meta: MetaOut = { top: Math.round(top) };
  if (k.lights.length) meta.lights = k.lights.map((l) => ({ ...p(l.pos), color: l.color, r: l.r, phase: l.phase, ...(l.work ? { work: true } : {}) }));
  if (k.glints.length) meta.glints = k.glints.map(p);
  if (k.vents.length) meta.vents = k.vents.map(p);
  if (k.hatchAt) meta.hatch = p(k.hatchAt);
  if (k.goodsAt) meta.goods = p(k.goodsAt);
  if (k.wireAt) meta.wire = p(k.wireAt);
  return meta;
}
