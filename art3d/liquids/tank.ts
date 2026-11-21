import { type Object3D } from 'three';
import { at, bevelBox, cylinder, dome, emissive, group, heading, lathe, lightPool, MAT, model, ring, rivets, sizeOf, slab, strut, vents, WORLD, type Kit } from '../kit';

/** Tank (3x3): a ceramic drum on a square deck, a lit level gauge, a pipe stub at every edge tile. */

const DECK = 0.07;
const LIQUID = emissive('#7cc8ee', 1.6);

model('tank', (k: Kit) => {
  const s = sizeOf('tank');
  const half = s / 2;
  const r = half * 0.8;
  const h = 0.95;
  k.light(0.0, DECK + h + 0.3, 0, '#7cc8ee', { r: 12, phase: 0.4, size: 0.025 });
  k.wire(-0.5, DECK + h + 0.05, -0.5);
  const drum = at(lathe([[0, 0], [r - 0.02, 0], [r, 0.03], [r, h - 0.1], [r - 0.06, h - 0.02], [r - 0.2, h + 0.06], [0.2, h + 0.1], [0, h + 0.1]], 48, MAT.hull), 0, DECK, 0);
  const bands = [0.2, 0.7].map((y) => at(cylinder(r + 0.012, 0.05, MAT.accent, 48, 0.01), 0, DECK + y, 0));
  const foot = at(cylinder(r + 0.06, 0.1, MAT.trim, 48, 0.025), 0, DECK, 0);
  // level gauge on the side that faces the camera
  const a = Math.PI / 4;
  const gx = Math.cos(a) * (r + 0.01);
  const gz = Math.sin(a) * (r + 0.01);
  const gauge = group(at(bevelBox(0.16, 0.62, 0.07, 0.02, MAT.deep), 0, 0, 0), at(bevelBox(0.06, 0.52, 0.03, 0.01, LIQUID, 1), 0, 0.05, 0.02));
  gauge.rotation.y = -a + Math.PI / 2;
  gauge.position.set(gx, DECK + 0.15, gz);
  const lid = at(cylinder(0.3, 0.07, MAT.steel, 32, 0.015), 0, DECK + h + 0.1, 0);
  const valve = at(ring(0.1, 0.014, MAT.accent, 24), 0.0, DECK + h + 0.2, 0);
  const vstem = at(cylinder(0.025, 0.1, MAT.gunmetal, 12, 0.006), 0, DECK + h + 0.17, 0);
  const rail = at(ring(r - 0.12, 0.012, MAT.hazard, 48), 0, DECK + h + 0.02, 0);
  const stubs: Object3D[] = [];
  for (let q = 0; q < 4; q++) {
    for (const t of [-1, 0, 1]) {
      const stub = group(at(cylinder(0.11, half - 0.55, MAT.hull, 20, 0.01), 0, 0, 0), at(cylinder(0.14, 0.07, MAT.steel, 20, 0.01), 0, half - 0.6, 0));
      stub.rotation.z = -Math.PI / 2;
      const wrap = group(at(stub, 0.55, 0.17, t));
      stubs.push(heading(wrap, q));
    }
  }
  const brace = [0, 1, 2, 3].map((q) => heading(at(strut([r - 0.05, 0.12, 0.0], [r + 0.3, 0.02, 0.0], 0.03, MAT.gunmetal), 0, DECK, 0), q));
  const ventRow = at(vents(4, 0.1, 0.05, 0.05, MAT.deep), -0.9, DECK + 0.05, half - 0.4);
  const pad = [slab(s, s, DECK, MAT.panel), at(bevelBox(s - 0.3, 0.02, s - 0.3, 0.01, MAT.trim, 1), 0, DECK, 0), lightPool(half * 0.8, WORLD.tech, 0.06)];
  return group(...pad, foot, drum, ...bands, gauge, lid, vstem, valve, rail, ...stubs, ...brace, ventRow, at(rivets(r - 0.05, 36, 0.012, MAT.trim), 0, DECK + 0.45, 0), at(dome(0.05, 0.04, LIQUID, 12, 3), 0.0, DECK + h + 0.3, 0));
}, { bloom: 0.25 });
