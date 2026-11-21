import { ownedIds, at, bevelBox, cylinder, dome, emissive, group, heading, lathe, MAT, model, rivets, sizeOf, slab, type Kit } from '../kit';
import { content } from '../../src/content';
import type { Object3D } from 'three';

/**
 * Pumps that belong to this category (a content building in category `liquids` with the `pump` behaviour; the
 * mechanical pump lives in mining and is modelled there). A round housing on a square deck, an intake grate on
 * top, outlets at the edges. Size from the content; bigger pumps get more motor rings.
 */

const DECK = 0.05;
const LIQUID = emissive('#7cc8ee', 1.5);

function pump(id: string, k: Kit): Object3D {
  const s = sizeOf(id);
  const r = s * 0.34;
  k.light(0, DECK + 0.45, 0, '#7cc8ee', { r: 10, phase: 0.3, size: 0.02 });
  const housing = at(lathe([[0, 0], [r, 0], [r + 0.02, 0.03], [r, 0.22], [r - 0.06, 0.3], [0, 0.32]], 36, MAT.hull), 0, DECK, 0);
  const band = at(cylinder(r + 0.015, 0.035, MAT.accent, 36, 0.008), 0, DECK + 0.1, 0);
  const grate = at(cylinder(r * 0.55, 0.03, MAT.deep, 28, 0.006), 0, DECK + 0.3, 0);
  const bars = [0, 1, 2].map((i) => heading(at(bevelBox(r * 1.0, 0.025, 0.035, 0.008, MAT.steel, 1), 0, DECK + 0.33, 0), i * 0.33));
  const core = at(dome(0.07, 0.05, LIQUID, 14, 4), 0, DECK + 0.34, 0);
  const outlets = [0, 1, 2, 3].map((q) => heading(at(bevelBox(s / 2 - r + 0.05, 0.16, 0.22, 0.04, MAT.trim), r + (s / 2 - r) / 2 - 0.02, DECK, 0), q));
  return group(slab(s, s, DECK, MAT.panel), ...outlets, housing, band, grate, ...bars, core, at(rivets(r - 0.04, 16, 0.01, MAT.trim), 0, DECK + 0.22, 0));
}

const owned = new Set(ownedIds('liquids'));
for (const def of content.buildings.list) {
  if (def.category === 'liquids' && def.behaviour === 'pump' && owned.has(`building-${def.id}`)) model(def.id, (k: Kit) => pump(def.id, k), { bloom: 0.25 });
}
