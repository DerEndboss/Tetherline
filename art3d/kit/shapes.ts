import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  Object3D,
  QuadraticBezierCurve3,
  CurvePath,
  ShaderMaterial,
  LineCurve3,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Curve,
  type Material,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rand } from '../../src/legacy/art/rand';

/**
 * Geometry helpers in tile units (X grid x, Z grid y, Y up). Every helper returns a Mesh whose base sits at
 * y = 0 and whose centre is on the Y axis, so parts stack with `at(mesh, x, y, z)`. All meshes cast and
 * receive shadows. Bevels are what make the look smooth and premium: every hard box edge catches the light.
 */

export type V = readonly [number, number, number];

function mesh(geo: BufferGeometry, mat: Material): Mesh {
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Moves an object (returns it, for chaining in arrays). */
export function at<T extends Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Rotates an object around Y (radians; positive turns +X towards -Z). */
export function turn<T extends Object3D>(o: T, angle: number): T {
  o.rotation.y = angle;
  return o;
}

/** Groups parts. */
export function group(...parts: Object3D[]): Group {
  const g = new Group();
  for (const p of parts) g.add(p);
  return g;
}

/** A box with rounded edges (`r` = bevel radius). w along X, h up, d along Z. */
export function bevelBox(w: number, h: number, d: number, r: number, mat: Material, segments = 3): Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, segments, r);
  geo.translate(0, h / 2, 0);
  return mesh(geo, mat);
}

/** A sharp box (for tiny greebles where a bevel would not show). */
export function block(w: number, h: number, d: number, mat: Material): Mesh {
  return bevelBox(w, h, d, Math.min(w, h, d) * 0.12, mat, 1);
}

/**
 * Lathe around the Y axis from a profile of [radius, y] points (bottom to top). `sides` low (6 to 8) for
 * faceted low-poly, high (32+) for smooth turned parts. `phase` turns the facets.
 */
export function lathe(profile: readonly (readonly [number, number])[], sides: number, mat: Material, phase = 0): Mesh {
  const pts = profile.map(([r, y]) => new Vector2(Math.max(0.0001, r), y));
  const geo = new LatheGeometry(pts, sides, phase);
  return mesh(geo, mat);
}

/**
 * A cylinder with a small chamfer on both rims (bevel `b`), base at y = 0. Smooth by default (32 sides);
 * pass fewer sides for a faceted look.
 */
export function cylinder(r: number, h: number, mat: Material, sides = 32, b = Math.min(r, h) * 0.12): Mesh {
  return lathe(
    [
      [0, 0],
      [r - b, 0],
      [r, b],
      [r, h - b],
      [r - b, h],
      [0, h],
    ],
    sides,
    mat,
  );
}

/** A cone or tapered cylinder (rBottom to rTop), base at y = 0. */
export function taper(rBottom: number, rTop: number, h: number, mat: Material, sides = 32): Mesh {
  const geo = new CylinderGeometry(rTop, rBottom, h, sides, 1, false);
  geo.translate(0, h / 2, 0);
  return mesh(geo, mat);
}

/** A dome (half sphere squashed to height `h`), base at y = 0. */
export function dome(r: number, h: number, mat: Material, sides = 40, rings = 10): Mesh {
  const profile: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * (Math.PI / 2);
    profile.push([Math.cos(a) * r, Math.sin(a) * h]);
  }
  return lathe(profile, sides, mat);
}

/** A torus lying flat (ring around the Y axis) at height 0. */
export function ring(r: number, tube: number, mat: Material, sides = 48): Mesh {
  const geo = new TorusGeometry(r, tube, 12, sides);
  geo.rotateX(Math.PI / 2);
  return mesh(geo, mat);
}

/** A thin plate with bevelled edges lying on y = 0 (panels, pads, solar cells). */
export function plate(w: number, d: number, t: number, mat: Material, r = Math.min(t * 0.45, 0.03)): Mesh {
  return bevelBox(w, t, d, r, mat, 2);
}

/**
 * A pipe through `points` with rounded bends (`bend` = bend radius in units). Industrial pipes and cables:
 * straight runs, soft corners.
 */
