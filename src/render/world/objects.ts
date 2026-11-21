import { Container, Graphics, Rectangle, Texture, type Sprite } from 'pixi.js';
import type { BuildingDef } from '../../content/types';
import type { PreviewGhost } from '../../game/interaction';
import { upgradeSpot } from '../../sim/construction';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';
import { FX } from '../art/fx';
import type { SpriteArt, SpriteMeta } from '../art/svg';
import type { ArtManifest } from '../art-manifest';
import { LazySprites, type BakeOptions, type Baked } from '../bake';
import type { Camera } from '../camera';
import { gridToWorld, groundEllipse, tileInView, visibleTileRange, type Point } from '../iso';
import { depthKey, SpritePool } from '../sprite-pool';
import { footprintCentre, footprintDepth, footprintWidth } from './geometry';
import { stagesDone } from '../../sim/blocks/production';
import { fromManifest, spriteFor, stageSprite, workLoop, type WorkLoop } from './sprites';
import { WorkFx, type KindLook } from './work-fx';
import { mapTint } from './light';
import { worldSettings } from './settings';

const HOLO = 0x7ff0e8;
const REMOVE = 0xff7a6a;
const GHOST_OK = 0x7ff0e8;
const GHOST_BAD = 0xff7a6a;
const LASER = 0xffd36b;
/** Drawn flat by the belts layer, not as sprites (their ghosts too). */
const FLAT = new Set(['conveyor', 'conduit']);
/** Construction shows in this many steps (cached cropped textures). */
const HOLO_STEPS = 24;

/** A kind's work loop with every sprite it needs baked (`all`) and whether they are. */
type Loop = WorkLoop & { all: string[]; ready: boolean };

/** A finished building that is not being taken down. */
const isWorking = (b: Building): boolean => b.build >= 1 && !b.removing;

/** The lights, vent and height of art: its manifest meta where it has some, plain guesses from the size where not. */
function kindLook(meta: SpriteMeta | undefined, body: { y: number } | undefined, size: number): KindLook {
  const top = meta?.top ?? (body ? -body.y : 40 + size * 18);
  return { lights: meta?.lights ?? [], vent: meta?.vents?.[0] ?? { x: 0, y: -top }, top };
}

/**
 * Depth-sorted world objects (render-world): buildings (scaled placeholders until real art exists) that work
 * visibly (work-fx.ts), construction as a hologram that rises from the bottom (no progress bar: a bright scan
 * line marks the height reached, the unbuilt rest is a faint wire ghost, the footprint glows on the ground),
 * ghosts (queued plans and the cursor preview, tinted valid or invalid, with the footprint and a power node's
 * laser range on the ground), the hovered building's outline, and dust boulders. Pooled sprites, culled to
 * the view every frame. Drones are drones-layer.ts; belts and conduits are belts-layer.ts.
 */
export class ObjectsLayer {
  /** Footprints, ranges and outlines on the ground (under the sorted objects). */
  readonly ground = new Graphics();
  private readonly buildings: SpritePool;
  private readonly ghosts: SpritePool;
  private readonly scans: SpritePool;
  private readonly boulders: SpritePool;
  private readonly fx: WorkFx;
  private readonly crops = new Map<string, Texture>();
  private readonly spriteOf = new Map<number, string>();
  private readonly looks = new Map<number, KindLook>();
  private readonly fits = new Map<number, number>();
  private readonly poly = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly loops = new Map<number, Loop | null>();
  /** Work-loop overlays: the moving parts drawn over a machine's still work base. */
  private readonly overlays: SpritePool;
  private readonly lazy: LazySprites;

  constructor(
    readonly objects: Container,
    private readonly sprites: Map<string, Baked>,
    private readonly art: ArtManifest,
    private readonly boulderIds: readonly string[],
    tech: number,
    bake: BakeOptions,
  ) {
    this.buildings = new SpritePool(objects);
    this.ghosts = new SpritePool(objects);
    this.scans = new SpritePool(objects);
    this.boulders = new SpritePool(objects);
    this.overlays = new SpritePool(objects);
    this.fx = new WorkFx(objects, sprites, tech);
    // work frames and mega stages bake on first use: up front they would blow the texel budget
    this.lazy = new LazySprites(sprites, bake);
  }

  /** A sprite baked on demand from the art manifest; undefined until it is ready. */
  private onDemand(id: string): Baked | undefined {
    return this.lazy.get(id, () => fromManifest(id, this.art)!);
  }

  /** A kind's work loop (cached; null without one). */
  private loopOf(w: World, kind: number): Loop | null {
    let l = this.loops.get(kind);
    if (l === undefined) {
      const loop = workLoop(w.defs[kind]!, this.art);
      l = loop ? { ...loop, all: loop.base ? [loop.base, ...loop.frames] : loop.frames, ready: false } : null;
      this.loops.set(kind, l);
    }
    return l;
  }

