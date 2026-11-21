import {
  Box3,
  Color,
  FloatType,
  Group,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PCFShadowMap,
  Sphere,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Object3D,
} from 'three';
import { artView, heightPx, isoCamera, project, screenRight, topPx, viewYaw, type PxBox } from './iso';
import { analyse, stripMoving, workBaseId } from './loop';
import { Kit, metaOf, type MetaOut, type SpriteSpec } from './registry';
import { aim, createRig, KEY_DIR, keyDir, RIM_DIR, skyDir, type Rig } from './rig';

/**
 * The offline renderer: one model -> one transparent RGBA image at `scale` px per world px, lit by the rig,
 * anti-aliased and softened by accumulating jittered samples in float, tone mapped (Khronos PBR Neutral, so
 * palette colours stay true), plus an optional blurred glow image of its emissive parts.
 */

export const WORLD_SCALE = 5;
export const ICON_SCALE = 8;
const DEFAULT_SAMPLES = 32;
const DEFAULT_BLOOM = 0.35;
/** Room around the model's projected bounds (world px): soft shadow edges and bloom. */
const MARGIN = 10;

export interface Image {
  width: number;
  height: number;
  /** Straight (not premultiplied) RGBA, 8 bit, top row first. */
  data: Uint8ClampedArray;
}

export interface Rendered {
  id: string;
  image: Image;
  /** Box size in world px and anchor as fractions (what the game's Baked texture uses). */
  w: number;
  h: number;
  ax: number;
  ay: number;
  scale: number;
  meta: MetaOut;
  /** The object without its shadow, world px relative to the anchor (UI thumbnails crop to it). */
  body: { x: number; y: number; w: number; h: number };
  glow?: Omit<Rendered, 'glow' | 'meta' | 'body'>;
}

/** Linear float RGBA (premultiplied) of a whole render box. */
interface Float {
  width: number;
  height: number;
  data: Float32Array;
}