export function pipe(points: readonly V[], radius: number, mat: Material, bend = radius * 3, sides = 16): Mesh {
  const path = new CurvePath<Vector3>();
  const p = points.map((q) => new Vector3(q[0], q[1], q[2]));
  let from = p[0]!.clone();
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const c = p[i + 1]!;
    const inDir = b.clone().sub(a).normalize();
    const outDir = c.clone().sub(b).normalize();
    const k = Math.min(bend, b.distanceTo(a) / 2, c.distanceTo(b) / 2);
    const enter = b.clone().addScaledVector(inDir, -k);
    const exit = b.clone().addScaledVector(outDir, k);
    path.add(new LineCurve3(from, enter));
    path.add(new QuadraticBezierCurve3(enter, b.clone(), exit));
    from = exit;
  }
  path.add(new LineCurve3(from, p[p.length - 1]!.clone()));
  const segs = Math.max(8, Math.round(path.getLength() / (radius * 1.2)));
  return mesh(new TubeGeometry(path as unknown as Curve<Vector3>, segs, radius, sides, false), mat);
}

/** A smooth cable or hose through control points (sagging cables, organic tubes). */
export function cable(points: readonly V[], radius: number, mat: Material, sides = 12): Mesh {
  const curve = new CatmullRomCurve3(points.map((q) => new Vector3(q[0], q[1], q[2])), false, 'centripetal');
  const segs = Math.max(16, Math.round(curve.getLength() / (radius * 1.5)));
  return mesh(new TubeGeometry(curve, segs, radius, sides, false), mat);
}

/** A strut between two points (round bar), for frames, legs, trusses. */
export function strut(a: V, b: V, radius: number, mat: Material, sides = 10): Mesh {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const len = va.distanceTo(vb);
  const geo = new CylinderGeometry(radius, radius, len, sides, 1, false);
  geo.translate(0, len / 2, 0);
  const m = mesh(geo, mat);
  m.position.copy(va);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}

/** Flat-shaded convex hull of points (rocks, chunks, shards). */
export function hull(points: readonly V[], mat: Material): Mesh {
  const geo = new ConvexGeometry(points.map((q) => new Vector3(q[0], q[1], q[2])));
  return mesh(geo, mat);
}

/**
 * A faceted boulder: a convex hull of jittered points on a squashed ellipsoid, flat bottom at y = 0.
 * `r` radius, `h` height, `n` points (more = rounder), `rough` 0..1 jitter.
 */
export function rock(rnd: Rand, r: number, h: number, mat: Material, n = 18, rough = 0.28): Mesh {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const theta = i * 2.39996 + rnd() * 0.6;
    const y = 1 - u * 1.15;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const j = 1 - rough / 2 + rnd() * rough;
    pts.push([Math.cos(theta) * ring * r * j, Math.max(0, y) * h * (0.85 + rnd() * 0.3), Math.sin(theta) * ring * r * j]);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd();
    pts.push([Math.cos(a) * r * 0.92, 0, Math.sin(a) * r * 0.92]);
  }
  return hull(pts, mat);
}

export interface CrystalSpec {
  /** Radius of the shaft. */
  r: number;
  /** Height of the shaft before the tip starts. */
  h: number;
  /** Height of the pointed tip. */
  tip: number;
  sides?: number;
  /** Lean of the axis: tilt towards X and Z (units per unit of height). */
  lean?: readonly [number, number];
  /** Facet turn in radians. */
  phase?: number;
  /** 0..1: how uneven the facets are. */
  jitter?: number;
}

/**
 * A faceted crystal prism: hexagonal (default) shaft, a slightly wider shoulder and a pointed, off-centre tip.
 * Flat-shaded so each facet catches its own light. Put an `emissive` core inside for the inner glow.
 */
export function crystal(rnd: Rand, spec: CrystalSpec, mat: Material): Mesh {
  const sides = spec.sides ?? 6;
  const [lx, lz] = spec.lean ?? [0, 0];
  const jitter = spec.jitter ?? 0.18;
  const phase = spec.phase ?? 0;
  const pos: number[] = [];
  const ringAt = (y: number, rr: number): Vector3[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = phase + (i / sides) * Math.PI * 2;
      const k = 1 + (rnd() - 0.5) * jitter;
      return new Vector3(Math.cos(a) * rr * k + lx * y, y, Math.sin(a) * rr * k + lz * y);
    });
  const base = ringAt(-0.04, spec.r * 0.92);
  const shoulder = ringAt(spec.h, spec.r * 1.04);
  const tipY = spec.h + spec.tip;
  const tip = new Vector3(lx * tipY + (rnd() - 0.5) * spec.r * 0.35, tipY, lz * tipY + (rnd() - 0.5) * spec.r * 0.35);
  const push = (...vs: Vector3[]): void => {
    for (const v of vs) pos.push(v.x, v.y, v.z);
  };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    push(base[i]!, shoulder[i]!, shoulder[j]!, base[i]!, shoulder[j]!, base[j]!);
    push(shoulder[i]!, tip, shoulder[j]!);
  }
  let geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo = orient(geo);
  // Inner light along the axis (crystalMat): dim at the root, bright at the tip.
  const p = geo.getAttribute('position') as BufferAttribute;
  const glow = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) glow[i] = Math.min(1, Math.max(0, p.getY(i) / tipY)) ** 0.8;
  geo.setAttribute('aGlow', new BufferAttribute(glow, 1));
  return mesh(geo, mat);
}

