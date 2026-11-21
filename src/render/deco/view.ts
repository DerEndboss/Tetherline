import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { hexToNumber } from '../art/color';
import { hash2 } from '../art/rand';
import type { ArtCategory, ArtManifest, ArtSprite, CategoryManifest } from '../art-manifest';
import { bakeAtlas, type BakeOptions, type Baked } from '../bake';
import type { Camera } from '../camera';
import { gridToWorld, groundEllipse, tileInView, viewMode, worldToTile, type Rect } from '../iso';
import { depthKey } from '../sprite-pool';
import { DECO_PROPS, decoId, decoIds, JUNCTION_ID, type PropKind } from './ids';
import { DecoPlanner, smoothRun, type ChunkChange, type ChunkPlan, type DecoInput, type DecoProp } from './plan';
import { decoName, FALLBACK_BODY, pickBox, pickDeco, registerDecoPicking, type BodyBox, type DecoHit, type DecoKind } from './pick';

/** Cable look in world px: thin and pale, so nobody takes it for a real belt or line. */
const CABLE = { shadow: 0x150c26, body: 0x4a5578, top: 0x7e8bb2, width: 3, dash: 6, gap: 14 };
/** Corner radius of a cable bend, in tiles. */
const BEND = 0.42;
/** Pulses of light running along the cables: world px per second, and the pause between two on one run. */
const PULSE_SPEED = 130;
const PULSE_GAP = 1200;
const MAX_PULSES = 28;
/** A new cable grows in over this many ms; a prop pops in / shrinks out over these. */
const GROW_MS = 700;
const POP_MS = 380;
const FADE_MS = 280;
/** The faint pool of light on the ground under every piece (it reads from far out, on dark ground): its strength and radius in tiles. */
const POOL_ALPHA = 0.32;
const POOL_RADIUS = 0.72;
/** Planning budget per frame, ms. */
const PLAN_MS = 2.5;
/** A piece can be hit this many screen px beyond its body (small ones stay easy to catch when zoomed out). */
const PICK_PAD_PX = 5;

/**
 * What the deco layer needs from the game (render/world/deco-source.ts adapts the world): the settings switch,
 * a key that changes whenever the planner input may change, the input, the hovered tile, and the tiles a ghost
 * covers right now (props step aside).
 */
export interface DecoSource {
  /** The theme's tech colour (cable light). */
  tech: string;
  /** Decoration switched on in the settings. */
  enabled(): boolean;
  key(): number;
  input(): DecoInput;
  hover(): { x: number; y: number } | null;
  /** The piece the player clicked (it stays highlighted), or null. */
  selected(): { x: number; y: number } | null;
  /** Changes whenever the hidden tiles change. */
  hideKey(): string;
  hiddenAt(x: number, y: number): boolean;
}

/** A run as flat world points with the length up to each point (pulses, growth). */
interface Track {
  xy: Float32Array;
  len: Float32Array;
  total: number;
  phase: number;
}

interface RunVis {
  /** Flat world points. */
  world: number[];
  track: Track | null;
  sig: number;
  /** When it started growing (ms); settled runs have it far in the past. */
  born: number;
}

/** A placed prop or junction: sprite, tile, optional glow, birth time for the pop-in. */
interface Placed {
  sprite: Sprite;
  /** Soft light on the ground under it. */
  pool: Sprite;
  x: number;
  y: number;
  glows: Sprite[];
  born: number;
  /** Set while shrinking out. */
  dying: number;
  key: string;
  kind: DecoKind;
  variant: number;
  scale: number;
  /** What the pointer hits (world px): the sprite's body. */
  box: Rect;
}

interface Wanted {
  key: string;
  x: number;
  y: number;
  kind: Placed['kind'];
  variant: number;
  b: Baked | undefined;
}

interface Chunk {
  key: number;
  plan: ChunkPlan;
  settled: Graphics;
  settledLight: Graphics;
  runs: RunVis[];
  growing: boolean;
  placed: Placed[];
  bounds: Rect;
  visible: boolean;
}

