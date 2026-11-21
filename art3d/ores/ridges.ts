import { BufferAttribute, BufferGeometry, CircleGeometry, Color, Mesh, ShadowMaterial, type Material, type Object3D } from 'three';
import { CLIFF_EAST, CLIFF_SOUTH, RIDGE_HEIGHT, RIDGE_MASKS, RIDGE_ROCKS, RIDGE_TOPS, ridgeIds, ridgeRockId, ridgeTopId } from '../../src/render/world/ore-art';
import { at, COLORS, group, hull, plan, rand, rock, rockMat, sprite, turn, type V } from '../kit';

/**
 * Ridge rock: the unbuildable rock tiles of the map. A ridge of many tiles must read as ONE rock mass, so no
 * piece is a block with sides of its own. The massif is built from pieces (ids in render/world/ore-art.ts):
 *
 *  - top (per mask of open edges): a faceted sheet over one tile. Every variant has the SAME height (RIDGE_HEIGHT)
 *    along its outer strip and the same colours there, and reaches OVER past the tile edge, so any two neighbours
 *    join into one surface (a bump inside a tile never touches the border). An east or south edge facing open
 *    ground (the only faces the three cameras can see) adds the cliff: leaning out in uneven courses, with a few
 *    blocks standing out of it, rubble at its foot and stones on its rim. Its end strips are the same in every
 *    variant, so cliffs of neighbouring tiles meet. Inner tiles have no sides and no seams at all.
 *  - rock: boulders that sit on the top and cross tile borders (the layer scatters them), so no tile looks stamped.
 *
 * Neutral light grey: the game tints it with the theme's ridge colour (rust, moss, ice). Clearly taller and
 * bigger than any ore chunk, so coal or obsidion never pass for rock.
 */

const H = RIDGE_HEIGHT;
/** How far a piece reaches past its tile edge, so neighbouring pieces overlap instead of just touching. */
const OVER = 0.025;
/** How far the foot of a cliff stands out of its rim (a talus slope, not a vertical wall). */
const BATTER = 0.11;
const SPAN = 0.5 + OVER;
const INNER = 0.5 - OVER;
const CELLS = 8;

const STONE: Material[] = [rockMat('#cfc8c2', 0.8), rockMat('#bdb5ae', 0.82), rockMat('#e0dad4', 0.78)];
const TOP_COLOR = new Color('#d3ccc5');
const WALL_COLOR = new Color('#bcb3ac');

/** Per-face colours: matte, flat shaded, white base so the vertex colour is the colour. */
const FACETS = (() => {
  const m = rockMat('#ffffff', 0.84);
  m.vertexColors = true;
  return m;
})();

interface Tri {
  a: V;
  b: V;
  c: V;
  shade: number;
}

