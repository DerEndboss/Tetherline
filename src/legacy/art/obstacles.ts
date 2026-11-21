import type { ObstacleDef, ObstacleShape, WorldPalette } from '../content/types';
import { mix, shade } from './color';
import { rand, range, type Rand } from './rand';
import {
  box,
  crystal,
  drawContact,
  drawShadow,
  drawSolids,
  lathe,
  lean,
  overlay,
  project,
  rock,
  rotateX,
  rotateY,
  rotateZ,
  topPoint,
  transform,
  type Material,
  type Rig,
  type Solid,
  type V3,
  Z_PX_PER_TILE,
} from './solid';
import { circle, ellipse, polyline, type Pt, type SpriteArt, type SpriteMeta, Svg } from './svg';

/** Sprite box for obstacles. The tile centre sits at ORIGIN; there is room right for the cast shadow. */
const W = 216;
const H = 240;
const ORIGIN: Pt = { x: 84, y: 200 };

/** Procedural variants per shape; the renderer picks one per obstacle from its uid. */
export const OBSTACLE_VARIANTS = 4;

export const obstacleId = (kind: string, variant: number): string => `obstacle-${kind}-${variant}`;
export const obstacleGlowId = (kind: string, variant: number): string => `obstacle-${kind}-${variant}-glow`;

/** How far each shape reaches above its tile centre, in world px (for tap picking). */
export const SHAPE_REACH: Record<ObstacleShape, number> = { boulder: 72, crystal: 104, wreck: 76, scrub: 66, monolith: 176 };

interface ShapeOut {
  /** Body, drawn into the sprite. */
  draw: (svg: Svg, rig: Rig) => void;
  /** Emissive parts drawn again into the additive glow sprite (pulses), if any. */
  glow?: (svg: Svg, rig: Rig) => void;
  meta: SpriteMeta;
}

type ShapeArt = (r: Rand, def: ObstacleDef, palette: WorldPalette, rig: Rig, variant: number) => ShapeOut;

const rel = (p: Pt): Pt => ({ x: Math.round(p.x - ORIGIN.x), y: Math.round(p.y - ORIGIN.y) });

function materials(def: ObstacleDef): Material {
  return { main: def.colors[0], dark: def.colors[1] };
}

/** Ground rock for bases of crystals and monoliths, taken from the world's ground tones. */
function groundRock(palette: WorldPalette): Material {
  const g = palette.ground;
  return { main: shade(g[g.length - 1]!, 0.12), dark: g[0]! };
}

/* ---------- Boulder: chunky low-poly rocks in clusters ---------- */

const BOULDER_LAYOUTS: (readonly [x: number, y: number, r: number, h: number, sides: number])[][] = [
  [[0.02, -0.04, 0.46, 54, 6], [0.34, 0.28, 0.16, 18, 5], [-0.34, 0.24, 0.11, 11, 5]],
  [[-0.18, -0.14, 0.36, 50, 6], [0.22, 0.14, 0.31, 34, 6], [-0.14, 0.36, 0.12, 12, 5]],
  [[0.02, -0.06, 0.34, 76, 5], [0.34, 0.14, 0.19, 26, 6], [-0.3, 0.2, 0.15, 16, 5], [0.08, 0.38, 0.1, 9, 5]],
  [[0, 0.02, 0.5, 30, 7], [-0.14, -0.12, 0.27, 50, 5], [0.36, 0.26, 0.13, 13, 5]],
];

const boulder: ShapeArt = (r, def, palette, _rig, variant) => {
  const mat = { ...materials(def), main: drift(def.colors[0], palette, variant) };
  const layout = BOULDER_LAYOUTS[variant % BOULDER_LAYOUTS.length]!;
  const solids = layout.map(([x, y, rad, h, sides]) => rock(r, x, y, rad, h, mat, sides));
  return {
    draw: (svg, rig) => {
      drawShadow(svg, rig, solids);
      drawContact(svg, rig, 0, 0, 0.52, 0.45);
      drawSolids(svg, rig, solids);
    },
    meta: { top: Math.max(...layout.map((l) => l[3])), glints: [] },
  };
};

/* ---------- Crystal rubble: glowing prisms out of a rock bed ---------- */

