import { type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, frames, group, LOOP_FPS, MAT, pipe, plan, ring, rivets, strut, taper, vents, workLoop } from '../kit';

import { megaPad, torus } from './common';
import { sizeOf } from '../factories/common';

/**
 * Space elevator: the megastructure that crowns a round, built in stages. The ground station is a round hub with a
 * dish ring; a slender tether tower with teal light strips climbs to an orbital cap; four guy cables run to anchor
 * blocks. Sprites:
 *  - `building-space-elevator`   the finished structure (climber parked at the bottom)
 *  - `building-space-elevator-s1..s3`   the stages: foundation, tower to a third, tower to two thirds (growing parts)
 *  - the work loop (kit/loop.ts, `-wb`, `-w0..w23`): the climber car rides up the tether, one trip in two seconds
 */

const Y0 = 0.07;
const TEAL = COLORS.tech;
const TOP = 4.6;
const SIZE = 6;
export const ID = 'space-elevator';

/** `reach` is how far up the tether is built (0..1); `car` is the climber's position along it, or null. */
function build(k: import('../kit').Kit, reach: number, car: number | null, finished: boolean): Object3D {
  const parts: Object3D[] = [];
  const base = Y0 + 0.06;
  const hubR = 1.25;
  // hub: a wide round base station with bands and vents
  parts.push(at(cylinder(hubR, 0.5, MAT.hull, 56, 0.07), 0, base, 0));
  parts.push(at(torus(hubR + 0.01, 0.04, MAT.accent, Math.PI * 2, 56, 8), 0, base + 0.2, 0));
  parts.push(at(torus(hubR + 0.01, 0.03, emissive(TEAL, 1.7), Math.PI * 2, 56, 8), 0, base + 0.36, 0));
  parts.push(at(rivets(hubR + 0.02, 30, 0.014, MAT.steel), 0, base + 0.28, 0));
  parts.push(at(cylinder(0.85, 0.2, MAT.trim, 48, 0.04), 0, base + 0.5, 0));
  // four anchor blocks at the corners and four guy cables up the tether (fewer cables in early stages)
  const anchors: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const guyTop = Math.min(TOP * 0.8, 0.9 + TOP * reach * 0.8);
  for (const [sx, sz] of anchors) {
    parts.push(at(bevelBox(0.5, 0.34, 0.5, 0.07, MAT.trim), sx * 2.35, Y0, sz * 2.35));
    parts.push(at(cylinder(0.12, 0.12, MAT.accent, 20), sx * 2.35, Y0 + 0.34, sz * 2.35));
    if (reach > 0.3) parts.push(strut([sx * 2.35, Y0 + 0.4, sz * 2.35], [sx * 0.1, base + guyTop, sz * 0.1], 0.012, MAT.steel, 6));
  }
  parts.push(at(vents(6, 0.06, 0.14, 0.05, MAT.deep), 0.0, base + 0.08, hubR + 0.01));
  // tether tower: sections of hull with teal strips, truss struts; grows with `reach`
  const h = Math.max(0.0, TOP * reach);
  if (h > 0) {
    const sections = Math.max(1, Math.round(h / 0.6));
    const sh = h / sections;
    for (let i = 0; i < sections; i++) {
      const r = 0.34 - 0.18 * (i / Math.max(1, sections - 1 || 1)) * Math.min(1, reach);
      const y = base + 0.7 + i * sh;
      parts.push(at(cylinder(r, sh - 0.02, MAT.hull, 32, 0.02), 0, y, 0));
      parts.push(at(torus(r + 0.004, 0.018, i % 2 ? MAT.accent : MAT.steel, Math.PI * 2, 32, 8), 0, y + sh * 0.5, 0));
      if (i % 2 === 0) parts.push(at(bevelBox(0.03, sh * 0.6, 0.02, 0.008, emissive(TEAL, 1.8), 1), 0, y + sh * 0.2, r + 0.01));
    }
    // four vertical rails (the climber's tracks)
    for (const [sx, sz] of anchors) parts.push(strut([sx * 0.28, base + 0.7, sz * 0.28], [sx * 0.14, base + 0.7 + h, sz * 0.14], 0.016, MAT.gunmetal, 6));
    parts.push(at(dome(0.18, 0.12, MAT.steel, 20, 4), 0, base + 0.7 + h, 0));
    if (reach < 1) parts.push(at(torus(0.2, 0.02, emissive('#ffe9a8', 2.6), Math.PI * 2, 20, 6), 0, base + 0.7 + h - 0.02, 0));
  }
  // the orbital cap when finished: a wide ring station, with lit windows and a beacon
  if (finished) {
    const ty = base + 0.7 + h;
    parts.push(at(cylinder(0.28, 0.2, MAT.hull, 36, 0.03), 0, ty, 0));
    parts.push(at(torus(0.62, 0.07, MAT.hull, Math.PI * 2, 48, 14), 0, ty + 0.2, 0));
    parts.push(at(torus(0.62, 0.03, MAT.accent, Math.PI * 2, 48, 8), 0, ty + 0.2 + 0.07, 0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push(at(bevelBox(0.06, 0.04, 0.03, 0.01, emissive(TEAL, 2.0), 1), Math.cos(a) * 0.62, ty + 0.2, Math.sin(a) * 0.62).rotateY(-a - Math.PI / 2));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(strut([Math.cos(a) * 0.28, ty + 0.1, Math.sin(a) * 0.28], [Math.cos(a) * 0.58, ty + 0.2, Math.sin(a) * 0.58], 0.018, MAT.steel, 6));
    }
    parts.push(at(cylinder(0.12, 0.12, MAT.trim, 20, 0.02), 0, ty + 0.3, 0));
    parts.push(at(cylinder(0.02, 0.3, MAT.steel, 8, 0.004), 0, ty + 0.42, 0));
    k.light(0, ty + 0.78, 0, COLORS.beacon, { r: 20, phase: 0.3, lamp: true, size: 0.03 });
    k.wire(0, ty + 0.7, 0);
  }
  // climber car: a small hull cabin with a lit window on the rails
  if (car !== null && finished) {
    const cy = base + 0.9 + car * (h - 1.2);
    parts.push(at(bevelBox(0.34, 0.46, 0.34, 0.08, MAT.hull), 0, cy, 0));
    parts.push(at(bevelBox(0.36, 0.06, 0.36, 0.02, MAT.accent, 2), 0, cy + 0.12, 0));
    parts.push(at(bevelBox(0.2, 0.12, 0.02, 0.01, emissive(TEAL, 2.0), 1), 0, cy + 0.2, 0.18));
    k.light(0, cy + 0.2, 0.2, TEAL, { r: 14, work: true, lamp: false });
  }
  k.light(hubR - 0.1, base + 0.36, 0, TEAL, { r: 20, phase: 0.1, lamp: false });
  k.goods(0, base + 0.7, hubR);
  k.vent(0.6, base + 0.7, -0.9);
  void pipe;
  void ring;
  void taper;
  return group(...parts);
}

const fullId = `building-${ID}`;
const WORK = 24;
const stage = (n: number): string => `${fullId}-s${n}`;
plan([fullId, stage(1), stage(2), stage(3)]);

const pad = (): Object3D => megaPad(sizeOf(ID, SIZE));


frames([stage(1), stage(2), stage(3)], { samples: 24, build: (k, i) => group(pad(), build(k, [0.0, 0.33, 0.66][i]!, null, false)) });
workLoop({ key: fullId, count: WORK, fps: LOOP_FPS, build: (k, i) => group(pad(), build(k, 1, (i + 0.5) / WORK, true)), idle: (k) => group(pad(), build(k, 1, 0, true)) }, { samples: 24 }, { idleSprite: true });
