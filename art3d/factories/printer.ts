import { type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, emissive, group, MAT, pipe, surface, taper, vents } from '../kit';
import { LOOP, machine } from './common';

/**
 * The 3D printer (frames, motors, core chips): a gantry cube. The work frames are the print layers: the part on
 * the bed grows layer by layer over the loop (five layers, striated), the nozzle rides on the cross beam over the newest layer.
 * The idle picture shows the finished part with the nozzle parked.
 */

const Y0 = 0.07;
const TEAL = COLORS.tech;
const LAYERS = 5;

machine({
  id: '3d-printer',
  size: 3,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    // lower cabinet: the machine bed housing with lit strip, vents and a filament drawer
    parts.push(at(bevelBox(2.3, 0.5, 2.3, 0.1, MAT.hull), 0, Y0 - 0.02, 0));
    parts.push(at(bevelBox(2.32, 0.1, 2.32, 0.04, MAT.accent), 0, Y0 + 0.2, 0));
    parts.push(at(bevelBox(1.4, 0.06, 0.02, 0.01, emissive(TEAL, 1.8), 1), -0.3, Y0 + 0.38, 1.16));
    parts.push(at(vents(6, 0.06, 0.18, 0.05, MAT.deep), 0.55, Y0 + 0.05, 1.16));
    parts.push(at(bevelBox(0.02, 0.06, 1.2, 0.01, emissive(TEAL, 1.4), 1), 1.16, Y0 + 0.38, 0));
    // build plate: dark with a steel frame and a grid of small studs
    parts.push(at(bevelBox(1.6, 0.06, 1.6, 0.03, MAT.gunmetal), 0, Y0 + 0.48, 0));
    parts.push(at(bevelBox(1.44, 0.03, 1.44, 0.02, MAT.deep, 1), 0, Y0 + 0.53, 0));
    // four corner posts and a top frame
    const top = Y0 + 2.0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(at(bevelBox(0.14, 1.6, 0.14, 0.04, MAT.trim), sx * 1.05, Y0 + 0.45, sz * 1.05));
      parts.push(at(cylinder(0.05, 0.07, MAT.accent, 16), sx * 1.05, top + 0.0, sz * 1.05));
    }
    for (const s of [-1, 1]) {
      parts.push(at(bevelBox(2.28, 0.1, 0.12, 0.03, MAT.gunmetal), 0, top - 0.1, s * 1.05));
      parts.push(at(bevelBox(0.12, 0.1, 2.28, 0.03, MAT.gunmetal), s * 1.05, top - 0.1, 0));
    }
    // the part: layers stacked on the bed, each a thin slab in the part's colour with a lit top layer while printing
    const have = f.working ? Math.floor(f.t * LAYERS) + 1 : LAYERS;
    const layerH = 0.12;
    const partMat = surface('#c8ccd4', { rough: 0.35, coat: 0.5 });
    const layerMat = surface('#aeb4c2', { rough: 0.4, coat: 0.3 });
    for (let l = 0; l < have; l++) {
      const s = 1.0 - l * 0.06;
      parts.push(at(bevelBox(s, layerH * 0.86, s, 0.012, l % 2 ? layerMat : partMat, 1), 0, Y0 + 0.55 + l * layerH, 0));
    }
    if (f.working) parts.push(at(bevelBox(0.96 - have * 0.06, 0.012, 0.96 - have * 0.06, 0.004, emissive(TEAL, 1.0), 1), 0, Y0 + 0.55 + have * layerH - 0.004, 0));
    // the cross beam rides along z, the carriage along x; both lazily sweep with the frame
    const sweep = f.working ? Math.sin(f.lap * 2) : 0;
    const bz = 0.5 * sweep;
    const cx = f.working ? 0.42 * Math.cos(f.lap * 3) : 0.9;
    const nozzleY = Y0 + 0.55 + have * layerH + 0.12;
    parts.push(at(bevelBox(2.2, 0.12, 0.12, 0.035, MAT.steel, 2), 0, top - 0.2, f.working ? bz : 0.95));
    parts.push(at(bevelBox(0.3, 0.22, 0.3, 0.06, MAT.hull), f.working ? cx : 0.9, top - 0.31, f.working ? bz : 0.95));
    parts.push(at(bevelBox(0.3, 0.05, 0.3, 0.02, MAT.accent), f.working ? cx : 0.9, top - 0.34, f.working ? bz : 0.95));
    const nz = f.working ? nozzleY : top - 0.55;
    const nx = f.working ? cx : 0.9;
    const nzz = f.working ? bz : 0.95;
    parts.push(at(taper(0.07, 0.015, 0.2, MAT.steel, 16), nx, nz, nzz));
    parts.push(at(cylinder(0.05, Math.max(0.05, top - 0.34 - (nz + 0.2)), MAT.gunmetal, 14, 0.008), nx, nz + 0.2, nzz));
    parts.push(at(cylinder(0.025, 0.02, emissive('#ffb060', f.working ? 2.4 : 0.6), 10, 0.004), nx, nz - 0.01, nzz));
    // filament spools on the +x post, a cable run to the carriage
    parts.push(at(cylinder(0.17, 0.12, MAT.accent, 24, 0.02), 1.0, top - 0.5, -0.5));
    parts.push(at(cylinder(0.17, 0.12, MAT.hull, 24, 0.02), 1.0, top - 0.36, -0.5));
    parts.push(pipe([[1.0, top - 0.25, -0.5], [0.9, top - 0.05, -0.1], [nx, top - 0.2, nzz]], 0.018, MAT.rubber, 0.12));
    parts.push(at(bevelBox(0.5, 0.18, 0.1, 0.03, MAT.trim), -0.5, top - 0.05, -1.05).translateY(0.1));
    const lamp = k.light(nx, nz - 0.02, nzz, TEAL, { r: 20, work: true, lamp: false });
    k.vent(0, top + 0.3, 0);
    k.goods(0, Y0 + 0.9, 0);
    return group(...parts, ...(lamp ? [lamp] : []));
  },
});