export class ArtRenderer {
  readonly renderer: WebGLRenderer;
  private readonly rig: Rig;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(new Color(0, 0, 0), 0);
    this.rig = createRig(this.renderer, 2048);
  }

  /** Full images of work bases (kit/loop.ts) by loop, view and samples: the frames are overlays on them. */
  private readonly bases = new Map<string, Image>();

  render(spec: SpriteSpec): Rendered {
    this.turnRig();
    const kit = new Kit();
    const root = new Group();
    root.add(spec.build(kit));
    root.updateMatrixWorld(true);
    if (spec.loop?.role === 'base') stripMoving(root, spec.loop.ref);
    const fitted = spec.box ? fitToBox(root, spec.box) : 1;
    // a loop's sprites share the union of its frames' bounds: same box, same shadow camera, same static pixels
    const bounds = spec.loop ? analyse(spec.loop.ref).bounds.clone() : new Box3().setFromObject(root, true);
    const o = optionsOf(spec);
    const box = spec.box ? fixedBox(spec.box) : looseBox(bounds, o.ground);
    this.rig.scene.add(root);
    const lit = this.accumulate(bounds, box, o);
    const glowFloat = o.emissive ? this.emissivePass(root, box, o.scale) : null;
    this.rig.scene.remove(root);
    disposeTree(root);
    const top = (kit.topAt ?? bounds.max.y / fitted) * topPx() * fitted;
    const meta = metaOf(kit, top, fitted);
    let full = lightImage(spec, lit, glowFloat, o.scale);
    if (spec.loop?.role === 'base') this.keepBase(this.baseKey(spec, o.samples), full);
    if (spec.loop?.role === 'frame') {
      meta.fps = spec.loop.ref.fps;
      full = overlay(full, this.baseFor(spec, o.samples));
    }
    return finish(spec, full, glowFloat, box, o.scale, meta);
  }

  private baseKey(spec: SpriteSpec, samples: number): string {
    return `${spec.loop?.ref.key ?? spec.id}|${artView()}|${samples}`;
  }

  /** Keeps a few work bases (they are big; a category renders its loops one after the other). */
  private keepBase(key: string, img: Image): void {
    this.bases.delete(key);
    this.bases.set(key, img);
    while (this.bases.size > 6) this.bases.delete(this.bases.keys().next().value!);
  }

  /** The work base of a frame's loop, rendered first when it is not cached (an `--ids` run of frames only). */
  private baseFor(spec: SpriteSpec, samples: number): Image {
    const key = this.baseKey(spec, samples);
    const hit = this.bases.get(key);
    if (hit) return hit;
    const ref = spec.loop!.ref;
    this.render({ ...spec, samples, id: workBaseId(ref.key), build: (k) => ref.build(k, 0), loop: { ref, role: 'base' } });
    return this.bases.get(key)!;
  }

  /** Turns the rim light and the reflections with the view (the key is turned per sample in `accumulate`). */
  private turnRig(): void {
    const yaw = viewYaw();
    this.rig.rim.position.copy(turned(RIM_DIR)).multiplyScalar(20);
    this.rig.scene.environmentRotation.set(0, yaw, 0);
  }

  /** Renders `n` frames of the scene into one float target and averages them; `before(i)` sets up frame i. */
  private average(box: PxBox, scale: number, n: number, before: (i: number) => void): Float {
    const width = Math.round((box.right - box.left) * scale);
    const height = Math.round((box.bottom - box.top) * scale);
    const rt = new WebGLRenderTarget(width, height, { type: FloatType, depthBuffer: true });
    const buf = new Float32Array(width * height * 4);
    const acc = new Float32Array(width * height * 4);
    for (let i = 0; i < n; i++) {
      before(i);
      const [jx, jy] = jitter(i);
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
      this.renderer.render(this.rig.scene, isoCamera(box, scale, jx, jy));
      this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, buf);
      for (let k = 0; k < acc.length; k++) acc[k]! += buf[k]!;
    }
    this.renderer.setRenderTarget(null);
    rt.dispose();
    for (let k = 0; k < acc.length; k++) acc[k]! /= n;
    return { width, height, data: acc };
  }

  /** The lit picture: jittered sub-pixel camera, soft key light and one sky direction per sample. */
  private accumulate(bounds: Box3, box: PxBox, o: Options): Float {
    const sphere = bounds.getBoundingSphere(new Sphere());
    const reach = new Sphere(sphere.center.clone().setY(sphere.center.y * 0.5), sphere.radius * 1.15 + 0.2);
    this.rig.ground.visible = o.ground;
    (this.rig.ground.material as Material & { opacity: number }).opacity = o.shadow;
    return this.average(box, o.scale, o.samples, (i) => {
      aim(this.rig.key, turned(keyDir(i, o.samples)), reach.center, reach.radius);
      aim(this.rig.sky, skyDir((i * 7) % o.samples, o.samples), reach.center, reach.radius);
    });
  }

  /** The emissive parts alone (everything else black, so it still hides what is behind it). */
  private emissivePass(root: Object3D, box: PxBox, scale: number): Float {
    const swapped = new Map<Mesh, Material | Material[]>();
    root.traverse((m) => {
      if (!(m instanceof Mesh)) return;
      swapped.set(m, m.material);
      m.material = glowMaterialOf(m.material as Material);
    });
    const scene = this.rig.scene;
    const env = scene.environment;
    scene.environment = null;
    this.rig.ground.visible = false;
    const out = this.average(box, scale, 4, () => {});
    scene.environment = env;
    for (const [m, mat] of swapped) m.material = mat;
    return out;
  }
}

interface Options {
  scale: number;
  ground: boolean;
  shadow: number;
  samples: number;
  /** Whether an emissive pass is needed (glow sprite or bloom). */
  emissive: boolean;
}

function optionsOf(spec: SpriteSpec): Options {
  const icon = spec.box !== undefined;
  return {
    scale: spec.scale ?? (icon ? ICON_SCALE : WORLD_SCALE),
    ground: (spec.ground ?? (icon ? 'none' : 'shadow')) === 'shadow',
    shadow: spec.shadow ?? 0.5,
    samples: spec.samples ?? DEFAULT_SAMPLES,
    emissive: spec.glow === true || (spec.bloom ?? DEFAULT_BLOOM) > 0,
  };
}

/** A light direction turned with the view (`viewYaw`), so light keeps its place on screen. */
function turned(dir: Vector3): Vector3 {
  return dir.clone().applyAxisAngle(new Vector3(0, 1, 0), viewYaw());
}

