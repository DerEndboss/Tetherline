import { mix, shade } from './color';
import type { Rand } from './rand';
import { polyPts, type Pt, type Svg } from './svg';

/**
 * A tiny flat-shaded 3D renderer for SVG sprites. Objects are built from convex solids in grid space
 * (x, y in tiles, z in world px); every face is lit by the same light rig, so rocks, crystals, buildings
 * and drones share one consistent light (docs/art-direction.md, "Light"). Only front faces are drawn,
 * back to front, then the solid's outline and a rim light on the edges that face the key light.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** World px per tile of height in the 2:1 projection (camera elevation 30 degrees). */
export const Z_PX_PER_TILE = 78.4;

export interface Material {
  /** Colour of a face in full light. */
  main: string;
  /** Colour of a face turned away from the light. */
  dark: string;
  /** Emissive: barely darkens away from the light (crystals, glass, lamps). */
  emissive?: boolean;
  /** Outline colour; defaults to the dark colour pushed towards the shadow tint. */
  outline?: string;
  /** No outline for this solid (small parts sitting on a bigger outlined solid). */
  bare?: boolean;
}

export interface Solid {
  verts: V3[];
  /** Vertex indices per face. Winding does not matter: normals are oriented away from the centroid. */
  faces: number[][];
  mat: Material;
  /** Draw layer: overlays (bands, stripes, windows) use 1 so they land on top of the body they wrap. */
  layer?: number;
}

/** Marks a solid as an overlay that is drawn after the solids of layer 0. */
export function overlay(s: Solid): Solid {
  return { ...s, layer: 1 };
}

/** Where grid (0, 0, z = 0) sits in the sprite, plus the shared light colours. */
export interface Rig {
  origin: Pt;
  light: string;
  shadow: string;
  sky: string;
}

type Vec = [number, number, number];

/** Direction towards the key light (left and a little behind on screen, high): warm dusk sun. */
const LIGHT: Vec = norm([-0.35, 0.75, 0.95]);
/** Direction towards the camera. */
const VIEW: Vec = norm([0.612, 0.612, 0.5]);
/** Screen offset of a cast shadow per world px of height: falls right and a little up. */
export const SHADOW_DX = 0.42;
export const SHADOW_DY = -0.08;