  /** Frames of a kind's work loop (empty without one). */
  framesOf(w: World, kind: number): string[] {
    return this.loopOf(w, kind)?.frames ?? [];
  }

  /**
   * What a finished building shows right now, or null for its idle picture: a staged megastructure the stage it
   * has reached; a busy machine its work loop. A loop of overlays keeps the still work base under the moving
   * parts (docs/art.md, "Work loops"), so pad and housing never move; an old loop of whole pictures swaps the
   * picture. The loop waits until all its frames are baked. Decided before the sprite is taken from the pool, so
   * each sprite gets its texture once per frame: flipping it between atlases twice a frame made Pixi rebuild its
   * batches (600 working machines cost 4 ms).
   */
  private picture(w: World, b: Building, def: BuildingDef, nowMs: number): { base: Baked; over?: Baked } | null {
    const stage = def.stages ? stageSprite(def, this.art, stagesDone(w, b)) : null;
    if (stage) {
      const baked = this.onDemand(stage);
      return baked ? { base: baked } : null;
    }
    const loop = this.loopOf(w, b.kind);
    if (!loop || this.fx.activity(b.id) <= 0.5 || !this.baked(loop)) return null;
    const frame = this.sprites.get(loop.frames[(Math.floor(nowMs / loop.frameMs) + b.id) % loop.frames.length]!);
    if (!frame) return null;
    if (!loop.base) return { base: frame };
    const base = this.sprites.get(loop.base);
    return base ? { base, over: frame } : null;
  }

  private readonly fromArt = (id: string): SpriteArt => fromManifest(id, this.art)!;

  /** Whether all sprites of a loop are baked (starts baking them together the first time). */
  private baked(loop: Loop): boolean {
    if (!loop.ready) loop.ready = this.lazy.ready(loop.all, this.fromArt);
    return loop.ready;
  }

  /** The moving parts of a work loop over the building sprite `s`. */
  private overlay(over: Baked, s: Sprite): void {
    const o = this.overlays.next(over, s.x, s.y);
    o.scale.copyFrom(s.scale);
    o.zIndex = s.zIndex + 0.02;
  }

  setStill(still: boolean): void {
    this.fx.setStill(still);
  }

  private spriteIdOf(w: World, kind: number): string {
    let id = this.spriteOf.get(kind);
    if (!id) {
      id = spriteFor(w.defs[kind]!, this.art);
      this.spriteOf.set(kind, id);
    }
    return id;
  }

  private bakedFor(w: World, kind: number): Baked | undefined {
    return this.sprites.get(this.spriteIdOf(w, kind));
  }

  /** Scale that fits a sprite's body to the footprint (placeholders were drawn for other sizes). */
  private fit(w: World, kind: number): number {
    let f = this.fits.get(kind);
    if (f === undefined) {
      const body = this.art.get(this.spriteIdOf(w, kind))?.body;
      f = body ? Math.min(2.4, (footprintWidth(w.defs[kind]!.size) * 0.96) / body.w) : 1;
      this.fits.set(kind, f);
    }
    return f;
  }

  /** Light points, vent and height of a kind's art (from its manifest meta), cached. */
  private lookOf(w: World, kind: number): KindLook {
    let l = this.looks.get(kind);
    if (!l) {
      const id = this.spriteIdOf(w, kind);
      l = kindLook(this.sprites.get(id)?.meta ?? this.art.get(id)?.meta, this.art.get(id)?.body, w.defs[kind]!.size);
      this.looks.set(kind, l);
    }
    return l;
  }

  /** Where a building's power wire attaches on screen (a node's `wire` mark, else partway up its body). */
  wirePoint(w: World, b: Building): Point {
    const def = w.def(b);
    const c = footprintCentre(b.x, b.y, def.size);
    const id = this.spriteIdOf(w, b.kind);
    const wire = (this.sprites.get(id)?.meta ?? this.art.get(id)?.meta)?.wire;
    const fit = this.fit(w, b.kind);
    if (wire) return { x: c.x + wire.x * fit, y: c.y + wire.y * fit };
    const top = this.lookOf(w, b.kind).top;
    return { x: c.x, y: c.y - top * fit * (def.behaviour === 'power-node' ? 0.92 : 0.5) };
  }

  update(w: World, camera: Camera, nowMs: number, preview: readonly PreviewGhost[], hover: { x: number; y: number } | null): void {
    const view = camera.viewRect();
    const g = this.ground;
    g.clear();
    this.buildings.begin();
    this.ghosts.begin();
    this.scans.begin();
    this.overlays.begin();
    this.fx.begin(nowMs);
    for (const b of w.state.buildings) {
      const def = w.def(b);
      if (FLAT.has(def.behaviour)) continue;
      const size = def.size;
      if (tileInView(b.x + (size - 1) / 2, b.y + (size - 1) / 2, view, 160 * size)) this.drawBuilding(w, b, def, nowMs);
    }
    this.drawGhosts(w, preview, nowMs);
    this.drawHover(w, hover);
    this.buildings.end();
    this.ghosts.end();
    this.scans.end();
    this.overlays.end();
    this.fx.end();
    this.drawBoulders(w, camera);
  }

