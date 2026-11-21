import type { WorldPalette } from '../content/types';
import { mix, shade } from './color';
import { rand, range, type Rand } from './rand';
import { crystal, drawContact, drawSolids, project, rock, type Rig } from './solid';
import { circle, ellipse, polyline, type Pt, type SpriteArt, Svg } from './svg';

/**
 * Ground details. The ground itself is painted once into a texture (render/ground-painter.ts); these
 * sprites sit on it: ore veins (exposed and peeking out under rubble) and small decals (pebbles, cracks,
 * ripples) that break up the surface.
 */

export const depositId = (material: string): string => `deposit-${material}`;
export const veinId = (material: string): string => `vein-${material}`;
export const DECAL_VARIANTS = 10;
export const decalId = (i: number): string => `decal-${i}`;

const W = 160;
const H = 120;
const ORIGIN: Pt = { x: 80, y: 76 };

function rigFor(palette: WorldPalette): Rig {
  return { origin: ORIGIN, light: palette.light, shadow: palette.shadow, sky: palette.sky.mid };
}

function cracks(r: Rand, rig: Rig, count: number, reach: number, front: boolean): Pt[][] {
  return Array.from({ length: count }, (_, i) => {
    const a = front ? range(r, 0.2, 2.9) : (i / count) * Math.PI * 2 + r();
    const pts: Pt[] = [];
    let x = 0;
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const d = reach * (0.18 + r() * 0.12);
      const t = a + range(r, -0.5, 0.5);
      x += Math.cos(t) * d;
      y += Math.sin(t) * d;
      pts.push(project(rig, { x, y, z: 0 }));
    }
    return [project(rig, { x: 0, y: 0, z: 0 }), ...pts];
  });
}

/** An exposed vein: a dark scar with a soft glow, a few short fissures and a tight cluster of lit ore nuggets. */
export function depositSprite(material: string, color: string, palette: WorldPalette): SpriteArt {
  const rig = rigFor(palette);
  const r = rand(hashText(material));
  const svg = new Svg(W, H);
  const c = project(rig, { x: 0, y: 0, z: 0 });
  const scar = svg.radial(c.x, c.y, 58, [
    [0, shade(color, -0.78), 0.8],
    [0.75, shade(color, -0.72), 0.35],
    [1, shade(color, -0.72), 0],
  ], undefined, 0.5);
  svg.add(ellipse(c.x, c.y, 58, 29, scar));
  const halo = svg.radial(c.x, c.y - 4, 44, [
    [0, color, 0.45],
    [1, color, 0],
  ], undefined, 0.55);
  svg.add(ellipse(c.x, c.y - 4, 44, 24, halo));
  for (let i = 0; i < 3; i++) {
    const a = range(r, 0, Math.PI * 2);
    const from = project(rig, { x: Math.cos(a) * 0.3, y: Math.sin(a) * 0.3, z: 0 });
    const to = project(rig, { x: Math.cos(a + 0.4) * 0.45, y: Math.sin(a + 0.4) * 0.45, z: 0 });
    svg.add(polyline([from, to], shade(color, 0.4), 1.4, 'opacity="0.7"'));
  }
  const ore = { main: shade(color, 0.3), dark: shade(color, -0.6) };
  const nuggets = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + r();
    const d = range(r, 0.06, 0.24);
    return rock(r, Math.cos(a) * d, Math.sin(a) * d, range(r, 0.06, 0.11), range(r, 5, 10), ore, 5);
  });
  const points = Array.from({ length: 3 }, (_, i) => {
    const a = (i / 3) * Math.PI * 2 + r();
    const d = range(r, 0, 0.1);
    return crystal(Math.cos(a) * d, Math.sin(a) * d, 0.05, range(r, 10, 18), 7, Math.cos(a) * 0.004, Math.sin(a) * 0.004, { ...ore, emissive: true }, 5, r());
  });
  drawContact(svg, rig, 0, 0, 0.26, 0.55);
  drawSolids(svg, rig, [...nuggets, ...points], { outline: 1.5, rim: 0.9 });
  for (let i = 0; i < 6; i++) {
    const f = project(rig, { x: range(r, -0.35, 0.35), y: range(r, -0.35, 0.35), z: 0 });
    svg.add(circle(f.x, f.y, range(r, 1.2, 2.2), shade(color, 0.6), 'opacity="0.9"'));
  }
  const glints = [...points, ...nuggets.slice(0, 2)].map((n) => {
    const top = n.verts.reduce((a, b) => (b.z > a.z ? b : a));
    const p = project(rig, top);
    return { x: p.x - ORIGIN.x, y: p.y - ORIGIN.y };
  });
  return { id: depositId(material), w: W, h: H, ax: ORIGIN.x / W, ay: ORIGIN.y / H, svg: svg.doc(), meta: { glints } };
}