function norm(v: Vec): Vec {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Grid point to true 3D units (z in tiles), so normals and lighting are geometric. */
const unit = (v: V3): Vec => [v.x, v.y, v.z / Z_PX_PER_TILE];

export function project(rig: Rig, v: V3): Pt {
  return { x: rig.origin.x + (v.x - v.y) * 64, y: rig.origin.y + (v.x + v.y) * 32 - v.z };
}

function centroid(vs: readonly V3[]): Vec {
  const c: Vec = [0, 0, 0];
  for (const v of vs) {
    const u = unit(v);
    c[0] += u[0];
    c[1] += u[1];
    c[2] += u[2];
  }
  return [c[0] / vs.length, c[1] / vs.length, c[2] / vs.length];
}

/** Newell's method: robust normal for any (also slightly non-planar) polygon, oriented away from `inside`. */
function faceNormal(face: readonly V3[], inside: Vec): Vec {
  const n: Vec = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = unit(face[i]!);
    const b = unit(face[(i + 1) % face.length]!);
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const c = centroid(face);
  const out = norm(n);
  const away: Vec = [c[0] - inside[0], c[1] - inside[1], c[2] - inside[2]];
  return dot(out, away) < 0 ? [-out[0], -out[1], -out[2]] : out;
}

/** Face colour from the light rig: warm key light, cool sky fill on up-facing faces, cool bounce on the right. */
export function lit(mat: Material, n: Vec, rig: Rig): string {
  const d = Math.max(0, dot(n, LIGHT));
  const up = Math.max(0, n[2]);
  if (mat.emissive) return mix(mix(mat.dark, mat.main, 0.45 + 0.55 * d), '#ffffff', 0.18 * d * d);
  let c = mix(mat.dark, mat.main, Math.min(1, 0.1 + d * 1.15));
  c = mix(c, rig.light, 0.18 * d * d + 0.22 * up * up * d);
  c = mix(c, rig.sky, 0.14 * up * (1 - d));
  const bounce = Math.max(0, n[0] - Math.max(0, n[1]));
  return mix(c, rig.sky, 0.12 * bounce);
}

interface DrawnFace {
  pts: Pt[];
  depth: number;
  color: string;
}

function visibleFaces(rig: Rig, s: Solid): DrawnFace[] {
  const inside = centroid(s.verts);
  const out: DrawnFace[] = [];
  for (const f of s.faces) {
    const vs = f.map((i) => s.verts[i]!);
    const n = faceNormal(vs, inside);
    if (dot(n, VIEW) <= 0.02) continue;
    out.push({ pts: vs.map((v) => project(rig, v)), depth: dot(centroid(vs), VIEW), color: lit(s.mat, n, rig) });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/** 2D convex hull (monotone chain), counter-clockwise in screen coordinates. */
export function hull(points: readonly Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Hull edges whose outward normal faces the key light (screen up-left) get a thin warm rim. */
function rimEdges(h: readonly Pt[]): [Pt, Pt][] {
  const edges: [Pt, Pt][] = [];
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!;
    const b = h[(i + 1) % h.length]!;
    // Hull is CCW in screen space (y down), so the outward normal of edge a->b is (dy, -dx).
    const nx = b.y - a.y;
    const ny = -(b.x - a.x);
    const len = Math.hypot(nx, ny) || 1;
    if ((nx / len) * -0.55 + (ny / len) * -0.83 > 0.45) edges.push([a, b]);
  }
  return edges;
}

function inset(a: Pt, b: Pt, by: number): [Pt, Pt] {
  const nx = b.y - a.y;
  const ny = -(b.x - a.x);
  const len = Math.hypot(nx, ny) || 1;
  const ox = (-nx / len) * by;
  const oy = (-ny / len) * by;
  return [
    { x: a.x + ox, y: a.y + oy },
    { x: b.x + ox, y: b.y + oy },
  ];
}

export interface DrawOptions {
  /** Outline width in world px (0 = none). */
  outline?: number;
  /** Rim light opacity (0 = none). */
  rim?: number;
  /** Soft vertical gradient on each face. */
  soft?: boolean;
}

/** Projected outline of a solid (convex hull of its vertices). */
export function silhouette(rig: Rig, s: Solid): Pt[] {
  return hull(s.verts.map((v) => project(rig, v)));
}

function faceFill(svg: Svg, f: DrawnFace, soft: boolean): string {
  if (!soft) return f.color;
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of f.pts) {
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  if (bottom - top < 6) return f.color;
  return svg.linear(0, top, 0, bottom, [
    [0, shade(f.color, 0.07)],
    [1, shade(f.color, -0.05)],
  ]);
}

/** Rim light and outline of one solid's silhouette. */
function drawEdges(svg: Svg, rig: Rig, s: Solid, h: readonly Pt[], outline: number, rim: number): void {
  if (s.mat.bare) return;
  if (rim > 0) {
    for (const [a, b] of rimEdges(h)) {
      const [p, q] = inset(a, b, 1.6);
      svg.add(`<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${rig.light}" stroke-opacity="${rim}" stroke-width="1.3" stroke-linecap="round"/>`);
    }
  }
  if (outline > 0) {
    const color = s.mat.outline ?? mix(shade(s.mat.dark, -0.45), rig.shadow, 0.5);
    svg.add(polyPts(h, 'none', `stroke="${color}" stroke-width="${outline}" stroke-linejoin="round"`));
  }
}

/** Draws solids back to front (by layer, then their centre's view depth). Returns their silhouettes' points. */
export function drawSolids(svg: Svg, rig: Rig, solids: readonly Solid[], opts: DrawOptions = {}): Pt[] {
  const depth = (s: Solid): number => (s.layer ?? 0) * 1000 + dot(centroid(s.verts), VIEW);
  const order = [...solids].sort((a, b) => depth(a) - depth(b));
  const soft = opts.soft ?? true;
  const all: Pt[] = [];
  for (const s of order) {
    for (const f of visibleFaces(rig, s)) svg.add(polyPts(f.pts, faceFill(svg, f, soft), 'stroke-linejoin="round"'));
    const h = silhouette(rig, s);
    all.push(...h);
    drawEdges(svg, rig, s, h, opts.outline ?? 2, opts.rim ?? 0.55);
  }
  return all;
}

/**
 * Soft cast shadow of solids on the ground: each vertex is pushed along the shadow direction by its height,
 * the hull of all of them is filled once (group opacity, so overlaps do not darken twice) and blurred.
 */
export function drawShadow(svg: Svg, rig: Rig, solids: readonly Solid[], opacity = 0.42, blur = 2.5): void {
  const shapes = solids.map((s) => {
    const ground = s.verts.map((v) => {
      const p = project(rig, { x: v.x, y: v.y, z: 0 });
      return { x: p.x + v.z * SHADOW_DX, y: p.y + v.z * SHADOW_DY };
    });
    return polyPts(hull(ground), rig.shadow);
  });
  svg.add(`<g opacity="${opacity}" ${svg.blur(blur)}>${shapes.join('')}</g>`);
}

/** Dark soft ellipse right under an object: ambient occlusion where it touches the ground. */
export function drawContact(svg: Svg, rig: Rig, cx: number, cy: number, r: number, opacity = 0.5): void {
  const c = project(rig, { x: cx, y: cy, z: 0 });
  const fill = svg.radial(c.x, c.y, r * 90, [
    [0, rig.shadow, opacity],
    [0.6, rig.shadow, opacity * 0.5],
    [1, rig.shadow, 0],
  ], undefined, 0.5);
  svg.add(`<ellipse cx="${c.x}" cy="${c.y}" rx="${r * 90}" ry="${r * 45}" fill="${fill}"/>`);
}

/* ---------- Solid generators (x, y, r in tiles; z, h in world px) ---------- */

function ring(cx: number, cy: number, r: number, z: number, sides: number, turn = 0, ry = r): V3[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = turn + (i / sides) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * ry, z };
  });
}