  private drawBuilding(w: World, b: Building, def: BuildingDef, nowMs: number): void {
    const baked = this.bakedFor(w, b.kind);
    if (!baked) return;
    const working = isWorking(b);
    const pic = working ? this.picture(w, b, def, nowMs) : null;
    const c = footprintCentre(b.x, b.y, def.size);
    const s = this.buildings.next(pic?.base ?? baked, c.x, c.y);
    const fit = this.fit(w, b.kind);
    s.scale.set(fit);
    const depth = footprintDepth(b.x, b.y, def.size);
    s.zIndex = depth;
    if (b.upgrade) this.upgradeHolo(w, b, nowMs);
    if (working) {
      if (pic?.over) this.overlay(pic.over, s);
      return this.fx.apply(w, b, def, s, this.lookOf(w, b.kind), c, fit, depth, nowMs);
    }
    this.hologram(b, def, s, baked, c, fit, depth, nowMs, b.removing ? REMOVE : HOLO);
  }

  /**
   * A site (or a building being taken down): the part built so far in the tech light, a scan line at its top,
   * the rest as a faint wire ghost, the footprint plate on the ground.
   */
  private hologram(b: Building, def: BuildingDef, s: Sprite, baked: Baked, c: Point, fit: number, depth: number, nowMs: number, tint: number): void {
    const progress = Math.min(1, Math.max(0, b.build));
    const flicker = 0.62 + 0.14 * Math.sin(nowMs / 85 + b.id);
    // the unbuilt remainder: a faint ghost of the whole thing
    const wire = this.ghosts.next(baked, c.x, c.y);
    wire.scale.set(fit);
    wire.tint = tint;
    wire.alpha = 0.13;
    wire.zIndex = depth - 0.05;
    const step = Math.max(0, Math.round(progress * HOLO_STEPS));
    if (step === 0) s.visible = false;
    else {
      s.texture = this.cropped(baked, step);
      s.tint = tint;
      s.alpha = flicker;
    }
    this.plate(b.x, b.y, def.size, tint, 0.16 + 0.06 * Math.sin(nowMs / 160 + b.id), 0.8);
    if (step > 0 && step < HOLO_STEPS) this.scan(baked, c, fit, step, depth, tint, def.size, nowMs);
  }

  /** The glowing line where the hologram ends, and a soft light above it. */
  private scan(baked: Baked, c: Point, fit: number, step: number, depth: number, tint: number, size: number, nowMs: number): void {
    const glow = this.sprites.get(FX.glow);
    if (!glow) return;
    const t = baked.texture;
    const trim = t.trim ?? new Rectangle(0, 0, t.orig.width, t.orig.height);
    const cutTop = trim.y + (trim.height * (HOLO_STEPS - step)) / HOLO_STEPS;
    const y = c.y + (cutTop - baked.ay * t.orig.height) * fit;
    const w = footprintWidth(size) / 64;
    const line = this.scans.next(glow, c.x, y);
    line.blendMode = 'add';
    line.tint = tint;
    line.scale.set(w * 0.9, 0.12);
    line.alpha = 0.75 + 0.25 * Math.sin(nowMs / 70);
    line.zIndex = depth + 0.3;
  }

  /** A core being upgraded in place: the next stage rises as a hologram on its footprint. */
  private upgradeHolo(w: World, core: Building, nowMs: number): void {
    const up = core.upgrade;
    const spot = up ? upgradeSpot(w, core) : null;
    const baked = spot ? this.bakedFor(w, spot.kind) : undefined;
    if (!up || !spot || !baked) return;
    const def = w.defs[spot.kind]!;
    const c = footprintCentre(spot.x, spot.y, def.size);
    const s = this.ghosts.next(baked, c.x, c.y);
    const fit = this.fit(w, spot.kind);
    const step = Math.max(1, Math.round(up.build * HOLO_STEPS));
    s.scale.set(fit);
    s.texture = this.cropped(baked, step);
    s.tint = HOLO;
    s.alpha = 0.5 + 0.12 * Math.sin(nowMs / 85);
    s.zIndex = footprintDepth(spot.x, spot.y, def.size) + 0.4;
    this.plate(spot.x, spot.y, def.size, HOLO, 0.14, 0.8);
    if (step < HOLO_STEPS) this.scan(baked, c, fit, step, footprintDepth(spot.x, spot.y, def.size) + 0.1, HOLO, def.size, nowMs);
  }