/** Sub-pixel offsets of sample i (a 4x4 rotated grid, repeated). */
function jitter(i: number): [number, number] {
  const k = i % 16;
  return [((k % 4) + 0.5) / 4 - 0.5 + ((k >> 2) - 1.5) * 0.06, ((k >> 2) + 0.5) / 4 - 0.5];
}

/** The material a mesh wears in the glow pass: its emissive colour, or black (it still hides what is behind). */
function glowMaterialOf(mat: Material): Material {
  const m = mat as Material & { emissive?: Color; emissiveIntensity?: number };
  const lit = m.userData.glow && m.emissive;
  const out = new MeshBasicMaterial({ color: lit ? m.emissive!.clone().multiplyScalar(m.emissiveIntensity ?? 1) : 0x000000 });
  out.clippingPlanes = mat.clippingPlanes;
  out.side = mat.side;
  out.transparent = mat.transparent;
  out.visible = mat.visible && !(mat.transparent && !lit);
  return out;
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
  });
}

/** Projected bounds of a box3 (world px around the anchor), optionally with its shadow on the ground. */
function looseBox(b: Box3, shadow: boolean): PxBox {
  const pts: Vector3[] = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new Vector3(x, y, z));
  if (shadow) {
    const k = turned(KEY_DIR);
    const extra = pts.map((p) => new Vector3(p.x - (k.x / k.y) * p.y * 1.15, 0, p.z - (k.z / k.y) * p.y * 1.15));
    pts.push(...extra);
  }
  const s = pts.map((p) => project(p.x, p.y, p.z));
  const m = MARGIN + (shadow ? 6 : 0);
  return {
    left: Math.floor(Math.min(...s.map((p) => p.x)) - m),
    right: Math.ceil(Math.max(...s.map((p) => p.x)) + m),
    top: Math.floor(Math.min(...s.map((p) => p.y)) - m),
    bottom: Math.ceil(Math.max(...s.map((p) => p.y)) + m),
  };
}

function fixedBox(f: NonNullable<SpriteSpec['box']>): PxBox {
  const ax = f.ax ?? 0.5;
  const ay = f.ay ?? 0.5;
  return { left: -ax * f.w, right: (1 - ax) * f.w, top: -ay * f.h, bottom: (1 - ay) * f.h };
}

/** Scales and moves the model so its projected bounds fill the fixed box around the anchor; returns the scale. */
function fitToBox(root: Group, f: NonNullable<SpriteSpec['box']>): number {
  const b = new Box3().setFromObject(root, true);
  const px = looseBox(b, false);
  const bw = px.right - px.left - MARGIN * 2;
  const bh = px.bottom - px.top - MARGIN * 2;
  const target = fixedBox(f);
  const fill = f.fill ?? 0.86;
  const s = fill * Math.min((target.right - target.left) / bw, (target.bottom - target.top) / bh);
  const cx = ((px.left + px.right) / 2) * s - (target.left + target.right) / 2;
  const cy = ((px.top + px.bottom) / 2) * s - (target.top + target.bottom) / 2;
  root.scale.setScalar(s);
  root.position.copy(screenRight().multiplyScalar(-cx)).setY(cy / heightPx());
  root.updateMatrixWorld(true);
  return s;
}

/* ---------- Float -> 8-bit, glow, trim ---------- */