/** Faces joining ring i (offset a) to ring i+1 (offset b), both of `n` vertices. */
function band(a: number, b: number, n: number): number[][] {
  return Array.from({ length: n }, (_, i) => [a + i, a + ((i + 1) % n), b + ((i + 1) % n), b + i]);
}

const cap = (start: number, n: number): number[] => Array.from({ length: n }, (_, i) => start + i);

/**
 * Stack of rings (radius, z) around one axis: cylinders, cones, domes, rocks. Closed on top unless `open`
 * (bands around another body). A single ring is a flat disc.
 */
export function lathe(
  cx: number,
  cy: number,
  rings: readonly (readonly [r: number, z: number])[],
  sides: number,
  mat: Material,
  turn = 0,
  open = false,
): Solid {
  const verts = rings.flatMap(([r, z]) => ring(cx, cy, r, z, sides, turn));
  const faces: number[][] = [];
  for (let i = 0; i + 1 < rings.length; i++) faces.push(...band(i * sides, (i + 1) * sides, sides));
  if (!open) faces.push(cap((rings.length - 1) * sides, sides));
  return { verts, faces, mat };
}

export function cylinder(cx: number, cy: number, r: number, z0: number, h: number, sides: number, mat: Material): Solid {
  return lathe(cx, cy, [[r, z0], [r, z0 + h]], sides, mat, Math.PI / sides);
}

/** Axis-aligned box: (x, y) is the corner with the lowest grid coordinates. `open`: sides only (a band). */
export function box(x: number, y: number, z: number, w: number, d: number, h: number, mat: Material, open = false): Solid {
  const verts: V3[] = [
    { x, y, z },
    { x: x + w, y, z },
    { x: x + w, y: y + d, z },
    { x, y: y + d, z },
  ];
  const top = verts.map((v) => ({ ...v, z: z + h }));
  const faces = open ? band(0, 4, 4) : [[0, 1, 2, 3], [4, 5, 6, 7], ...band(0, 4, 4)];
  return { verts: [...verts, ...top], faces, mat };
}

/** Moves every vertex: rotation about z, tilt, offsets. */
export function transform(s: Solid, fn: (v: V3) => V3): Solid {
  return { ...s, verts: s.verts.map(fn) };
}

/** Rotates around a vertical axis through (cx, cy). */
export function rotateZ(cx: number, cy: number, angle: number): (v: V3) => V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (v) => ({ x: cx + (v.x - cx) * c - (v.y - cy) * s, y: cy + (v.x - cx) * s + (v.y - cy) * c, z: v.z });
}

/**
 * Rotates around a horizontal axis parallel to grid y through (cx, z0), in true 3D units: angle PI/2 lays
 * a vertical cylinder on its side along x (tanks, pipes, nozzles).
 */
export function rotateY(cx: number, z0: number, angle: number): (v: V3) => V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (v) => {
    const dx = v.x - cx;
    const dz = (v.z - z0) / Z_PX_PER_TILE;
    return { x: cx + dx * c + dz * s, y: v.y, z: z0 + (-dx * s + dz * c) * Z_PX_PER_TILE };
  };
}