/** Makes every triangle face outwards from the centre of its mesh, then computes flat normals. */
function orient(geo: BufferGeometry): BufferGeometry {
  const p = geo.getAttribute('position') as BufferAttribute;
  geo.computeBoundingBox();
  const c = new Vector3();
  geo.boundingBox!.getCenter(c);
  const a = new Vector3();
  const b = new Vector3();
  const d = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    d.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    const mid = a.clone().add(b).add(d).divideScalar(3);
    if (n.dot(mid.sub(c)) < 0) {
      p.setXYZ(i + 1, d.x, d.y, d.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Rivets or bolts in a ring of radius `r` at height 0 (`n` of them). */
export function rivets(r: number, n: number, size: number, mat: Material, phase = 0): Group {
  const g = new Group();
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    g.add(at(dome(size, size * 0.6, mat, 10, 3), Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return g;
}

/** A row of `n` vent slots (dark bars w x h) on a face pointing +Z, centred on the origin, running along X. */
export function vents(n: number, w: number, h: number, gap: number, mat: Material): Group {
  const g = new Group();
  const start = -((n - 1) * (w + gap)) / 2;
  for (let i = 0; i < n; i++) g.add(at(bevelBox(w, h, 0.02, 0.006, mat, 1), start + i * (w + gap), 0, 0));
  return g;
}

/**
 * Greebles: small technical boxes and cylinders scattered over a rectangle (w x d) on y = 0, for detail density
 * on roofs and pads. Deterministic with `rnd`.
 */
export function greebles(rnd: Rand, w: number, d: number, n: number, mats: readonly Material[], size = 0.06): Group {
  const g = new Group();
  for (let i = 0; i < n; i++) {
    const mat = mats[Math.floor(rnd() * mats.length)]!;
    const s = size * (0.6 + rnd() * 0.8);
    const x = (rnd() - 0.5) * (w - s);
    const z = (rnd() - 0.5) * (d - s);
    const part = rnd() < 0.6 ? block(s * (1 + rnd()), s * (0.5 + rnd()), s * (0.8 + rnd() * 0.6), mat) : cylinder(s * 0.5, s * (0.6 + rnd()), mat, 12);
    g.add(at(part, x, 0, z));
  }
  return g;
}

/**
 * A pool of light on the ground (y = 0): a soft radial glow of `color`, strongest in the middle. It becomes
 * semi-transparent coloured pixels in the sprite, so the ground under a crystal or lamp looks lit in game.
 * Pair it with a `PointLight` inside the model so nearby surfaces pick up the same light.
 */
export function lightPool(radius: number, color: string, strength = 0.35, squash = 1): Mesh {
  const geo = new CircleGeometry(radius, 48);
  geo.rotateX(-Math.PI / 2);
  geo.scale(1, 1, squash);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new Color(color) }, strength: { value: strength }, radius: { value: radius } },
    vertexShader: 'varying vec2 vXZ; void main() { vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 color; uniform float strength; uniform float radius; varying vec2 vXZ; void main() { float d = length(vXZ) / radius; float a = strength * pow(max(0.0, 1.0 - d), 2.2); gl_FragColor = vec4(color, a); }',
  });
  const m = new Mesh(geo, mat);
  m.position.y = 0.003;
  m.renderOrder = 1;
  return m;
}

/** Gives a mesh flat facets (each face its own normal): crisp octagons and low-poly parts on smooth materials. */
export function facet(m: Mesh): Mesh {
  const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
  geo.computeVertexNormals();
  m.geometry = geo;
  return m;
}

/** Smooths a geometry's normals across shared vertices (for soft organic shapes made of many faces). */
export function smooth(m: Mesh): Mesh {
  const geo = mergeVertices(m.geometry.deleteAttribute('normal'));
  geo.computeVertexNormals();
  m.geometry = geo;
  return m;
}