const neutral = (c: [number, number, number]): [number, number, number] => {
  const x = Math.min(c[0], c[1], c[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let r = c[0] - offset;
  let g = c[1] - offset;
  let b = c[2] - offset;
  const start = 0.76;
  const peak = Math.max(r, g, b);
  if (peak < start) return [r, g, b];
  const d = 1 - start;
  const np = 1 - (d * d) / (peak + d - start);
  r *= np / peak;
  g *= np / peak;
  b *= np / peak;
  const t = 1 - 1 / (0.15 * (peak - np) + 1);
  return [r + (np - r) * t, g + (np - g) * t, b + (np - b) * t];
};

const srgb = (v: number): number => {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};

/** Premultiplied linear float (bottom row first, as read from GL) -> straight sRGB 8 bit (top row first). */
function toImage(f: Float, exposure: number): Image {
  const out = new Uint8ClampedArray(f.width * f.height * 4);
  for (let y = 0; y < f.height; y++) {
    const src = (f.height - 1 - y) * f.width * 4;
    const dst = y * f.width * 4;
    for (let x = 0; x < f.width * 4; x += 4) {
      const a = Math.min(1, f.data[src + x + 3]!);
      if (a < 1 / 512) continue;
      const c = neutral([(f.data[src + x]! / a) * exposure, (f.data[src + x + 1]! / a) * exposure, (f.data[src + x + 2]! / a) * exposure]);
      out[dst + x] = srgb(c[0]) * 255;
      out[dst + x + 1] = srgb(c[1]) * 255;
      out[dst + x + 2] = srgb(c[2]) * 255;
      out[dst + x + 3] = a * 255;
    }
  }
  return { width: f.width, height: f.height, data: out };
}

/** Blurs an opaque linear glow buffer with the 2D canvas filter (radius in output px); returns linear floats. */
function blurGlow(f: Float, radius: number): Float {
  const canvas = document.createElement('canvas');
  canvas.width = f.width;
  canvas.height = f.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.createImageData(f.width, f.height);
  for (let i = 0, p = 0; i < f.data.length; i += 4, p += 4) {
    img.data[p] = Math.sqrt(Math.min(1, f.data[i]! / 4)) * 255;
    img.data[p + 1] = Math.sqrt(Math.min(1, f.data[i + 1]! / 4)) * 255;
    img.data[p + 2] = Math.sqrt(Math.min(1, f.data[i + 2]! / 4)) * 255;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = f.width;
  out.height = f.height;
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.fillStyle = '#000';
  octx.fillRect(0, 0, f.width, f.height);
  octx.filter = `blur(${radius}px)`;
  octx.drawImage(canvas, 0, 0);
  octx.filter = `blur(${radius * 0.35}px)`;
  octx.globalCompositeOperation = 'lighter';
  octx.drawImage(canvas, 0, 0);
  const data = octx.getImageData(0, 0, f.width, f.height).data;
  const res = new Float32Array(f.data.length);
  for (let i = 0; i < data.length; i++) res[i] = (data[i]! / 255) ** 2 * 4 * 0.5;
  return { width: f.width, height: f.height, data: res };
}

/** Adds a glow onto premultiplied light (rgb and coverage), in place. */
function addBloom(lit: Float, glow: Float, k: number): void {
  for (let i = 0; i < lit.data.length; i += 4) {
    const r = glow.data[i]! * k;
    const g = glow.data[i + 1]! * k;
    const b = glow.data[i + 2]! * k;
    const m = Math.min(1, Math.max(r, g, b));
    const a = lit.data[i + 3]!;
    const na = Math.min(1, a + m * (1 - a));
    lit.data[i] = lit.data[i]! + r;
    lit.data[i + 1] = lit.data[i + 1]! + g;
    lit.data[i + 2] = lit.data[i + 2]! + b;
    lit.data[i + 3] = na;
  }
}

/** The glow sprite: colour normalised to its brightest channel, alpha = brightness (drawn additively). */
function glowImage(glow: Float): Image {
  const out = new Uint8ClampedArray(glow.width * glow.height * 4);
  for (let y = 0; y < glow.height; y++) {
    const src = (glow.height - 1 - y) * glow.width * 4;
    const dst = y * glow.width * 4;
    for (let x = 0; x < glow.width * 4; x += 4) {
      const r = glow.data[src + x]!;
      const g = glow.data[src + x + 1]!;
      const b = glow.data[src + x + 2]!;
      const m = Math.max(r, g, b);
      if (m < 1 / 255) continue;
      const a = Math.min(1, m);
      out[dst + x] = srgb(r / m) * 255;
      out[dst + x + 1] = srgb(g / m) * 255;
      out[dst + x + 2] = srgb(b / m) * 255;
      out[dst + x + 3] = Math.sqrt(a) * 255;
    }
  }
  return { width: glow.width, height: glow.height, data: out };
}

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounds of pixels with alpha above `min`, snapped outwards to whole world px (multiples of `scale`). */
function alphaCrop(img: Image, scale: number, min = 1): Crop {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! <= min) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: scale, h: scale };
  const sx0 = Math.floor(x0 / scale) * scale;
  const sy0 = Math.floor(y0 / scale) * scale;
  const sx1 = Math.min(img.width, Math.ceil((x1 + 1) / scale) * scale);
  const sy1 = Math.min(img.height, Math.ceil((y1 + 1) / scale) * scale);
  return { x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0 };
}

function crop(img: Image, c: Crop): Image {
  const out = new Uint8ClampedArray(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) out.set(img.data.subarray(((c.y + y) * img.width + c.x) * 4, ((c.y + y) * img.width + c.x + c.w) * 4), y * c.w * 4);
  return { width: c.w, height: c.h, data: out };
}

function place(img: Image, box: PxBox, scale: number, trim: boolean): { image: Image; w: number; h: number; ax: number; ay: number } {
  const c = trim ? alphaCrop(img, scale, 4) : { x: 0, y: 0, w: img.width, h: img.height };
  const image = trim ? crop(img, c) : img;
  const anchorX = -box.left * scale - c.x;
  const anchorY = -box.top * scale - c.y;
  return { image, w: c.w / scale, h: c.h / scale, ax: anchorX / c.w, ay: anchorY / c.h };
}

/** The lit picture with its bloom, as straight sRGB 8 bit (the whole render box). */
function lightImage(spec: SpriteSpec, lit: Float, emis: Float | null, scale: number): Image {
  const bloom = spec.bloom ?? DEFAULT_BLOOM;
  if (emis && bloom > 0) addBloom(lit, blurGlow(emis, 3 * scale), bloom);
  return toImage(lit, spec.exposure ?? 1);
}

/** Premultiplied channel differences below this (of 1) count as "the same pixel" between a frame and its base. */
const SAME = 3 / 255;

/**
 * The overlay that turns `base` into `frame` when drawn over it (straight alpha, source-over, as the game draws
 * sprites): transparent where they match, else the smallest alpha that reproduces the frame's pixel.
 */
export function overlay(frame: Image, base: Image): Image {
  const out = new Uint8ClampedArray(frame.data.length);
  const f = frame.data;
  const b = base.data;
  for (let p = 0; p < f.length; p += 4) {
    const fa = f[p + 3]! / 255;
    const ba = b[p + 3]! / 255;
    let same = Math.abs(fa - ba) <= SAME;
    for (let c = 0; c < 3 && same; c++) same = Math.abs((f[p + c]! / 255) * fa - (b[p + c]! / 255) * ba) <= SAME;
    if (same) continue;
    overlayPixel(f, b, p, fa, ba, out);
  }
  return { width: frame.width, height: frame.height, data: out };
}

/** One differing pixel of `overlay`: alpha from the coverage, raised until every channel fits in 0..alpha. */
function overlayPixel(f: Uint8ClampedArray, b: Uint8ClampedArray, p: number, fa: number, ba: number, out: Uint8ClampedArray): void {
  let a = ba >= 0.999 ? 1 : Math.max(0, (fa - ba) / (1 - ba));
  for (let c = 0; c < 3; c++) {
    const fc = (f[p + c]! / 255) * fa;
    const bc = (b[p + c]! / 255) * ba;
    if (bc > fc && bc > 0) a = Math.max(a, (bc - fc) / bc);
    if (fc > bc && bc < 1) a = Math.max(a, (fc - bc) / (1 - bc));
  }
  a = Math.min(1, a);
  if (a < 1 / 255) return;
  for (let c = 0; c < 3; c++) {
    const o = (f[p + c]! / 255) * fa - (b[p + c]! / 255) * ba * (1 - a);
    out[p + c] = (Math.min(a, Math.max(0, o)) / a) * 255;
  }
  out[p + 3] = a * 255;
}

function finish(spec: SpriteSpec, full: Image, emis: Float | null, box: PxBox, scale: number, meta: MetaOut): Rendered {
  const trim = !spec.box;
  const main = place(full, box, scale, trim);
  const solid = alphaCrop(full, 1, 200);
  const body = { x: solid.x / scale + box.left, y: solid.y / scale + box.top, w: solid.w / scale, h: solid.h / scale };
  const out: Rendered = { id: spec.id, ...main, scale, meta, body };
  if (spec.glow && emis) out.glow = { id: `${spec.id}-glow`, ...place(glowImage(blurGlow(emis, 4 * scale)), box, scale, trim), scale };
  return out;
}
