import type { Object3D } from 'three';
import { at, bevelBox, clipAt, COLORS, cylinder, dome, emissive, frames, group, Kit, lathe, MAT, ring, sprite, strut, surface, taper, topOf, turn } from '../kit';
import { POST } from './fabricator';
import { VAT_X, VAT_Z } from './mixer';


/**
 * The moving parts of the crafting machines: the parts printed layer by layer on the fabricator's bed
 * (origin = bed top, clipped at 10 heights with a glowing hot layer), the print bridge and nozzle head, and the
 * mixer's vat liquid, swirl frames and stirrer shaft (origin = liquid surface centre).
 */

const gloss = (c: string, metal = 0.1): ReturnType<typeof surface> => surface(c, { rough: 0.28, coat: 0.7, metal });

/* ---------- printed parts ---------- */

function truss(): Object3D {
  const s = 0.17;
  const h = 0.5;
  const m = gloss('#7fd1c7', 0.25);
  const c: [number, number][] = [[-s, -s], [s, -s], [s, s], [-s, s]];
  const parts: Object3D[] = [];
  c.forEach(([x, z], i) => {
    const [nx, nz] = c[(i + 1) % 4]!;
    parts.push(strut([x, 0, z], [x, h, z], 0.026, m, 12));
    for (const y of [0.02, h * 0.5, h - 0.02]) parts.push(strut([x, y, z], [nx, y, nz], 0.018, m, 10));
    parts.push(strut([x, 0.02, z], [nx, h * 0.5, nz], 0.012, m, 8), strut([x, h * 0.5, z], [nx, h - 0.02, nz], 0.012, m, 8));
  });
  return group(...parts);
}

function coil(): Object3D {
  const flange = gloss('#5d6a94', 0.4);
  const copper = gloss('#f0b45c', 0.7);
  const wire = gloss('#c8863a', 0.7);
  const parts: Object3D[] = [
    cylinder(0.19, 0.045, flange, 32),
    at(lathe([[0.15, 0.045], [0.165, 0.07], [0.165, 0.33], [0.15, 0.36]], 40, copper), 0, 0, 0),
    at(cylinder(0.19, 0.045, flange, 32), 0, 0.375, 0),
    at(cylinder(0.06, 0.4, gloss('#a3afcc', 0.6), 16), 0, 0.02, 0),
  ];
  for (let i = 0; i < 9; i++) parts.push(at(ring(0.168, 0.008, wire, 40), 0, 0.09 + i * 0.027, 0));
  return group(...parts);
}

function board(): Object3D {
  const green = gloss('#5fd38a');
  const chip = gloss('#2c3246', 0.3);
  const gold = gloss('#ffd98a', 0.9);
  const parts: Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const y = i * 0.12;
    parts.push(at(bevelBox(0.42, 0.04, 0.42, 0.012, green, 2), 0, y, 0), at(bevelBox(0.17, 0.045, 0.17, 0.01, chip, 2), 0, y + 0.04, 0));
    parts.push(at(bevelBox(0.08, 0.02, 0.05, 0.005, gold, 1), 0.14, y + 0.04, -0.12), at(bevelBox(0.05, 0.02, 0.08, 0.005, gold, 1), -0.13, y + 0.04, 0.12));
    if (i < 2) for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]] as const) parts.push(at(cylinder(0.018, 0.08, gold, 10), x, y + 0.04, z));
  }
  return group(...parts);
}

function orb(): Object3D {
  const steel = gloss('#9aa6c4', 0.6);
  const glow = emissive('#d9b2ff', 1.6);
  const base = lathe([[0, 0], [0.14, 0], [0.15, 0.02], [0.12, 0.06], [0.06, 0.09], [0, 0.09]], 28, steel);
  const sphere = at(lathe(Array.from({ length: 21 }, (_, i) => [Math.max(0.005, 0.17 * Math.sin((Math.PI * i) / 20)), -0.17 * Math.cos((Math.PI * i) / 20)] as [number, number]), 36, glow), 0, 0.2, 0);
  const rings = [0.25, 0.1].map((t, i) => turn(at(ring(0.19 + i * 0.01, 0.012, steel, 40), 0, 0.2, 0), i));
  rings[0]!.rotation.x = 0.5;
  rings[1]!.rotation.z = 0.5;
  return group(base, sphere, ...rings);
}

const PRINTS: Record<string, { model: () => Object3D; h: number }> = {
  frame: { model: truss, h: 0.5 },
  conductor: { model: coil, h: 0.42 },
  circuit: { model: board, h: 0.36 },
  core: { model: orb, h: 0.4 },
};