const crystalShape: ShapeArt = (r, def, palette, rig) => {
  const glow = def.glow ?? def.colors[0];
  const gem: Material = { main: def.colors[0], dark: def.colors[1], emissive: true, outline: shade(def.colors[1], -0.55) };
  const bed = [rock(r, -0.12, 0.12, 0.26, 18, groundRock(palette)), rock(r, 0.22, 0.04, 0.2, 14, groundRock(palette))];
  const count = 3 + Math.floor(r() * 3);
  const gems: Solid[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.6;
    const d = i === 0 ? 0 : range(r, 0.12, 0.26);
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    const h = i === 0 ? range(r, 44, 62) : range(r, 16, 38);
    const leanK = i === 0 ? 0.0012 : 0.0045;
    gems.push(crystal(cx, cy, i === 0 ? 0.12 : range(r, 0.06, 0.1), h, h * 0.32, cx * leanK * 9, cy * leanK * 9, gem, 6, r()));
  }
  gems.sort((a, b) => a.verts[0]!.x + a.verts[0]!.y - (b.verts[0]!.x + b.verts[0]!.y));
  const tips = gems.map((g) => topPoint(rig, g));
  const halo = (svg: Svg, strength: number): void => {
    const c = project(rig, { x: 0, y: 0, z: 34 });
    const fill = svg.radial(c.x, c.y, 62, [
      [0, glow, strength],
      [0.45, glow, strength * 0.35],
      [1, glow, 0],
    ]);
    svg.add(ellipse(c.x, c.y, 62, 56, fill));
  };
  return {
    draw: (svg) => {
      drawShadow(svg, rig, [...bed, ...gems], 0.36);
      drawContact(svg, rig, 0, 0, 0.46, 0.4);
      halo(svg, 0.16);
      drawSolids(svg, rig, bed);
      drawSolids(svg, rig, gems, { rim: 0.8 });
    },
    glow: (svg) => {
      halo(svg, 0.34);
      for (const t of tips) svg.add(circle(t.x, t.y + 6, 6, glow, `opacity="0.55" ${svg.blur(3)}`));
    },
    meta: { top: Math.max(...tips.map((t) => ORIGIN.y - t.y)), glints: tips.map(rel) },
  };
};

/* ---------- Wreckage: a sunken fuel tank, a tipped cargo container, leaning hull plates ---------- */

interface Kit {
  hull: Material;
  stripe: Material;
  dark: Material;
}

/** A fuel tank lying on its side, half sunk, with two stripes, and a torn plate beside it. */
function fuelTank(r: Rand, k: Kit): Solid[] {
  const turn = range(r, -0.5, 0.5);
  const lay = (s: Solid): Solid => transform(s, (v) => rotateZ(0, 0, turn)(rotateY(0, 10, Math.PI / 2)(v)));
  const body = lay(lathe(0, 0, [[0.1, -42], [0.21, -36], [0.25, -26], [0.25, 26], [0.21, 36], [0.1, 42]], 12, k.hull));
  const bands = [-18, 10].map((z) => overlay(lay(lathe(0, 0, [[0.258, z], [0.258, z + 7]], 12, { ...k.stripe, bare: true }, 0, true))));
  const plate = transform(box(0.12, 0.2, -6, 0.3, 0.05, 24, k.hull), (v) => rotateZ(0.25, 0.2, 0.7)(lean(0.008, -0.002)(v)));
  return [plate, body, ...bands];
}

/** A cargo container tipped into the ground, ribbed along its side, with a stripe and a dented lid. */
function container(r: Rand, k: Kit): Solid[] {
  const turn = range(r, -0.4, 0.4);
  const place = (v: V3): V3 => rotateZ(0, 0, turn)(rotateY(0, -8, range(r, 0.12, 0.22))(v));
  const body = transform(box(-0.36, -0.2, -8, 0.72, 0.4, 36, k.hull), place);
  const ribs = [-0.24, -0.08, 0.08, 0.24].map((x) =>
    transform(box(x - 0.025, 0.2, -6, 0.05, 0.018, 32, { ...k.hull, bare: true }), place),
  );
  const stripe = overlay(transform(box(-0.365, -0.205, 18, 0.73, 0.41, 7, { ...k.stripe, bare: true }, true), place));
  const debris = rock(r, 0.34, 0.3, 0.1, 10, { main: shade(k.hull.main, -0.25), dark: k.hull.dark });
  return [body, stripe, ...ribs, debris];
}

/** One hull plate in panel segments (each its own outline = panel lines); the last one torn off and bent. */
function panelled(x: number, y: number, len: number, h: number, mat: Material, place: (v: V3) => V3): Solid[] {
  const seg = len / 3;
  return [0, 1, 2].map((i) => {
    const torn = i === 2;
    const s = box(x + i * seg + 0.01, y, -6, seg - 0.02, 0.05, torn ? h * 0.7 : h, mat);
    return transform(s, (v) => place(torn ? rotateX(y, -6, -0.25)(v) : v));
  });
}

