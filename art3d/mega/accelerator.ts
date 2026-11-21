import { type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, MAT, pipe, vents } from '../kit';
import { machine } from '../factories/common';
import { headGlow, megaPad, torus } from './common';

/**
 * Particle accelerator: a big ring of magnets around a glass-clear beam pipe, a detector hall in the middle and a
 * straight injector. Work frames: a bright particle bunch runs round the beam pipe (12 frames, one lap a second); the idle
 * picture shows a dim pipe.
 */

const Y0 = 0.07;
const TEAL = COLORS.tech;
const R = 2.05;
const MAGNETS = 24;
const SEGMENTS = 24;
const FRAMES = 12;

machine({
  id: 'particle-accelerator',
  size: 6,
  frames: FRAMES,
  pad: megaPad,
  samples: 24,
  body: (k, f) => {
    const parts: Object3D[] = [];
    const base = Y0 + 0.06;
    const ty = base + 0.45;
    // ring track: a low girder under the magnets
    parts.push(at(torus(R, 0.2, MAT.gunmetal, Math.PI * 2, 96, 8), 0, base + 0.12, 0));
    // beam pipe: lit segments with the bunch head, visible between magnets
    const head = f.working ? f.lap : 0;
    for (let s = 0; s < SEGMENTS; s++) {
      const a0 = (s / SEGMENTS) * Math.PI * 2;
      const mid = a0 + Math.PI / SEGMENTS;
      const power = f.working ? 0.5 + 3.6 * headGlow(mid, head, 8) : 0.7;
      const seg = torus(R, 0.07, emissive(TEAL, power), (Math.PI * 2) / SEGMENTS - 0.01, 4, 10);
      seg.rotation.y = -a0;
      parts.push(at(seg, 0, ty, 0));
    }
    // magnets: hull blocks around the pipe, alternating bend (hull) and focus (trim) magnets with orange bands
    for (let i = 0; i < MAGNETS; i++) {
      const a = ((i + 0.5) / MAGNETS) * Math.PI * 2;
      const bend = i % 3 !== 0;
      const m = group(
        at(bevelBox(bend ? 0.42 : 0.3, 0.52, 0.5, 0.08, bend ? MAT.hull : MAT.trim), 0, -0.26, 0),
        at(bevelBox(bend ? 0.44 : 0.32, 0.07, 0.52, 0.03, MAT.accent, 2), 0, -0.05, 0),
        ...(bend ? [at(bevelBox(0.3, 0.03, 0.34, 0.012, MAT.steel, 1), 0, 0.0, 0)] : []),
      );
      m.rotation.y = -a - Math.PI / 2;
      parts.push(at(m, Math.cos(a) * R, ty + 0.26, Math.sin(a) * R));
    }
    // detector hall in the middle: a wide drum with a dome, bands and a lit strip
    parts.push(at(cylinder(0.95, 0.55, MAT.hull, 48, 0.06), 0, base, 0));
    parts.push(at(torus(0.955, 0.03, MAT.accent, Math.PI * 2, 48, 8), 0, base + 0.3, 0));
    parts.push(at(torus(0.955, 0.022, emissive(TEAL, 1.6 + 0.8 * (f.working ? f.wave : 0.3)), Math.PI * 2, 48, 8), 0, base + 0.42, 0));
    parts.push(at(dome(0.95, 0.55, MAT.hull, 48, 10), 0, base + 0.55, 0));
    parts.push(at(torus(0.45, 0.025, MAT.steel, Math.PI * 2, 36, 8), 0, base + 1.0, 0));
    parts.push(at(cylinder(0.05, 0.3, MAT.steel, 12, 0.008), 0, base + 1.08, 0));
    // injector: a straight tube from the hall to the ring on the +x side with four orange RF cavities
    parts.push(at(bevelBox(0.95, 0.12, 0.12, 0.04, MAT.steel, 2), 1.5, ty - 0.02, 0));
    for (let i = 0; i < 4; i++) {
      parts.push(at(bevelBox(0.16, 0.2, 0.2, 0.05, i % 2 ? MAT.accent : MAT.hull), 1.2 + i * 0.22, ty - 0.1, 0));
      parts.push(at(bevelBox(0.05, 0.03, 0.12, 0.01, emissive(TEAL, 1.5), 1), 1.2 + i * 0.22, ty + 0.1, 0));
    }
    // cooling tanks at the four corners, pipes to the magnets
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = sx * 2.5;
      const z = sz * 2.5;
      parts.push(at(cylinder(0.28, 0.9, MAT.hull, 32, 0.05), x, Y0, z));
      parts.push(at(torus(0.285, 0.02, MAT.accent, Math.PI * 2, 32, 8), x, Y0 + 0.3, z));
      parts.push(at(dome(0.28, 0.16, MAT.hull, 32, 6), x, Y0 + 0.9, z));
      parts.push(pipe([[x - sx * 0.2, Y0 + 0.55, z - sz * 0.2], [sx * 2.0, Y0 + 0.5, sz * 2.0], [sx * 1.5, ty + 0.1, sz * 1.5]], 0.05, MAT.steel, 0.16));
    }
    // control block at the front with a lit strip and vents
    parts.push(at(bevelBox(1.1, 0.46, 0.38, 0.07, MAT.trim), 0.0, Y0 + 0.06, 2.65));
    parts.push(at(bevelBox(0.9, 0.06, 0.02, 0.01, emissive(TEAL, 1.8), 1), 0.0, Y0 + 0.34, 2.85));
    parts.push(at(vents(5, 0.06, 0.1, 0.05, MAT.deep), 0.0, Y0 + 0.14, 2.85));
    k.light(R, ty + 0.2, 0, TEAL, { r: 30, work: true, lamp: false });
    k.light(0, base + 1.4, 0, COLORS.beacon, { r: 16, phase: 0.4, lamp: false });
    k.vent(-2.5, Y0 + 1.1, -2.5);
    k.vent(2.5, Y0 + 1.1, 2.5);
    k.wire(0, base + 1.4, 0);
    return group(...parts);
  },
});