/** A flat-shaded mesh of triangles, each with its own brightness times `base`. Wind counter-clockwise outwards. */
function facets(tris: readonly Tri[], base: Color): Mesh {
  const pos = new Float32Array(tris.length * 9);
  const col = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    [t.a, t.b, t.c].forEach((p, k) => {
      pos.set(p, i * 9 + k * 3);
      col.set([base.r * t.shade, base.g * t.shade, base.b * t.shade], i * 9 + k * 3);
    });
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new Mesh(geo, FACETS);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The grid lines of a tile's sheet: the two outer strips (width 2 * OVER) are fixed, the middle is CELLS cells. */
function lines(): number[] {
  const v = [-SPAN, -INNER];
  for (let k = 1; k < CELLS; k++) v.push(-INNER + (2 * INNER * k) / CELLS);
  v.push(INNER, SPAN);
  return v;
}

const AXIS = lines();
const LAST = AXIS.length - 1;
/** Whether grid line k belongs to a fixed outer strip. */
const outer = (k: number): boolean => k <= 1 || k >= LAST - 1;

/* ---------- the top ---------- */

/** Interior grid lines (the outer strips stay put, so neighbouring sheets join). */
const inside = (k: number): boolean => k >= 2 && k <= LAST - 2;

/** One grid vertex of the top: the outer strips are flat at H, the inside is jittered in all three axes. */
function topPoint(rnd: () => number, i: number, j: number): V {
  const free = inside(i) && inside(j);
  const cell = (2 * INNER) / CELLS;
  const d = Math.min(i - 1, j - 1, LAST - 1 - i, LAST - 1 - j);
  const rise = free ? (rnd() * 0.08 - 0.028) * Math.min(1, d * 0.5) : 0;
  const dx = free ? (rnd() - 0.5) * cell * 0.7 : 0;
  const dz = free ? (rnd() - 0.5) * cell * 0.7 : 0;
  return [AXIS[i]! + dx, H + rise, AXIS[j]! + dz];
}

function topTris(rnd: () => number): Tri[] {
  const grid = AXIS.map((_, i) => AXIS.map((__, j) => topPoint(rnd, i, j)));
  const p = (i: number, j: number): V => grid[i]![j]!;
  const tris: Tri[] = [];
  for (let i = 0; i < LAST; i++) {
    for (let j = 0; j < LAST; j++) {
      const fixed = i === 0 || j === 0 || i === LAST - 1 || j === LAST - 1;
      const flip = !fixed && (i + j + Math.floor(rnd() * 2)) % 2 === 1;
      // a few dark faces read as cracks and shaded hollows
      const s = (): number => (fixed ? 0.99 : rnd() < 0.05 ? 0.72 : 0.93 + rnd() * 0.12);
      if (flip) tris.push({ a: p(i, j), b: p(i, j + 1), c: p(i + 1, j + 1), shade: s() }, { a: p(i, j), b: p(i + 1, j + 1), c: p(i + 1, j), shade: s() });
      else tris.push({ a: p(i, j), b: p(i, j + 1), c: p(i + 1, j), shade: s() }, { a: p(i + 1, j), b: p(i, j + 1), c: p(i + 1, j + 1), shade: s() });
    }
  }
  return tris;
}

/* ---------- the cliff ---------- */

/** Heights of the cliff's courses, top to foot, as fractions of H. */
const ROWS = [1, 0.72, 0.44, 0.18, 0];
/** Brightness of each course: lit at the rim, dark at the foot (the baked contact shadow of a cliff). */
const COURSE = [1, 0.93, 0.84, 0.72];
/** The outward offset of the end strips: the same in every variant, so neighbouring cliffs meet. */
const END_OUT = (() => {
  const r = rand(4242);
  return ROWS.map((f, k) => BATTER * (1 - f) + (k > 0 && k < ROWS.length - 1 ? (r() - 0.5) * 0.03 : 0));
})();

function cliffTris(rnd: () => number): Tri[] {
  const grid = AXIS.map((_, j) =>
    ROWS.map((f, k): V => {
      const end = outer(j);
      const rough = end || k === 0 ? 0 : (rnd() - 0.5) * 0.06 + (k === ROWS.length - 1 ? 0.012 : 0);
      const lift = end || k === 0 || k === ROWS.length - 1 ? 0 : (rnd() - 0.5) * 0.12 * H;
      const out = end ? END_OUT[k]! : BATTER * (1 - f) + rough;
      return [SPAN + out, H * f + lift, AXIS[j]!];
    }),
  );
  const tris: Tri[] = [];
  for (let j = 0; j < LAST; j++) {
    for (let k = 0; k < ROWS.length - 1; k++) {
      const strip = j === 0 || j === LAST - 1;
      const jitter = (): number => (strip ? 1 : 0.9 + rnd() * 0.2);
      const band = (COURSE[k] ?? 1) * (k % 2 ? 0.96 : 1.03);
      const a = grid[j]![k]!;
      const b = grid[j + 1]![k]!;
      const c = grid[j]![k + 1]!;
      const d = grid[j + 1]![k + 1]!;
      tris.push({ a, b, c, shade: band * jitter() }, { a: b, b: d, c, shade: band * jitter() });
    }
  }
  return tris;
}

/** A chunk that stands out of the cliff face: a squat hull, wider than tall, half sunk into the wall. */
function outcrop(rnd: () => number, z: number, level: number, w: number, hgt: number): Object3D {
  const pts: V[] = [];
  const out = BATTER * (1 - level);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd() * 0.5;
    const jz = Math.cos(a) * w * (0.8 + rnd() * 0.4);
    const jy = Math.sin(a) * hgt * (0.8 + rnd() * 0.4);
    pts.push([SPAN + out - 0.03, H * level + jy, z + jz], [SPAN + out + 0.035 + rnd() * 0.035, H * level + jy * 0.78, z + jz * 0.8]);
  }
  return hull(pts, STONE[Math.floor(rnd() * STONE.length)]!);
}

/** Everything an exposed east edge adds to a top: the cliff, rubble at its foot and stones on its rim. `rnd` is seeded per variant. */
function eastEdge(variant: number): Object3D[] {
  const rnd = rand(6100 + variant * 53);
  const parts: Object3D[] = [facets(cliffTris(rnd), WALL_COLOR)];
  const n = 2 + (variant % 2);
  for (let i = 0; i < n; i++) {
    const z = -0.34 + (0.68 * (i + rnd() * 0.5)) / n;
    parts.push(outcrop(rnd, z, 0.25 + rnd() * 0.5, 0.11 + rnd() * 0.07, 0.035 + rnd() * 0.03));
  }
  // rubble that fell to the foot, each with its contact shadow on the ground
  const foot = 2 + (variant % 3);
  for (let i = 0; i < foot; i++) {
    const r = 0.04 + rnd() * 0.06;
    const x = SPAN + BATTER + 0.01 + rnd() * 0.05;
    const z = -0.36 + (0.72 * (i + rnd() * 0.6)) / foot;
    parts.push(at(catcher(r * 1.8, 0, 0.4), x, 0.002, z), at(rock(rnd, r, r * (0.6 + rnd() * 0.5), pick(rnd), 11, 0.42), x, -0.006, z));
  }
  // stones on the rim break its straight line
  const rim = 1 + (variant % 2);
  for (let i = 0; i < rim; i++) {
    const r = 0.05 + rnd() * 0.05;
    const z = -0.34 + 0.68 * ((i + rnd() * 0.6) / rim);
    parts.push(at(rock(rnd, r, r * (0.6 + rnd() * 0.5), pick(rnd), 10, 0.4), SPAN - 0.025, H - 0.012, z));
  }
  return parts;
}