/**
 * The deco layer ("Deko"): thin pale cables with rounded bends and faint cyan dashes on the ground between
 * buildings, light pulses on the longest ones, junction boxes where they branch, and small 1x1 props (racks,
 * terminals, masts, transformers, lamps, memory, boards ...), all from the chunked planner. Decoration only: it
 * reads the game state and never changes it. It plans only the chunks that changed, a little per frame; a chunk
 * whose plan changes is redrawn alone: new cables grow in, old ones fade, props pop in or shrink out, the rest
 * stays exactly as it was. Props are sprites in the depth-sorted `objects` container, cables live in `layer`
 * under belts. `decoAt` / `tapDeco` (pick.ts) tell the tools what stands on a tile. Switched off in the settings
 * it draws nothing.
 */
export class DecoView {
  readonly layer = new Container();
  private readonly cables = new Container();
  private readonly lights = new Container();
  private readonly pulses = new Container();
  private readonly pools = new Container();
  private readonly dynamic = new Graphics();
  private readonly dynamicLight = new Graphics();
  private readonly hoverRing = new Graphics();
  private readonly planner = new DecoPlanner();
  private readonly chunks = new Map<number, Chunk>();
  /** The chunks as an array (rebuilt when one comes or goes), so the per-frame loops allocate nothing. */
  private list: Chunk[] = [];
  private readonly props = new Map<number, Placed>();
  private dying: Placed[] = [];
  private fading: { world: number[]; at: number }[] = [];
  private baked: Map<string, Baked> | null = null;
  /** The body box of each sprite id (world px around its anchor): the hit area. */
  private readonly bodies = new Map<string, BodyBox>();
  private kinds: PropKind[] = [];
  private loaded = false;
  private glowTex: Texture | null = null;
  private key = NaN;
  private cullVersion = -1;
  private hideKey = '';
  private warm = false;
  private shown = true;
  private readonly cyan: number;
  private readonly still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  private readonly tmp: number[] = [];

  constructor(
    private readonly source: DecoSource,
    private readonly objects: Container,
    private readonly bake: BakeOptions,
    private readonly camera: Camera,
  ) {
    this.cyan = hexToNumber(source.tech);
    this.lights.blendMode = 'add';
    this.pulses.blendMode = 'add';
    this.dynamicLight.blendMode = 'add';
    this.pools.blendMode = 'add';
    this.layer.addChild(this.cables, this.lights, this.pools, this.dynamic, this.dynamicLight, this.pulses, this.hoverRing);
    this.layer.onRender = () => this.frame(performance.now());
    registerDecoPicking({ at: (x, y) => this.hitAt(x, y), atPoint: (wx, wy, covered) => this.hitAtPoint(wx, wy, covered) });
    void this.load();
  }

  /** A new world: forget every chunk and plan again from scratch (no growing animation for the first fill). */
  reset(): void {
    for (const c of this.chunks.values()) this.drop(c);
    this.chunks.clear();
    this.list = [];
    this.props.clear();
    this.planner.reset();
    this.key = NaN;
    this.warm = false;
  }

  /* ---------- Art ---------- */

  /** Loads the deco manifest (and the top-down set over it in that view) and bakes the props into an atlas. */
  private async load(): Promise<void> {
    if (typeof fetch !== 'function' || typeof document === 'undefined') {
      this.loaded = true;
      return;
    }
    const top = viewMode() !== 'iso';
    const sets = await Promise.all([manifestOf('art/deco/'), top ? manifestOf(`art/deco/${viewMode()}/`) : Promise.resolve([])]);
    const art: ArtManifest = new Map(sets.flat().map((s) => [s.id, s]));
    const wanted = decoIds().filter((id) => art.has(id));
    for (const id of wanted) this.bodies.set(id, bodyOf(art.get(id)!));
    this.glowTex = glowTexture();
    if (wanted.length) {
      const blank = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
      const sprites = wanted.map((id) => {
        const a = art.get(id)!;
        return { id, w: a.w, h: a.h, ax: a.ax, ay: a.ay, svg: blank };
      });
      this.baked = (await bakeAtlas(sprites, { scale: this.bake.scale, art, budget: 0 })).baked;
    }
    // a kind is planned only when every one of its variants has art: no prop without a body
    const have = this.baked;
    this.kinds = DECO_PROPS.filter((p) => have && Array.from({ length: p.variants }, (_, v) => have.has(decoId(p.kind, v))).every(Boolean)).map((p) => p.kind);
    this.loaded = true;
    this.key = NaN;
  }

