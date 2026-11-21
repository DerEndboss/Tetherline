import { type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, MAT, pipe, rivets, strut, taper, vents } from '../kit';
import { machine } from '../factories/common';
import { headGlow, hoop, megaPad, torus } from './common';

/**
 * Fusion reactor: a tokamak. A hull vacuum vessel (torus) on eight legs, sixteen orange field-coil hoops, a plasma
 * channel along the top that glows teal, a control tower in the hole, cooling tanks at the corners. Work frames: a
 * bright head of plasma runs one lap around the channel (12 frames, one second); the idle picture shows a dim even glow.
 */

const Y0 = 0.07;
const TEAL = COLORS.tech;
const R = 1.25;
const SEGMENTS = 24;
const FRAMES = 12;

machine({
  id: 'fusion-reactor',
  size: 5,
  frames: FRAMES,
  pad: megaPad,
  samples: 24,
  body: (k, f) => {
    const parts: Object3D[] = [];
    const base = Y0 + 0.06;
    const cy = base + 0.6;
    // legs and a ring girder under the vessel
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      parts.push(at(bevelBox(0.2, 0.55, 0.2, 0.05, MAT.gunmetal), Math.cos(a) * R, base, Math.sin(a) * R));
    }
    parts.push(at(torus(R, 0.1, MAT.trim, Math.PI * 2, 64, 10), 0, base + 0.5, 0));
    // vessel
    parts.push(at(torus(R, 0.5, MAT.hull, Math.PI * 2, 64, 28), 0, cy, 0));
    parts.push(at(torus(R, 0.505, MAT.trim, Math.PI * 2, 64, 6), 0, cy - 0.12, 0));
    // sixteen field coils: orange hoops around the vessel tube, plus a hull collar between pairs
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const h = hoop(0.52, 0.05, MAT.accent, a, 24);
      parts.push(at(h, Math.cos(a) * R, cy, Math.sin(a) * R));
    }
    // plasma channel: a dark groove on top and short glowing arcs; the bright head runs round with the frame
    parts.push(at(torus(R, 0.12, MAT.deep, Math.PI * 2, 64, 12), 0, cy + 0.42, 0));
    const head = f.working ? f.lap : 0;
    for (let s = 0; s < SEGMENTS; s++) {
      const a0 = (s / SEGMENTS) * Math.PI * 2;
      const mid = a0 + Math.PI / SEGMENTS;
      const power = f.working ? 0.8 + 3.0 * headGlow(mid, head, 6) : 1.1;
      const seg = torus(R, 0.09, emissive(TEAL, power), (Math.PI * 2) / SEGMENTS - 0.015, 4, 10);
      seg.rotation.y = -a0;
      parts.push(at(seg, 0, cy + 0.55, 0));
    }
    // central tower in the hole: a hull cylinder, bands, a lit ring and a dome with a mast
    parts.push(at(cylinder(0.62, 1.6, MAT.hull, 48, 0.05), 0, base, 0));
    for (const y of [0.3, 1.1]) parts.push(at(torus(0.625, 0.03, MAT.accent, Math.PI * 2, 48, 8), 0, base + y, 0));
    parts.push(at(torus(0.625, 0.025, emissive(TEAL, 1.6 + 0.8 * (f.working ? f.wave : 0.3)), Math.PI * 2, 48, 8), 0, base + 0.7, 0));
    parts.push(at(dome(0.62, 0.4, MAT.hull, 48, 8), 0, base + 1.6, 0));
    parts.push(at(cylinder(0.03, 0.5, MAT.steel, 10, 0.005), 0, base + 1.95, 0));
    parts.push(at(rivets(0.64, 24, 0.012, MAT.steel), 0, base + 0.5, 0));
    // spokes from the tower to the vessel (cooling manifolds)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(strut([Math.cos(a) * 0.6, base + 0.85, Math.sin(a) * 0.6], [Math.cos(a) * (R - 0.4), cy + 0.1, Math.sin(a) * (R - 0.4)], 0.05, MAT.steel, 10));
    }
    // four cooling tanks at the corners and the pipes to the vessel
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = sx * 1.95;
      const z = sz * 1.95;
      parts.push(at(cylinder(0.3, 1.0, MAT.hull, 32, 0.05), x, Y0, z));
      parts.push(at(torus(0.305, 0.02, MAT.accent, Math.PI * 2, 32, 8), x, Y0 + 0.35, z));
      parts.push(at(dome(0.3, 0.2, MAT.hull, 32, 6), x, Y0 + 1.0, z));
      parts.push(pipe([[x - sx * 0.2, Y0 + 0.6, z - sz * 0.2], [sx * 1.4, Y0 + 0.7, sz * 1.4], [sx * 1.05, cy + 0.2, sz * 1.05]], 0.06, MAT.steel, 0.18));
    }
    // control block at the front (+z) with a lit strip
    parts.push(at(bevelBox(1.0, 0.5, 0.4, 0.07, MAT.trim), 0.2, Y0 + 0.06, 2.0));
    parts.push(at(bevelBox(0.8, 0.06, 0.02, 0.01, emissive(TEAL, 1.8), 1), 0.2, Y0 + 0.36, 2.21));
    parts.push(at(vents(5, 0.06, 0.12, 0.05, MAT.deep), 0.2, Y0 + 0.14, 2.21));
    parts.push(at(taper(0.09, 0.05, 0.3, MAT.steel, 12), -0.4, Y0 + 0.06, 2.0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.light(Math.cos(a) * 1.9, Y0 + 1.25, Math.sin(a) * 1.9, TEAL, { r: 16, phase: i * 0.25, lamp: false });
    }
    k.light(0, base + 2.4, 0, COLORS.beacon, { r: 18, phase: 0.2, lamp: false });
    k.light(R, cy + 0.5, 0, TEAL, { r: 28, work: true, lamp: false });
    k.vent(1.95, Y0 + 1.3, -1.95);
    k.vent(-1.95, Y0 + 1.3, 1.95);
    k.wire(0, base + 2.45, 0);
    return group(...parts);
  },
});