/** Two hull plates leaning into each other like a tent, one with a hazard stripe, a rib in front. */
function hullPlates(r: Rand, k: Kit): Solid[] {
  const rot = rotateZ(0, 0, range(r, -0.3, 0.3));
  const back = panelled(-0.36, -0.24, 0.72, 46, k.hull, (v) => rot(rotateX(-0.21, -6, -0.5)(v)));
  const front = panelled(-0.32, 0.12, 0.64, 40, k.hull, (v) => rot(rotateX(0.15, -6, 0.55)(v)));
  const stripe = overlay(transform(box(-0.33, 0.112, 18, 0.43, 0.07, 9, { ...k.stripe, bare: true }, true), (v) => rot(rotateX(0.15, -6, 0.55)(v))));
  const rib = transform(box(-0.04, -0.3, -4, 0.08, 0.62, 8, k.dark), rot);
  return [rib, ...back, ...front, stripe];
}

const WRECK_PARTS = [fuelTank, container, hullPlates, fuelTank];

const wreck: ShapeArt = (r, def, _palette, rig, variant) => {
  const accent = def.glow ?? '#ffb35c';
  const kit: Kit = {
    hull: materials(def),
    stripe: { main: accent, dark: shade(accent, -0.55) },
    dark: { main: shade(def.colors[1], -0.2), dark: shade(def.colors[1], -0.6) },
  };
  const solids = WRECK_PARTS[variant % WRECK_PARTS.length]!(r, kit);
  const peaks = solids.map((s) => topPoint(rig, s));
  const top = peaks.reduce((a, b) => (b.y < a.y ? b : a));
  const beacon: Pt = { x: top.x, y: top.y - 3 };
  return {
    draw: (svg) => {
      drawShadow(svg, rig, solids, 0.4);
      drawContact(svg, rig, 0, 0, 0.5, 0.45);
      drawSolids(svg, rig, solids);
      svg.add(circle(beacon.x, beacon.y, 3.4, shade(accent, 0.45), `stroke="${shade(accent, -0.6)}" stroke-width="1.3"`));
    },
    glow: (svg) => {
      svg.add(circle(beacon.x, beacon.y, 10, accent, `opacity="0.9" ${svg.blur(3.5)}`));
    },
    meta: {
      top: ORIGIN.y - top.y,
      glints: [rel(beacon)],
      lights: [{ ...rel(beacon), color: accent, r: 18, phase: r() }],
    },
  };
};

/* ---------- Thornscrub: a clump of spiky alien fronds with glowing bulbs on curled stalks ---------- */

interface Frond {
  /** Angle on screen, 0 = straight up, negative = left. */
  a: number;
  len: number;
  width: number;
}

/** A tapered, slightly curved blade from `root`, as a closed path with its midrib. */
function frondPath(root: Pt, f: Frond): { blade: string; rib: string; tip: Pt } {
  const dir = { x: Math.sin(f.a), y: -Math.cos(f.a) };
  const side = { x: -dir.y, y: dir.x };
  const bend = f.a * 0.45;
  const tip = { x: root.x + dir.x * f.len + Math.sin(f.a + bend) * f.len * 0.25, y: root.y + dir.y * f.len * 0.9 };
  const mid = { x: root.x + dir.x * f.len * 0.55, y: root.y + dir.y * f.len * 0.55 };
  const l = { x: mid.x + side.x * f.width, y: mid.y + side.y * f.width };
  const rr = { x: mid.x - side.x * f.width, y: mid.y - side.y * f.width };
  const n = (v: number): string => v.toFixed(1);
  const blade =
    `M${n(root.x + side.x * f.width * 0.5)},${n(root.y + side.y * f.width * 0.5)} ` +
    `Q${n(l.x)},${n(l.y)} ${n(tip.x)},${n(tip.y)} ` +
    `Q${n(rr.x)},${n(rr.y)} ${n(root.x - side.x * f.width * 0.5)},${n(root.y - side.y * f.width * 0.5)} Z`;
  const rib = `M${n(root.x)},${n(root.y)} Q${n(mid.x)},${n(mid.y)} ${n(tip.x)},${n(tip.y)}`;
  return { blade, rib, tip };
}