/** Like rotateY, around a horizontal axis parallel to grid x through (cy, z0). */
export function rotateX(cy: number, z0: number, angle: number): (v: V3) => V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (v) => {
    const dy = v.y - cy;
    const dz = (v.z - z0) / Z_PX_PER_TILE;
    return { x: v.x, y: cy + dy * c + dz * s, z: z0 + (-dy * s + dz * c) * Z_PX_PER_TILE };
  };
}

/** Leans a solid: each px of height shifts it by (dx, dy) tiles. */
export function lean(dx: number, dy: number, z0 = 0): (v: V3) => V3 {
  return (v) => ({ x: v.x + (v.z - z0) * dx, y: v.y + (v.z - z0) * dy, z: v.z });
}

/** Irregular low-poly rock: three jittered rings narrowing upwards, closed by a slanted top. */
export function rock(r: Rand, cx: number, cy: number, radius: number, h: number, mat: Material, sides = 7): Solid {
  const turn = r() * Math.PI;
  const jit = Array.from({ length: sides }, () => 0.82 + r() * 0.3);
  const at = (scale: number, z: number, twist: number, dz: number): V3[] =>
    jit.map((j, i) => {
      const a = turn + twist + (i / sides) * Math.PI * 2;
      return { x: cx + Math.cos(a) * radius * scale * j, y: cy + Math.sin(a) * radius * scale * j, z: z + (r() - 0.5) * dz };
    });
  const tiltX = (r() - 0.5) * 0.25;
  const tiltY = (r() - 0.5) * 0.25;
  const top = at(0.5 + r() * 0.2, h * (0.88 + r() * 0.12), 0.25, h * 0.1).map((v) => ({
    ...v,
    z: v.z + ((v.x - cx) * tiltX + (v.y - cy) * tiltY) * Z_PX_PER_TILE,
  }));
  const verts = [...at(1, -2, 0, 3), ...at(0.94, h * (0.55 + r() * 0.12), 0.12, h * 0.1), ...top];
  return { verts, faces: [...band(0, sides, sides), ...band(sides, 2 * sides, sides), cap(2 * sides, sides)], mat };
}

/** Pointed crystal prism leaning by (lx, ly) tiles per px of height. */
export function crystal(cx: number, cy: number, radius: number, h: number, tip: number, lx: number, ly: number, mat: Material, sides = 6, turn = 0, z0 = -4): Solid {
  const base = ring(cx, cy, radius, z0, sides, turn);
  const top = ring(cx, cy, radius * 0.92, z0 + h, sides, turn);
  const point: V3 = { x: cx, y: cy, z: z0 + h + tip };
  const s: Solid = {
    verts: [...base, ...top, point],
    faces: [...band(0, sides, sides), ...Array.from({ length: sides }, (_, i) => [sides + i, sides + ((i + 1) % sides), 2 * sides])],
    mat,
  };
  return transform(s, lean(lx, ly, z0));
}

/** Point on the visible top of a solid for effects: the highest projected vertex. */
export function topPoint(rig: Rig, s: Solid): Pt {
  let best = s.verts[0]!;
  for (const v of s.verts) if (project(rig, v).y < project(rig, best).y) best = v;
  return project(rig, best);
}

/** A square beam from a to b (struts, legs, arms): `w` is its thickness in tiles. */
export function beam(a: V3, b: V3, w: number, mat: Material): Solid {
  const ua = unit(a);
  const ub = unit(b);
  const d = norm([ub[0] - ua[0], ub[1] - ua[1], ub[2] - ua[2]]);
  const helper: Vec = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const p = norm([d[1] * helper[2] - d[2] * helper[1], d[2] * helper[0] - d[0] * helper[2], d[0] * helper[1] - d[1] * helper[0]]);
  const q = norm([d[1] * p[2] - d[2] * p[1], d[2] * p[0] - d[0] * p[2], d[0] * p[1] - d[1] * p[0]]);
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  const at = (o: Vec): V3[] =>
    corners.map(([i, j]) => {
      const v: Vec = [o[0] + (p[0] * i + q[0] * j) * w * 0.5, o[1] + (p[1] * i + q[1] * j) * w * 0.5, o[2] + (p[2] * i + q[2] * j) * w * 0.5];
      return { x: v[0], y: v[1], z: v[2] * Z_PX_PER_TILE };
    });
  return { verts: [...at(ua), ...at(ub)], faces: [[0, 1, 2, 3], [4, 5, 6, 7], ...band(0, 4, 4)], mat };
}

/** Projected points of a horizontal circle (for painted rings and markings on flat tops). */
export function circlePoints(rig: Rig, cx: number, cy: number, r: number, z: number, n = 40): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return project(rig, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z });
  });
}