for (const [id, def] of Object.entries(PRINTS)) {
  frames(Array.from({ length: 10 }, (_, s) => `print-${id}-${s}`), {
    shadow: 0.3,
    build: (k: Kit, s: number) => {
      const m = def.model();
      if (s === 9) {
        k.top(def.h);
        return m;
      }
      const cut = (def.h * (s + 1)) / 10;
      const seam = clipAt(m, cut, 0.02);
      k.top(cut);
      void topOf;
      return group(m, seam);
    },
  });
}

/* ---------- bridge and head ---------- */

sprite({
  id: 'print-bridge',
  ground: 'none',
  build: () => {
    const beam = strut([-POST, 0, POST], [POST, 0, -POST], 0.045, MAT.steel, 20);
    const stripe = strut([-POST + 0.1, 0.03, POST - 0.1], [POST - 0.1, 0.03, -POST + 0.1], 0.012, emissive(COLORS.tech, 2), 8);
    const sliders = ([-1, 1] as const).map((s) => group(at(bevelBox(0.17, 0.14, 0.17, 0.035, MAT.accent, 3), POST * s, -0.07, -POST * s), at(bevelBox(0.19, 0.02, 0.19, 0.008, MAT.hull, 2), POST * s, 0.07, -POST * s)));
    return group(beam, stripe, ...sliders);
  },
});

sprite({
  id: 'print-head',
  ground: 'none',
  build: () => {
    const nozzle = lathe([[0.01, 0], [0.03, 0.03], [0.05, 0.09]], 20, MAT.steel);
    const heater = at(cylinder(0.05, 0.06, MAT.ember, 16, 0.01), 0, 0.07, 0);
    const carriage = at(bevelBox(0.15, 0.17, 0.15, 0.03, MAT.hull), 0, 0.12, 0);
    const band = at(bevelBox(0.16, 0.03, 0.16, 0.01, MAT.accent, 2), 0, 0.2, 0);
    const fan = at(bevelBox(0.09, 0.07, 0.01, 0.004, MAT.deep, 1), 0, 0.17, 0.077);
    const tip = group(at(dome(0.014, 0.014, emissive('#fff0c8', 4), 12, 3), 0, 0.002, 0));
    const tube = strut([0, 0.29, 0], [0.06, 0.36, -0.06], 0.012, MAT.rubber, 8);
    return group(nozzle, heater, carriage, band, fan, tip, tube, at(taper(0.012, 0.012, 0.0, MAT.deep, 4), 0, 0, 0));
  },
});

/* ---------- vat parts ---------- */

const WHITE = emissive('#e6e6e6', 0.85);
const BRIGHT = emissive('#ffffff', 0.55);

sprite({
  id: 'vat-surface',
  ground: 'none',
  build: () => {
    const disc = lathe([[0, 0.012], [0.235, 0.008], [0.255, -0.004], [0.255, -0.02], [0, -0.02]], 48, WHITE);
    const lip = at(ring(0.246, 0.008, WHITE, 48), 0, 0, 0);
    const sheen = at(bevelBox(0.1, 0.004, 0.025, 0.002, BRIGHT, 1), -0.07, 0.014, -0.06);
    return group(disc, lip, sheen);
  },
});

sprite({
  id: 'vat-shaft',
  ground: 'none',
  build: () => {
    const shaft = cylinder(0.022, 0.43, gloss('#6f79a3', 0.6), 14, 0.006);
    const hub = lathe([[0.05, -0.012], [0.05, 0.03], [0.03, 0.045]], 18, MAT.steel);
    const paddle = at(bevelBox(0.2, 0.012, 0.04, 0.004, MAT.steel, 1), 0, 0.005, 0);
    return group(at(shaft, 0, 0.01, 0), hub, paddle);
  },
});

frames(['vat-swirl-0', 'vat-swirl-1', 'vat-swirl-2', 'vat-swirl-3'], {
  ground: 'none',
  build: (_k, frame) => {
    const R = 0.255;
    const arms: Object3D[] = [];
    for (let arm = 0; arm < 2; arm++) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const a = (frame / 4) * Math.PI + arm * Math.PI + t * 2.4;
        const r = R * (0.2 + 0.65 * t);
        pts.push([Math.cos(a) * r, 0.006, Math.sin(a) * r]);
      }
      for (let i = 0; i < pts.length - 1; i++) arms.push(strut(pts[i]!, pts[i + 1]!, 0.007 + 0.0035 * Math.sin((i / 14) * Math.PI), BRIGHT, 8));
    }
    return group(...arms);
  },
});