/** A vein still under rubble: only glowing cracks running out in front of the obstacle, and a few flecks. */
export function veinSprite(material: string, color: string, palette: WorldPalette): SpriteArt {
  const rig = rigFor(palette);
  const r = rand(hashText(material) ^ 0x5bd1e995);
  const svg = new Svg(W, H);
  const lines = cracks(r, rig, 4, 0.7, true);
  for (const l of lines) {
    svg.add(polyline(l, color, 6, `opacity="0.5" ${svg.blur(2.5)}`), polyline(l, shade(color, 0.5), 1.8));
  }
  const flecks = lines.map((l) => l[l.length - 1]!);
  for (const f of flecks) svg.add(circle(f.x, f.y, 2.6, shade(color, 0.6)));
  const glints = flecks.map((f) => ({ x: f.x - ORIGIN.x, y: f.y - ORIGIN.y }));
  return { id: veinId(material), w: W, h: H, ax: ORIGIN.x / W, ay: ORIGIN.y / H, svg: svg.doc(), meta: { glints } };
}

/** Small ground details from the world's ground tones: pebbles, a crack, sand ripples, flat stones. */
export function decalSprites(palette: WorldPalette): SpriteArt[] {
  const rig = rigFor(palette);
  const g = palette.ground;
  const stone = { main: shade(g[g.length - 1]!, 0.18), dark: g[0]! };
  return Array.from({ length: DECAL_VARIANTS }, (_, i) => {
    const r = rand(9001 + i * 31);
    const svg = new Svg(W, H);
    const kind = i % 5;
    if (kind === 0 || kind === 3) {
      const n = 2 + Math.floor(r() * 3);
      const pebbles = Array.from({ length: n }, () => rock(r, range(r, -0.3, 0.3), range(r, -0.3, 0.3), range(r, 0.04, 0.08), range(r, 3, 7), stone, 5));
      drawSolids(svg, rig, pebbles, { outline: 1.2, rim: 0.4, soft: false });
    } else if (kind === 1) {
      for (const l of cracks(r, rig, 3, 0.45, false)) svg.add(polyline(l, shade(g[0]!, -0.35), 1.6, 'opacity="0.55"'));
    } else if (kind === 2) {
      for (let k = 0; k < 3; k++) {
        const y = -0.2 + k * 0.16;
        const pts = Array.from({ length: 6 }, (_, j) => project(rig, { x: -0.3 + j * 0.12, y: y + Math.sin(j + k) * 0.03, z: 0 }));
        svg.add(polyline(pts, mix(palette.dust, palette.light, 0.2), 1.4, 'opacity="0.35"'));
      }
    } else {
      const c = project(rig, { x: range(r, -0.2, 0.2), y: range(r, -0.2, 0.2), z: 0 });
      svg.add(ellipse(c.x, c.y, range(r, 10, 18), range(r, 5, 8), shade(g[0]!, -0.25), 'opacity="0.4"'));
      svg.add(ellipse(c.x - 1, c.y - 1.5, range(r, 8, 14), range(r, 4, 6), mix(stone.main, palette.light, 0.1), 'opacity="0.8"'));
    }
    return { id: decalId(i), w: W, h: H, ax: ORIGIN.x / W, ay: ORIGIN.y / H, svg: svg.doc() };
  });
}

function hashText(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
