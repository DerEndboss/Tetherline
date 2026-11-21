import { BufferAttribute, BufferGeometry, Color, Mesh, type Object3D } from 'three';
import { group, surface } from '../kit';
import { darker } from '../icons/parts';

/**
 * A soft sheet of rippled sand: wind ripples and a slow swell over a patch whose edge fades to nothing (vertex
 * alpha), so overlapping patches blend into one sandy surface with no outline. Sand is a surface, not a heap of
 * lumps: the lumps of the earlier look read as light strokes from far away.
 */

/** Half size of the patch in tile units (it is about a tile and a bit across, so neighbours overlap). */
const R = 0.66;
const N = 30;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function sandSheet(rnd: () => number, color: string): Object3D {
  const turn = 0.45 + (rnd() - 0.5) * 0.5;
  const dx = Math.cos(turn);
  const dz = Math.sin(turn);
  const phase = rnd() * 6.28;
  const wob = rnd() * 6.28;
  // close to the painted bed under it (ground.ts), so a patch's rim melts into the field instead of outlining it
  const mid = new Color(darker(color, 0.3));
  const light = new Color(darker(color, 0.18));
  const dark = new Color(darker(color, 0.42));
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const col = new Float32Array((N + 1) * (N + 1) * 4);
  const c = new Color();
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = (i / N - 0.5) * 2 * R;
      const z = (j / N - 0.5) * 2 * R;
      const k = i * (N + 1) + j;
      // elliptical window: 1 inside, fading to 0 at the rim
      const d = Math.hypot(x / R, z / (R * 0.88));
      const win = 1 - smoothstep(0.25, 1, d);
      const u = x * dx + z * dz;
      const ripple = Math.sin((u * Math.PI * 2) / 0.15 + phase + Math.sin(z * 9 + wob) * 0.9);
      const swell = Math.sin((u * Math.PI * 2) / 0.62 + wob) * 0.5 + Math.sin(x * 4.1 + z * 2.7 + phase) * 0.5;
      pos.set([x, win * (0.006 + 0.0035 * ripple + 0.007 * swell), z], k * 3);
      // the crest of a ripple catches light, the trough is a little darker (colour, not shape: flat sheets
      // stay as bright as their rim, so no halo shows)
      c.copy(mid).lerp(ripple > 0 ? light : dark, Math.abs(ripple) * (0.3 + 0.25 * swell));
      col.set([c.r, c.g, c.b, win], k * 4);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j;
      const b = a + 1;
      const cc = a + (N + 1);
      const dd = cc + 1;
      // counter-clockwise seen from above (+Y)
      index.push(a, b, cc, cc, b, dd);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 4));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mat = surface('#ffffff', { rough: 0.92 });
  mat.vertexColors = true;
  mat.transparent = true;
  mat.depthWrite = false;
  const m = new Mesh(geo, mat);
  m.receiveShadow = true;
  m.position.y = 0.004;
  return group(m);
}