  /* ---------- Frame ---------- */

  private frame(nowMs: number): void {
    const on = this.source.enabled();
    if (on !== this.shown) {
      this.shown = on;
      this.layer.visible = on;
      this.cullVersion = -1;
    }
    if (!on || !this.loaded) return;
    const key = this.source.key();
    if (key !== this.key) {
      this.key = key;
      this.planner.setInput({ ...this.source.input(), kinds: this.kinds });
    }
    if (this.planner.queued > 0) {
      const c = worldToTile(this.camera.x, this.camera.y);
      for (const ch of this.planner.process(PLAN_MS, c)) this.apply(ch, nowMs);
      if (this.planner.queued === 0) this.warm = true;
    }
    this.settle(nowMs);
    if (this.camera.version !== this.cullVersion || this.ghostMoved()) {
      this.cullVersion = this.camera.version;
      this.cull();
    }
    this.animate(nowMs);
  }

  /* ---------- Applying a changed chunk ---------- */

  private apply(change: ChunkChange, nowMs: number): void {
    const plan = this.planner.chunks.get(change.key);
    const old = this.chunks.get(change.key);
    if (!plan) {
      if (old) this.retire(old, nowMs);
      this.chunks.delete(change.key);
      this.list = [...this.chunks.values()];
      return;
    }
    const animate = this.warm && !this.still;
    const chunk = old ?? this.emptyChunk(change.key, plan);
    this.diffRuns(chunk, plan, nowMs, animate);
    this.diffProps(chunk, plan, nowMs, animate);
    chunk.plan = plan;
    this.redrawStatic(chunk, nowMs);
    if (!old) {
      this.chunks.set(change.key, chunk);
      this.list = [...this.chunks.values()];
    }
    this.cullVersion = -1;
  }