/** The stone that stands at a convex corner (both east and south open): it rounds the corner of the tile grid. */
function cornerStone(variant: number): Object3D {
  const rnd = rand(6900 + variant * 17);
  const r = 0.11 + rnd() * 0.04;
  const c = SPAN + BATTER * 0.6;
  return group(at(catcher(r * 1.8, 0, 0.4), c, 0.002, c), at(rock(rnd, r, r * 1.1, pick(rnd), 12, 0.4), c, -0.006, c));
}

/** One tile's top and, for the cliff bits of `mask`, the cliffs under its open east and south edges. */
function ridgeTop(mask: number, variant: number): Object3D {
  const parts: Object3D[] = [facets(topTris(rand(5300 + variant * 41)), TOP_COLOR)];
  if (mask & CLIFF_EAST) parts.push(...eastEdge(variant));
  // the south cliff is the east one turned a quarter (+X to +Z), with its own rubble
  if (mask & CLIFF_SOUTH) parts.push(turn(group(...eastEdge(variant + 17)), -Math.PI / 2));
  if (mask === (CLIFF_EAST | CLIFF_SOUTH)) parts.push(cornerStone(variant));
  return group(...parts);
}

/* ---------- boulders ---------- */

/** A soft contact shadow on a surface at height `y` (the kit's ground catcher only knows y = 0). */
function catcher(r: number, y: number, opacity = 0.42): Mesh {
  const m = new Mesh(new CircleGeometry(r, 28), new ShadowMaterial({ color: new Color(COLORS.shadow), opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  m.renderOrder = -1;
  return m;
}

const pick = (rnd: () => number): Material => STONE[Math.floor(rnd() * STONE.length)]!;

/** [radius, height, buddies]: how big each boulder variant is and how many small stones sit beside it. */
const ROCKS: readonly (readonly [number, number, number])[] = [
  [0.07, 0.05, 2],
  [0.09, 0.06, 1],
  [0.15, 0.12, 1],
  [0.18, 0.14, 0],
  [0.26, 0.2, 1],
  [0.3, 0.24, 2],
  [0.34, 0.075, 0],
  [0.13, 0.3, 1],
];

/** A low dome of faceted stone, wider than a tile: a hump in the plateau (the layer puts it on a tile whose neighbours are all rock). */
function mound(variant: number): Object3D {
  const rnd = rand(9300 + variant * 83);
  const r = variant === 8 ? 0.62 : 0.5;
  const h = variant === 8 ? 0.25 : 0.19;
  const pts: V[] = [];
  const ring = (n: number, k: number, y: number, jitter: number): void => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const d = r * k * (1 - jitter / 2 + rnd() * jitter);
      pts.push([Math.cos(a) * d, y, Math.sin(a) * d]);
    }
  };
  ring(14, 1, -0.012, 0.3);
  ring(12, 0.8, h * 0.42, 0.3);
  ring(8, 0.5, h * 0.78, 0.35);
  pts.push([(rnd() - 0.5) * r * 0.2, h, (rnd() - 0.5) * r * 0.2]);
  const body = hull(pts, pick(rnd));
  const lifted = group(body, at(rock(rnd, r * 0.22, h * 0.5, pick(rnd), 10, 0.4), r * 0.18, h * 0.8, -r * 0.1));
  lifted.position.y = H;
  return group(catcher(r * 1.35, H - 0.004, 0.3), lifted);
}

function boulder(variant: number): Object3D {
  if (variant >= 8) return mound(variant);
  const rnd = rand(7700 + variant * 61);
  const [r, h, buddies] = ROCKS[variant]!;
  const parts: Object3D[] = [rock(rnd, r, h, pick(rnd), 14, 0.42)];
  if (variant === 7) parts.push(at(rock(rnd, r * 0.6, h * 0.55, pick(rnd), 10, 0.35), r * 0.45, 0, r * 0.2));
  for (let i = 0; i < buddies; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * (1.0 + rnd() * 0.5);
    parts.push(at(rock(rnd, r * (0.32 + rnd() * 0.25), h * (0.4 + rnd() * 0.3), pick(rnd), 10, 0.4), Math.cos(a) * d, 0, Math.sin(a) * d));
  }
  const lifted = group(...parts);
  lifted.position.y = H - 0.012;
  return group(catcher(r * 1.8 + 0.06, H - 0.004), lifted);
}

/* ---------- registration ---------- */

for (let m = 0; m < RIDGE_MASKS; m++) {
  for (let v = 0; v < RIDGE_TOPS; v++) sprite({ id: ridgeTopId(m, v), build: () => ridgeTop(m, v), scale: 4, ground: 'none', bloom: 0 });
}
for (let v = 0; v < RIDGE_ROCKS; v++) sprite({ id: ridgeRockId(v), build: () => boulder(v), scale: 4, ground: 'none', bloom: 0 });
plan(ridgeIds());