function curl(r: Rand, root: Pt, len: number, side: number): Pt[] {
  const pts: Pt[] = [root];
  let a = side * range(r, 0.05, 0.2);
  let p = root;
  for (let i = 0; i < 4; i++) {
    a += side * 0.2;
    p = { x: p.x + Math.sin(a) * len * 0.25, y: p.y - Math.cos(a) * len * 0.25 };
    pts.push(p);
  }
  return pts;
}

/** Per-variant colour drift so a field of one kind is not one flat colour: warmer, cooler, lighter. */
function drift(color: string, palette: WorldPalette, variant: number): string {
  const towards = [color, palette.sky.horizon, palette.sky.mid, palette.dust][variant % 4]!;
  return mix(color, towards, variant % 4 === 0 ? 0 : 0.16);
}

const scrub: ShapeArt = (r, def, palette, rig, variant) => {
  const main = drift(def.colors[0], palette, variant);
  const dark = def.colors[1];
  const glow = def.glow ?? main;
  const o = project(rig, { x: 0, y: 0, z: 0 });
  const root = { x: o.x, y: o.y - 4 };
  const count = 9 + Math.floor(r() * 4);
  const fronds: Frond[] = Array.from({ length: count }, (_, i) => {
    const t = -1 + (i / (count - 1)) * 2;
    return { a: t * 1.05 + range(r, -0.1, 0.1), len: range(r, 46, 64) * (1 - Math.abs(t) * 0.38), width: range(r, 7.5, 10.5) };
  });
  const order = [...fronds].sort((a, b) => Math.abs(a.a) - Math.abs(b.a));
  // One variant in four carries a single bulb: a field of scrub stays calm, the bulbs stay a find.
  const stalks = Array.from({ length: [0, 0, 0, 1][variant % 4]! }, (_, i) => curl(r, { x: root.x + (i - 0.5) * 10, y: root.y - 14 }, range(r, 50, 70), i % 2 ? 1 : -1));
  const bulbs = stalks.map((s) => s[s.length - 1]!);
  const outline = mix(shade(dark, -0.5), palette.shadow, 0.5);
  const paths = order.map((f) => frondPath(root, f));
  return {
    draw: (svg) => {
      svg.add(ellipse(o.x + 24, o.y - 6, 46, 16, palette.shadow, `opacity="0.42" ${svg.blur(3)}`));
      drawContact(svg, rig, 0, 0, 0.42, 0.5);
      for (const s of stalks) svg.add(polyline(s, outline, 4.4), polyline(s, shade(dark, 0.25), 2.2));
      paths.forEach((p, i) => {
        const f = order[i]!;
        const lightSide = f.a < 0.2;
        const fill = svg.linear(root.x, root.y, p.tip.x, p.tip.y, [
          [0, dark],
          [0.55, lightSide ? main : mix(main, dark, 0.45)],
          [1, lightSide ? mix(shade(main, 0.25), palette.light, 0.2) : main],
        ]);
        svg.add(`<path d="${p.blade}" fill="${fill}" stroke="${outline}" stroke-width="1.8" stroke-linejoin="round"/>`);
        svg.add(`<path d="${p.rib}" fill="none" stroke="${shade(main, 0.35)}" stroke-opacity="0.45" stroke-width="1.1"/>`);
      });
      for (const b of bulbs) {
        svg.add(circle(b.x, b.y, 5.2, svg.radial(b.x - 1.5, b.y - 1.5, 6, [[0, mix(glow, '#ffffff', 0.7)], [0.45, shade(glow, 0.3)], [1, glow]]), `stroke="${outline}" stroke-width="1.4"`));
      }
    },
    glow:
      bulbs.length === 0
        ? undefined
        : (svg) => {
            for (const b of bulbs) svg.add(circle(b.x, b.y, 8, glow, `opacity="0.7" ${svg.blur(3)}`));
          },
    meta: { top: ORIGIN.y - Math.min(...bulbs.map((b) => b.y), ...paths.map((p) => p.tip.y)), glints: bulbs.map(rel) },
  };
};

/* ---------- Monolith: a tall leaning slab with glowing runes ---------- */

function slab(w: number, d: number, h: number, mat: Material): Solid {
  const ring = (k: number, z: number): V3[] => [
    { x: -w * k, y: -d * k, z },
    { x: w * k, y: -d * k, z },
    { x: w * k, y: d * k, z },
    { x: -w * k, y: d * k, z },
  ];
  const verts = [...ring(1, -6), ...ring(0.86, h * 0.86), ...ring(0.42, h)];
  const band = (a: number, b: number): number[][] => [0, 1, 2, 3].map((i) => [a + i, a + ((i + 1) % 4), b + ((i + 1) % 4), b + i]);
  return { verts, faces: [...band(0, 4), ...band(4, 8), [8, 9, 10, 11]], mat };
}