  private emptyChunk(key: number, plan: ChunkPlan): Chunk {
    const settled = new Graphics();
    const settledLight = new Graphics();
    this.cables.addChild(settled);
    this.lights.addChild(settledLight);
    return { key, plan, settled, settledLight, runs: [], growing: false, placed: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 }, visible: true };
  }

  private retire(c: Chunk, nowMs: number): void {
    for (const r of c.runs) this.fading.push({ world: r.world, at: nowMs });
    this.drop(c);
  }

  private drop(c: Chunk): void {
    c.settled.destroy();
    c.settledLight.destroy();
    for (const p of c.placed) this.destroyPlaced(p);
    c.placed = [];
  }

  /** Runs that are new grow in, runs that vanished fade, runs that stayed are untouched. */
  private diffRuns(chunk: Chunk, plan: ChunkPlan, nowMs: number, animate: boolean): void {
    const flat: number[] = [];
    const old = new Map(chunk.runs.map((r) => [r.sig, r]));
    const next: RunVis[] = [];
    for (const run of plan.runs) {
      smoothRun(run, BEND, flat);
      const world = toWorld(flat);
      const sig = runSig(world);
      const kept = old.get(sig);
      if (kept) {
        old.delete(sig);
        next.push(kept);
        continue;
      }
      next.push({ world, track: trackOf(world, run.length), sig, born: animate ? nowMs : -1e9 });
    }
    for (const r of old.values()) if (animate) this.fading.push({ world: r.world, at: nowMs });
    chunk.runs = next;
    chunk.growing = next.some((r) => nowMs - r.born < GROW_MS);
    chunk.bounds = boundsOf(next.map((r) => r.world), plan);
  }

  /** What a chunk's plan wants on the ground: props and junction boxes with their art. */
  private wanted(plan: ChunkPlan): Wanted[] {
    const baked = this.baked;
    const out: Wanted[] = [];
    for (const p of plan.props) out.push({ key: `p${p.x},${p.y},${p.kind},${p.variant}`, x: p.x, y: p.y, kind: p.kind, variant: p.variant, b: baked?.get(decoId(p.kind, p.variant)) });
    for (const j of plan.junctions) out.push({ key: `j${j.x},${j.y}`, x: j.x, y: j.y, kind: 'junction', variant: 0, b: baked?.get(JUNCTION_ID) });
    return out;
  }

  /** Props and junction boxes: matching ones stay, new ones pop in, gone ones shrink out. */
  private diffProps(chunk: Chunk, plan: ChunkPlan, nowMs: number, animate: boolean): void {
    const old = new Map(chunk.placed.map((p) => [p.key, p]));
    const next: Placed[] = [];
    for (const w of this.wanted(plan)) {
      const kept = old.get(w.key);
      if (kept) {
        old.delete(w.key);
        next.push(kept);
      } else if (w.b && !(w.kind === 'junction' && this.props.has(tileKey(w.x, w.y)))) {
        const placed = this.put(w.b, w.x, w.y, w.x + 0.5, w.y + 0.5, w.key, w.kind, w.variant, animate ? nowMs : -1e9);
        next.push(placed);
        this.props.set(tileKey(w.x, w.y), placed);
      }
    }
    for (const gone of old.values()) this.remove(gone, nowMs, animate);
    chunk.placed = next;
  }

  private remove(gone: Placed, nowMs: number, animate: boolean): void {
    if (this.props.get(tileKey(gone.x, gone.y)) === gone) this.props.delete(tileKey(gone.x, gone.y));
    if (!animate) return this.destroyPlaced(gone);
    gone.dying = nowMs;
    this.dying.push(gone);
  }

  /** A sprite on tile (x, y), standing at grid point (gx, gy) inside it. */
  private put(b: Baked, x: number, y: number, gx: number, gy: number, key: string, kind: Placed['kind'], variant: number, born: number): Placed {
    const at = gridToWorld(gx, gy);
    const sprite = new Sprite(b.texture);
    sprite.anchor.set(b.ax, b.ay);
    sprite.position.set(at.x, at.y);
    sprite.zIndex = depthKey(x, y);
    this.objects.addChild(sprite);
    const glows = (b.meta?.lights ?? []).map((l) => {
      const g = new Sprite(this.glowTex ?? Texture.WHITE);
      g.anchor.set(0.5);
      g.position.set(at.x + l.x, at.y + l.y);
      g.tint = hexToNumber(l.color);
      g.blendMode = 'add';
      g.scale.set((l.r ?? 10) / 24);
      g.zIndex = depthKey(x, y) + 1;
      this.objects.addChild(g);
      return g;
    });
    const body = this.bodies.get(kind === 'junction' ? JUNCTION_ID : decoId(kind, variant)) ?? FALLBACK_BODY;
    return { sprite, pool: this.poolAt(at.x, at.y), x, y, glows, born, dying: 0, key, kind, variant, scale: 1, box: pickBox(x, y, body) };
  }

  /** A pool of light on the ground at a world point. */
  private poolAt(x: number, y: number): Sprite {
    const pool = new Sprite(this.glowTex ?? Texture.WHITE);
    const e = groundEllipse(POOL_RADIUS);
    pool.anchor.set(0.5);
    pool.position.set(x, y);
    pool.tint = this.cyan;
    pool.alpha = POOL_ALPHA;
    pool.scale.set((e.rx * 2) / 48, (e.ry * 2) / 48);
    this.pools.addChild(pool);
    return pool;
  }

  private destroyPlaced(p: Placed): void {
    p.sprite.destroy();
    p.pool.destroy();
    for (const g of p.glows) g.destroy();
  }

  /* ---------- Drawing cables ---------- */

  /** The chunk's settled runs in its own Graphics (the ones still growing are drawn by `settle`). */
  private redrawStatic(chunk: Chunk, nowMs: number): void {
    const done = chunk.runs.filter((r) => nowMs - r.born >= GROW_MS);
    drawRuns(chunk.settled, done.map((r) => r.world), this.cyan, chunk.settledLight, false);
  }

  /** Growing runs (all chunks) and fading ones are redrawn each frame in one Graphics; finished runs move to their chunk's. */
  private settle(nowMs: number): void {
    const dyn = this.dynamic;
    const dynL = this.dynamicLight;
    const any = this.fading.length > 0 || this.anyGrowing();
    if (!any) {
      if (this.dynamicDirty) {
        dyn.clear();
        dynL.clear();
        this.dynamicDirty = false;
      }
      return;
    }
    dyn.clear();
    dynL.clear();
    this.dynamicDirty = true;
    this.fading = this.fading.filter((f) => nowMs - f.at < FADE_MS);
    for (const f of this.fading) {
      const a = 1 - (nowMs - f.at) / FADE_MS;
      drawRuns(dyn, [f.world], this.cyan, dynL, true, a * 0.8);
    }
    for (const c of this.list) {
      if (!c.growing) continue;
      let still = false;
      const partial: number[][] = [];
      for (const r of c.runs) {
        const age = nowMs - r.born;
        if (age >= GROW_MS) continue;
        still = true;
        partial.push(cut(r.world, easeOut(Math.max(0, age) / GROW_MS), this.tmp));
      }
      drawRuns(dyn, partial, this.cyan, dynL, true);
      if (!still) {
        c.growing = false;
        this.redrawStatic(c, nowMs);
      }
    }
  }

  private dynamicDirty = false;

  private anyGrowing(): boolean {
    for (const c of this.list) if (c.growing) return true;
    return false;
  }

  /* ---------- Culling, hiding, motion ---------- */

  /** Whether the ghosts changed since the last cull (props under them step aside). */
  private ghostMoved(): boolean {
    const key = this.source.hideKey();
    if (key === this.hideKey) return false;
    this.hideKey = key;
    return true;
  }

  private cull(): void {
    const v = this.camera.viewRect();
    const hidden = this.hideKey !== '';
    for (const c of this.list) {
      const b = c.bounds;
      c.visible = b.right >= v.left && b.left <= v.right && b.bottom >= v.top && b.top <= v.bottom;
      c.settled.visible = c.visible;
      c.settledLight.visible = c.visible;
      for (const p of c.placed) {
        const on = tileInView(p.x, p.y, v, 120) && !(hidden && this.source.hiddenAt(p.x, p.y));
        p.sprite.visible = on;
        p.pool.visible = on;
        for (const g of p.glows) g.visible = on;
      }
    }
  }

  /** Dashes breathe; pulses run along the longest visible cables; lamp glows flicker; props pop in and shrink out. */
  private animate(nowMs: number): void {
    const t = this.still ? 0 : nowMs / 1000;
    this.lights.alpha = this.still ? 0.8 : 0.65 + 0.2 * Math.sin(t * 1.7);
    const v = this.camera.viewRect();
    let used = 0;
    for (const c of this.list) if (c.visible) used = this.animateChunk(c, nowMs, t, v, used);
    for (let i = used; i < this.pulses.children.length; i++) this.pulses.children[i]!.visible = false;
    for (let i = this.dying.length - 1; i >= 0; i--) if (!this.fadeOut(this.dying[i]!, nowMs)) this.dying.splice(i, 1);
    this.drawHover(nowMs);
  }

  /** One visible chunk's pulses (from pulse slot `used`) and props; returns the next free slot. */
  private animateChunk(c: Chunk, nowMs: number, t: number, v: Rect, used: number): number {
    let slot = used;
    for (const r of c.runs) {
      if (!r.track || slot >= MAX_PULSES || nowMs - r.born < GROW_MS) continue;
      this.ensurePulse(slot);
      this.movePulse(this.pulses.children[slot] as Sprite, r.track, t, v);
      slot++;
    }
    for (let i = 0; i < c.placed.length; i++) this.animateProp(c.placed[i]!, nowMs, t, i + c.key);
    return slot;
  }

  private animateProp(p: Placed, nowMs: number, t: number, n: number): void {
    const age = nowMs - p.born;
    const s = age >= POP_MS ? 1 : popScale(Math.max(0, age) / POP_MS);
    if (s !== p.scale) {
      p.scale = s;
      p.sprite.scale.set(s);
      p.pool.alpha = POOL_ALPHA * Math.min(1, s);
    }
    for (let k = 0; k < p.glows.length; k++) p.glows[k]!.alpha = (0.5 + 0.18 * Math.sin(t * 2.1 + n * 1.3 + k)) * Math.min(1, s);
  }

  /** Shrinks a removed prop out; false once it is gone. */
  private fadeOut(p: Placed, nowMs: number): boolean {
    const f = (nowMs - p.dying) / FADE_MS;
    if (f >= 1) {
      this.destroyPlaced(p);
      return false;
    }
    p.sprite.scale.set(1 - f);
    p.sprite.alpha = 1 - f;
    p.pool.alpha = POOL_ALPHA * (1 - f);
    for (const g of p.glows) g.alpha = (1 - f) * 0.4;
    return true;
  }

  private ensurePulse(i: number): void {
    const tex = this.glowTex ?? (this.glowTex = glowTexture());
    while (this.pulses.children.length <= i) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.tint = this.cyan;
      s.scale.set(0.3, 0.22);
      this.pulses.addChild(s);
    }
  }

  private movePulse(s: Sprite, tr: Track, t: number, v: Rect): void {
    if (this.still) {
      s.visible = false;
      return;
    }
    const d = (t * PULSE_SPEED + tr.phase) % (tr.total + PULSE_GAP);
    if (d > tr.total) {
      s.visible = false;
      return;
    }
    const i = upper(tr.len, d);
    const a = i - 1;
    const f = (d - tr.len[a]!) / Math.max(1e-6, tr.len[i]! - tr.len[a]!);
    const x = tr.xy[a * 2]! + (tr.xy[i * 2]! - tr.xy[a * 2]!) * f;
    const y = tr.xy[a * 2 + 1]! + (tr.xy[i * 2 + 1]! - tr.xy[a * 2 + 1]!) * f;
    s.visible = x >= v.left - 40 && x <= v.right + 40 && y >= v.top - 40 && y <= v.bottom + 40;
    s.position.set(x, y);
    s.alpha = Math.min(1, d / 60, (tr.total - d) / 60) * 0.8;
  }

  /* ---------- Picking and hover ---------- */

  /** The piece standing on a tile (a prop or a junction box), unless it is shrinking out. */
  private pieceAt(x: number, y: number): Placed | undefined {
    const p = this.props.get(tileKey(x, y));
    return p && p.dying === 0 ? p : undefined;
  }

  private hitOf(p: Placed): DecoHit {
    return { x: p.x, y: p.y, kind: p.kind, variant: p.variant, name: decoName(p.kind) };
  }

  private hitAt(x: number, y: number): DecoHit | null {
    const p = this.shown ? this.pieceAt(x, y) : undefined;
    return p ? this.hitOf(p) : null;
  }

  /** The piece whose body is under a world point, the one in front when they overlap (see `pickDeco`). */
  private hitAtPoint(wx: number, wy: number, covered?: (depth: number) => boolean): DecoHit | null {
    if (!this.shown) return null;
    const hit = pickDeco(this.props.values(), wx, wy, depthKey, PICK_PAD_PX / this.camera.zoom, (p) => p.dying !== 0 || !p.sprite.visible, covered);
    return hit ? this.hitOf(hit) : null;
  }

  /** The pieces standing now with their body box in world px (dev hooks and the smoke check click on them). */
  pieces(): { x: number; y: number; kind: DecoKind; box: Rect }[] {
    return [...this.props.values()].filter((p) => p.dying === 0).map((p) => ({ x: p.x, y: p.y, kind: p.kind, box: p.box }));
  }

  /** A soft ring under the piece the pointer is on (light) and under the clicked one (stronger, stays). */
  private drawHover(nowMs: number): void {
    const g = this.hoverRing;
    g.clear();
    const h = this.source.hover();
    const s = this.source.selected();
    const sel = s ? this.pieceAt(s.x, s.y) : undefined;
    const hov = h && !(sel && sel.x === h.x && sel.y === h.y) ? this.pieceAt(h.x, h.y) : undefined;
    if (hov) this.ring(g, hov, 0.5 + 0.2 * Math.sin(nowMs / 160), 2, 0.07);
    if (sel) this.ring(g, sel, 0.95, 3, 0.16);
  }

  private ring(g: Graphics, p: Placed, alpha: number, width: number, fill: number): void {
    const c = gridToWorld(p.x + 0.5, p.y + 0.5);
    const e = groundEllipse(p.kind === 'junction' ? 0.5 : 0.58);
    g.ellipse(c.x, c.y, e.rx, e.ry).fill({ color: this.cyan, alpha: fill });
    g.ellipse(c.x, c.y, e.rx, e.ry).stroke({ width, color: this.cyan, alpha });
    if (width > 2) g.ellipse(c.x, c.y, e.rx * 1.16, e.ry * 1.16).stroke({ width: 1.2, color: this.cyan, alpha: alpha * 0.5 });
  }
}