  /** The bottom `step` of `HOLO_STEPS` of a sprite (cached per step). */
  private cropped(baked: Baked, step: number): Texture {
    const key = `${baked.texture.uid}:${step}`;
    const hit = this.crops.get(key);
    if (hit) return hit;
    const t = baked.texture;
    const trim = t.trim ?? new Rectangle(0, 0, t.orig.width, t.orig.height);
    const keep = (trim.height * step) / HOLO_STEPS;
    const cut = trim.height - keep;
    const tex = new Texture({
      source: t.source,
      frame: new Rectangle(t.frame.x, t.frame.y + cut, t.frame.width, keep),
      orig: t.orig,
      trim: new Rectangle(trim.x, trim.y + cut, trim.width, keep),
    });
    this.crops.set(key, tex);
    return tex;
  }

  /* ---------- Ground marks ---------- */

  /** A footprint on the ground: a tinted plate with a bright edge. */
  private plate(x: number, y: number, size: number, color: number, fill: number, edge: number): void {
    const p = this.poly;
    const a = gridToWorld(x, y);
    const b = gridToWorld(x + size, y);
    const c = gridToWorld(x + size, y + size);
    const d = gridToWorld(x, y + size);
    p[0] = a.x;
    p[1] = a.y;
    p[2] = b.x;
    p[3] = b.y;
    p[4] = c.x;
    p[5] = c.y;
    p[6] = d.x;
    p[7] = d.y;
    this.ground.poly(p).fill({ color, alpha: fill }).stroke({ width: 2.2, color, alpha: edge });
  }

  private drawGhosts(w: World, preview: readonly PreviewGhost[], nowMs: number): void {
    for (const p of w.state.plans) this.ghost(w, p.kind, p.x, p.y, GHOST_OK, 0.4, nowMs, false);
    for (const p of preview) this.ghost(w, p.kind, p.x, p.y, p.ok ? GHOST_OK : GHOST_BAD, 0.62, nowMs, true);
  }

  private ghost(w: World, kind: number, x: number, y: number, tint: number, alpha: number, nowMs: number, cursor: boolean): void {
    const def = w.defs[kind]!;
    const flat = FLAT.has(def.behaviour);
    const size = flat ? 1 : def.size;
    this.plate(x, y, size, tint, cursor ? 0.2 : 0.07, cursor ? 0.85 : 0.4);
    if (flat) return;
    if (cursor && def.power?.laserRange) this.range(x, y, size, def.power.laserRange);
    const baked = this.bakedFor(w, kind);
    if (!baked) return;
    const c = footprintCentre(x, y, size);
    const s = this.ghosts.next(baked, c.x, c.y);
    s.scale.set(this.fit(w, kind));
    s.tint = tint;
    s.alpha = cursor ? alpha + 0.06 * Math.sin(nowMs / 200) : alpha;
    s.zIndex = footprintDepth(x, y, size) + 0.7;
  }

  /** A power node's laser reach as a ring on the ground (range runs footprint edge to edge). */
  private range(x: number, y: number, size: number, range: number): void {
    const c = gridToWorld(x + size / 2, y + size / 2);
    const e = groundEllipse(range + size / 2);
    this.ground.ellipse(c.x, c.y, e.rx, e.ry).stroke({ width: 2, color: LASER, alpha: 0.55 });
  }

  private drawHover(w: World, hover: { x: number; y: number } | null): void {
    const b = hover ? w.at(hover.x, hover.y) : undefined;
    if (!b || b.build < 1) return;
    const size = w.def(b).size;
    const p = this.poly;
    const pts = [gridToWorld(b.x, b.y), gridToWorld(b.x + size, b.y), gridToWorld(b.x + size, b.y + size), gridToWorld(b.x, b.y + size)];
    pts.forEach((q, i) => {
      p[i * 2] = q.x;
      p[i * 2 + 1] = q.y;
    });
    this.ground.poly(p).fill({ color: 0xffffff, alpha: 0.08 }).stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
  }

  private drawBoulders(w: World, camera: Camera): void {
    this.boulders.begin();
    const { map } = w.state;
    const r = visibleTileRange(camera.viewRect(), map.w, map.h, 2);
    // boulders lie on the unbuilt land: they take its lighting tint, or they glow brighter than the ground at night
    const tint = mapTint(worldSettings().lighting);
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const v = map.boulder[y * map.w + x]!;
        const baked = v ? this.sprites.get(this.boulderIds[(v - 1) % this.boulderIds.length]!) : undefined;
        if (!baked) continue;
        const c = gridToWorld(x + 0.5, y + 0.5);
        const s = this.boulders.next(baked, c.x, c.y);
        s.scale.set(0.5);
        s.tint = tint;
        s.zIndex = depthKey(x, y);
      }
    }
    this.boulders.end();
  }
}