/** Rune glyphs on the slab's front-left face (y = +d), as 3D polylines before the slab's transform. */
function runes(r: Rand, w: number, d: number, h: number): V3[][] {
  const out: V3[][] = [];
  const y = d + 0.004;
  const glyph = (cx: number, z: number, s: number): V3[][] => {
    const kind = Math.floor(r() * 4);
    const p = (u: number, v: number): V3 => ({ x: cx + u * s, y, z: z + v * s * Z_PX_PER_TILE });
    if (kind === 0) return [[p(0, 1), p(0, -1)], [p(-0.6, 0.4), p(0, 0), p(0.6, 0.4)]];
    if (kind === 1) return [[p(-0.5, 1), p(0.5, 0.3), p(-0.5, -0.4), p(0.5, -1)]];
    if (kind === 2) return [[p(0, 1), p(0, -1)], [p(0, 0.2), p(0.6, 0.8)], [p(-0.5, -0.6), p(0.1, -0.6)]];
    return [[p(-0.6, 0.9), p(0.6, 0.9)], [p(0, 0.9), p(0, -1)], [p(-0.4, -0.3), p(0.4, -0.3)]];
  };
  const rows = 3;
  for (let i = 0; i < rows; i++) out.push(...glyph(range(r, -w * 0.25, w * 0.25), h * (0.26 + i * 0.19), w * 0.32));
  return out;
}

const monolith: ShapeArt = (r, def, palette, rig) => {
  const mat: Material = materials(def);
  const glow = def.glow ?? '#ffd98a';
  const w = range(r, 0.22, 0.28);
  const d = range(r, 0.12, 0.15);
  const h = range(r, 140, 166);
  const rot = rotateZ(0, 0, range(r, -0.35, 0.15));
  const tilt = lean(range(r, -0.0012, 0.0012), range(r, 0.0006, 0.0016));
  const place = (v: V3): V3 => rot(tilt(v));
  const body = transform(slab(w, d, h, mat), place);
  const rubble = [rock(r, 0.3, 0.24, 0.14, 16, groundRock(palette)), rock(r, -0.32, 0.26, 0.11, 12, groundRock(palette))];
  const lines = runes(r, w, d, h).map((l) => l.map((v) => project(rig, place(v))));
  const peak = topPoint(rig, body);
  return {
    draw: (svg) => {
      drawShadow(svg, rig, [body, ...rubble], 0.42, 3);
      drawContact(svg, rig, 0, 0, 0.46, 0.5);
      drawSolids(svg, rig, [body]);
      for (const l of lines) svg.add(polyline(l, shade(glow, 0.25), 2.4, 'opacity="0.95"'));
      drawSolids(svg, rig, rubble);
    },
    glow: (svg) => {
      for (const l of lines) svg.add(polyline(l, glow, 6, `opacity="0.9" ${svg.blur(2.5)}`));
    },
    meta: { top: ORIGIN.y - peak.y, glints: [rel(peak), ...lines.filter((_, i) => i % 2 === 0).map((l) => rel(l[0]!))] },
  };
};

const SHAPES: Record<ObstacleShape, ShapeArt> = { boulder, crystal: crystalShape, wreck, scrub, monolith };

export function obstacleRig(palette: WorldPalette): Rig {
  return { origin: ORIGIN, light: palette.light, shadow: palette.shadow, sky: palette.sky.mid };
}

/** All variants of one obstacle, plus a glow sprite per variant for shapes with emissive parts. */
export function obstacleSprites(def: ObstacleDef, palette: WorldPalette): SpriteArt[] {
  const rig = obstacleRig(palette);
  const out: SpriteArt[] = [];
  const base = { w: W, h: H, ax: ORIGIN.x / W, ay: ORIGIN.y / H };
  for (let v = 0; v < OBSTACLE_VARIANTS; v++) {
    const r = rand(hashString(def.id) + v * 7919);
    const shape = SHAPES[def.shape](r, def, palette, rig, v);
    const body = new Svg(W, H);
    shape.draw(body, rig);
    out.push({ id: obstacleId(def.id, v), ...base, svg: body.doc(), meta: shape.meta });
    if (!shape.glow) continue;
    const glow = new Svg(W, H);
    shape.glow(glow, rig);
    out.push({ id: obstacleGlowId(def.id, v), ...base, svg: glow.doc() });
  }
  return out;
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