/* ---------- Helpers ---------- */

const tileKey = (x: number, y: number): number => y * 4096 + x;

/** The hit box of an art entry: its body box, else the whole image around the anchor. */
function bodyOf(a: ArtSprite): BodyBox {
  return a.body ?? { x: -a.w * a.ax, y: -a.h * a.ay, w: a.w, h: a.h };
}

async function manifestOf(dir: string): Promise<ArtSprite[]> {
  try {
    const res = await fetch(`${dir}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const m = (await res.json()) as Omit<CategoryManifest, 'category'>;
    if (m.version !== 1 || !m.sprites) return [];
    return Object.entries(m.sprites).map(([id, e]) => ({
      ...e,
      id,
      category: 'deco' as ArtCategory,
      url: `${dir}${e.file}?v=${e.hash}`,
      ...(e.half ? { halfUrl: `${dir}${e.half.file}?v=${e.half.hash}` } : {}),
    }));
  } catch {
    return [];
  }
}

/** Flat grid points -> flat world points. */
function toWorld(flat: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const p = gridToWorld(flat[i]!, flat[i + 1]!);
    out.push(p.x, p.y);
  }
  return out;
}

function runSig(world: readonly number[]): number {
  let h = world.length;
  for (const v of world) h = (Math.imul(h, 31) + Math.round(v * 8)) | 0;
  return h;
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
/** A pop-in with a little overshoot. */
const popScale = (t: number): number => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

/** The first `f` of a polyline's length, into `out` (reused). */
function cut(world: readonly number[], f: number, out: number[]): number[] {
  out.length = 0;
  let total = 0;
  for (let i = 2; i < world.length; i += 2) total += Math.hypot(world[i]! - world[i - 2]!, world[i + 1]! - world[i - 1]!);
  let left = total * f;
  out.push(world[0]!, world[1]!);
  for (let i = 2; i < world.length && left > 0; i += 2) {
    const dx = world[i]! - world[i - 2]!;
    const dy = world[i + 1]! - world[i - 1]!;
    const len = Math.hypot(dx, dy);
    if (len <= left) {
      out.push(world[i]!, world[i + 1]!);
      left -= len;
    } else {
      out.push(world[i - 2]! + (dx * left) / len, world[i - 1]! + (dy * left) / len);
      left = 0;
    }
  }
  return out.slice();
}

/** Adds every run as a sub-path, shifted by (dx, dy) world px. */
function path(g: Graphics, runs: readonly (readonly number[])[], dx: number, dy: number): void {
  for (const r of runs) {
    if (r.length < 4) continue;
    g.moveTo(r[0]! + dx, r[1]! + dy);
    for (let i = 2; i < r.length; i += 2) g.lineTo(r[i]! + dx, r[i + 1]! + dy);
  }
}

/** Cables (shadow, body, highlight) into `body` and their faint dashes into `light`; `alpha` fades them. */
function drawRuns(body: Graphics, runs: readonly (readonly number[])[], cyan: number, light: Graphics, append: boolean, alpha = 1): void {
  if (!append) {
    body.clear();
    light.clear();
  }
  if (!runs.length) return;
  path(body, runs, 0, 2);
  body.stroke({ width: CABLE.width + 2, color: CABLE.shadow, alpha: 0.2 * alpha, cap: 'round', join: 'round' });
  path(body, runs, 0, 0);
  body.stroke({ width: CABLE.width, color: CABLE.body, alpha: 0.82 * alpha, cap: 'round', join: 'round' });
  path(body, runs, 0, -0.8);
  body.stroke({ width: 0.9, color: CABLE.top, alpha: 0.4 * alpha, cap: 'round', join: 'round' });
  for (const r of runs) dashes(light, r, hash2(Math.round(r[0] ?? 0), Math.round(r[1] ?? 0)) % (CABLE.dash + CABLE.gap));
  light.stroke({ width: 4, color: cyan, alpha: 0.07 * alpha, cap: 'round' });
  for (const r of runs) dashes(light, r, hash2(Math.round(r[0] ?? 0), Math.round(r[1] ?? 0)) % (CABLE.dash + CABLE.gap));
  light.stroke({ width: 1.1, color: cyan, alpha: 0.55 * alpha, cap: 'round' });
}

/** Short dash sub-paths along a run (world px), starting `offset` px in. */
function dashes(g: Graphics, r: readonly number[], offset: number): void {
  const period = CABLE.dash + CABLE.gap;
  let at = -offset;
  for (let i = 2; i < r.length; i += 2) {
    const ax = r[i - 2]!;
    const ay = r[i - 1]!;
    const len = Math.hypot(r[i]! - ax, r[i + 1]! - ay);
    if (len < 1e-6) continue;
    const ux = (r[i]! - ax) / len;
    const uy = (r[i + 1]! - ay) / len;
    let s = Math.max(0, Math.ceil(at / period) * period - at);
    for (; s < len; s += period) {
      const e = Math.min(len, s + CABLE.dash);
      g.moveTo(ax + ux * s, ay + uy * s).lineTo(ax + ux * e, ay + uy * e);
    }
    at += len;
  }
}

function boundsOf(runs: readonly (readonly number[])[], plan: ChunkPlan): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const take = (x: number, y: number): void => {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  };
  for (const r of runs) for (let i = 0; i < r.length; i += 2) take(r[i]!, r[i + 1]!);
  const props: DecoProp[] = plan.props;
  for (const p of props) {
    const c = gridToWorld(p.x + 0.5, p.y + 0.5);
    take(c.x - 60, c.y - 160);
    take(c.x + 60, c.y + 40);
  }
  if (left === Infinity) return { left: 0, top: 0, right: 0, bottom: 0 };
  return { left: left - 20, top: top - 20, right: right + 20, bottom: bottom + 20 };
}

/** A run long enough for a pulse (more than three tiles), with cumulative lengths. */
function trackOf(world: readonly number[], tiles: number): Track | null {
  if (tiles < 5) return null;
  const n = world.length / 2;
  const xy = Float32Array.from(world);
  const len = new Float32Array(n);
  for (let i = 1; i < n; i++) len[i] = len[i - 1]! + Math.hypot(world[i * 2]! - world[i * 2 - 2]!, world[i * 2 + 1]! - world[i * 2 - 1]!);
  const total = len[n - 1]!;
  return { xy, len, total, phase: hash2(Math.round(world[0]!), Math.round(world[1]!)) % 2000 };
}

/** First index whose cumulative length exceeds d (1..n-1). */
function upper(len: Float32Array, d: number): number {
  let lo = 1;
  let hi = len.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (len[mid]! < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A soft white radial glow (48 px), tinted per use. */
function glowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  return Texture.from(c);
}
