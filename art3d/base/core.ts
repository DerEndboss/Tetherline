import { PointLight, type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, lathe, lightPool, LOOP_FPS, MAT, model, ring, rivets, sizeOf, slab, strut, turn, vents, workLoop, WORLD, type Kit } from '../kit';

/**
 * The core (three stages that grow in place: shard, foundation, nucleus) and the storage that docks to it
 * (container 2x2, vault 3x3). Square decks fill the footprint; the deck rim stays low, so belts, drills and
 * unloaders touch every edge tile. Stage 1 is a ceramic reactor drum with a window band; stage 2 adds a second
 * tier, solar fins and a dish; stage 3 the gold crown, spire and a floating ring.
 * The core is always at work (kit/loop.ts): a ring of lights runs round the drum, the reactor glow breathes, the
 * dish turns (stage 2) and the floating ring turns its marks (stage 3). Deck, drum and silhouette stay still.
 */

const FRAMES = 12;
const TAU = Math.PI * 2;

const DECK = 0.07;
const WINDOW = emissive(COLORS.tech, 1.5);
const STRIP = emissive(COLORS.tech, 2.6);
const WARM = emissive(COLORS.accent, 1.8);

/** Deck with the lit landing ring, edge lamps flush with the plate and corner bastions. */
function deck(s: number, level: number): Object3D[] {
  const half = s / 2;
  const parts: Object3D[] = [slab(s, s, DECK, MAT.panel), at(bevelBox(s - 0.28, 0.02, s - 0.28, 0.01, MAT.trim, 1), 0, DECK, 0), at(bevelBox(s - 0.9, 0.012, s - 0.9, 0.006, MAT.hull, 1), 0, DECK + 0.02, 0)];
  parts.push(at(ring(s * 0.36, 0.012, STRIP, 64), 0, DECK + 0.03, 0), lightPool(half * 0.9, WORLD.tech, 0.1));
  const r = 0.17 + level * 0.02;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = a * (half - 0.38);
    const z = b * (half - 0.38);
    parts.push(at(cylinder(r, 0.2 + level * 0.05, MAT.gunmetal, 20, 0.03), x, DECK, z), at(cylinder(r * 0.7, 0.03, level === 3 ? MAT.gold : MAT.accent, 20, 0.008), x, DECK + 0.2 + level * 0.05, z), at(dome(0.05, 0.04, WARM, 12, 3), x, DECK + 0.23 + level * 0.05, z));
  }
  for (const q of [-1, 1]) parts.push(at(bevelBox(0.5, 0.01, 0.04, 0.004, STRIP, 1), q * (half * 0.55), DECK + 0.02, half - 0.14), at(bevelBox(0.04, 0.01, 0.5, 0.004, STRIP, 1), half - 0.14, DECK + 0.02, q * (half * 0.55)));
  return parts;
}

/** Light dashes round the drum above the window band; a bright spot runs round once per loop. */
function chaseRing(r: number, y: number, frame: number): Object3D[] {
  const n = 16;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const p = Math.max(0, Math.cos(a - (frame / FRAMES) * TAU)) ** 6;
    return turn(at(bevelBox(0.014, 0.05, 0.09, 0.005, emissive(COLORS.tech, 0.6 + 3.4 * p), 1), Math.cos(a) * r, y, -Math.sin(a) * r), a);
  });
}

/** The reactor drum on the deck: tiers by level. */
function reactor(k: Kit, s: number, level: number, frame: number): Object3D[] {
  const r = s * 0.25;
  const y0 = DECK + 0.02;
  const h1 = 0.55 + level * 0.1;
  const drum = at(lathe([[0, 0], [r + 0.06, 0], [r + 0.06, 0.06], [r, 0.12], [r, h1 - 0.1], [r - 0.04, h1 - 0.02], [r - 0.1, h1]], 48, MAT.hull), 0, y0, 0);
  const skirt = at(cylinder(r + 0.1, 0.06, MAT.trim, 48, 0.02), 0, y0, 0);
  const orange = at(cylinder(r + 0.012, 0.05, MAT.accent, 48, 0.01), 0, y0 + 0.14, 0);
  const win = at(cylinder(r + 0.014, 0.1, WINDOW, 48, 0.01), 0, y0 + h1 - 0.28, 0);
  const grooves = [0.3, 0.42].map((y) => at(ring(r + 0.01, 0.006, MAT.deep, 48), 0, y0 + y, 0));
  const r2 = r * 0.72;
  const tier = at(lathe([[0, 0], [r2, 0], [r2, 0.22], [r2 - 0.08, 0.3], [r2 - 0.2, 0.34]], 40, MAT.hull), 0, y0 + h1, 0);
  const tierBand = at(cylinder(r2 + 0.01, 0.04, level === 3 ? MAT.gold : MAT.accent, 40, 0.008), 0, y0 + h1 + 0.08, 0);
  const cap = at(dome(r2 * 0.62, 0.2, MAT.glass, 32, 8), 0, y0 + h1 + 0.3, 0);
  const coreGlow = at(dome(r2 * 0.34, 0.12, emissive(COLORS.tech, 2.2 + 1.2 * Math.cos((frame / FRAMES) * TAU)), 20, 5), 0, y0 + h1 + 0.3, 0);
  const dashes = chaseRing(r + 0.016, y0 + h1 - 0.15, frame);
  const top = y0 + h1 + 0.52;
  k.hatch(0, top, 0);
  k.goods(half(s) - 0.6, DECK + 0.05, half(s) - 0.6);
  const mastH = 0.35 + level * 0.25;
  const mast = at(cylinder(0.018, mastH, MAT.steel, 10, 0.004), 0, top - 0.05, 0);
  const beacon = at(dome(0.035, 0.035, MAT.beacon, 12, 3), 0, top - 0.05 + mastH, 0);
  k.light(0, top - 0.05 + mastH + 0.03, 0, COLORS.beacon, { r: 16, phase: 0.1, size: 0.03 });
  k.wire(0.3, y0 + h1 + 0.2, 0.3);
  const glow = new PointLight(COLORS.tech, 0.6, 2.2, 1.5);
  glow.position.set(0, y0 + h1, 0);
  return [skirt, drum, orange, win, ...grooves, tier, tierBand, cap, coreGlow, ...dashes, mast, beacon, glow];
}

const half = (s: number): number => s / 2;

/** Modules that each stage adds: side blocks with solar fins, a dish, gold crown, spire, the floating ring. */
function upgrades(s: number, level: number, frame: number): Object3D[] {
  const out: Object3D[] = [];
  const reach = s * 0.25 + 0.34;
  if (level >= 2) {
    for (const q of [0, 1, 2, 3]) {
      const a = (q * Math.PI) / 2 + Math.PI / 4;
      const mod = group(at(bevelBox(0.5, 0.26, 0.34, 0.05, MAT.hull), 0, 0, 0), at(bevelBox(0.51, 0.03, 0.35, 0.01, MAT.accent, 1), 0, 0.11, 0), at(bevelBox(0.36, 0.012, 0.22, 0.006, MAT.solar, 1), 0, 0.26, 0), at(vents(3, 0.06, 0.03, 0.03, MAT.deep), 0, 0.05, 0.17));
      out.push(at(turn(mod, -a), Math.cos(a) * (reach + 0.12), DECK + 0.02, Math.sin(a) * (reach + 0.12)));
    }
    // the dish sweeps the sky: its feed arm and lit horn turn round the mast, one lap per loop
    const feed = turn(group(strut([0, 0.44, 0], [0.12, 0.56, 0], 0.01, MAT.steel, 8), at(dome(0.03, 0.03, STRIP, 12, 3), 0.12, 0.55, 0), at(bevelBox(0.14, 0.02, 0.05, 0.008, MAT.accent, 1), 0.0, 0.43, 0)), (frame / FRAMES) * TAU);
    const dish = group(at(cylinder(0.025, 0.4, MAT.steel, 10, 0.005), 0, 0, 0), at(dome(0.16, 0.07, MAT.hull, 24, 5), 0.0, 0.4, 0), feed);
    out.push(at(dish, -0.55, DECK + 0.02, -0.5));
    out.push(at(ring(s * 0.25 + 0.2, 0.014, MAT.steel, 64), 0, DECK + 0.16, 0));
  }
  if (level >= 3) {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = a * (s * 0.25 + 0.55);
      const z = b * (s * 0.25 + 0.55);
      out.push(at(cylinder(0.07, 0.95, MAT.gunmetal, 12, 0.015), x, DECK, z), at(cylinder(0.09, 0.04, MAT.gold, 12, 0.01), x, DECK + 0.9, z), at(dome(0.045, 0.04, STRIP, 10, 3), x, DECK + 0.95, z));
      out.push(strut([x, DECK + 0.1, z], [x * 0.35, DECK + 0.3, z * 0.35], 0.018, MAT.steel));
    }
    out.push(at(ring(s * 0.25 + 0.05, 0.03, MAT.gold, 64), 0, DECK + 1.35, 0), at(ring(s * 0.25 + 0.05, 0.012, STRIP, 64), 0, DECK + 1.35, 0));
    // marks on the floating ring turn a quarter (their symmetry) per loop
    const rr = s * 0.25 + 0.05;
    const marks = [0, 1, 2, 3].map((q) => turn(at(bevelBox(0.08, 0.05, 0.06, 0.015, emissive(COLORS.tech, 2.6), 1), rr, -0.025, 0), -(q * TAU) / 4 - (frame / FRAMES) * (TAU / 4)));
    out.push(at(group(...marks), 0, DECK + 1.35, 0));
    out.push(at(cylinder(s * 0.25 + 0.14, 0.04, MAT.gold, 48, 0.01), 0, DECK + 0.62, 0));
  }
  return out;
}

const STAGES: [string, number][] = [['core-shard', 1], ['core-foundation', 2], ['core-nucleus', 3]];
for (const [id, level] of STAGES) {
  const build = (k: Kit, frame: number): Object3D => {
    const s = sizeOf(id);
    return group(...deck(s, level), ...reactor(k, s, level, frame), ...upgrades(s, level, frame), at(rivets(s * 0.25 + 0.04, 40, 0.01, MAT.trim), 0, DECK + 0.3, 0));
  };
  workLoop({ key: `building-${id}`, count: FRAMES, fps: LOOP_FPS, build }, { bloom: 0.4 }, { idleSprite: true });
}

/* ---------- Container and vault ---------- */

model('container', (k: Kit) => {
  const s = sizeOf('container');
  const w = s - 0.5;
  k.light(w / 2 - 0.1, 0.62, w / 2 - 0.1, COLORS.tech, { r: 10, phase: 0.3, size: 0.02 });
  k.goods(0.3, 0.6, 0.3);
  k.wire(-w / 2 + 0.15, 0.7, -w / 2 + 0.15);
  const box = at(bevelBox(w, 0.5, w, 0.07, MAT.hull), 0, DECK, 0);
  const stripe = at(bevelBox(w + 0.01, 0.06, w + 0.01, 0.02, MAT.accent, 1), 0, DECK + 0.32, 0);
  const ribs = [-0.5, -0.17, 0.17, 0.5].map((t) => at(bevelBox(0.05, 0.4, w + 0.03, 0.015, MAT.trim, 1), t * w * 0.9, DECK + 0.04, 0));
  const ribsZ = [-0.5, 0.5].map((t) => at(bevelBox(w + 0.03, 0.4, 0.05, 0.015, MAT.trim, 1), 0, DECK + 0.04, t * w * 0.9));
  const door = at(bevelBox(0.7, 0.28, 0.02, 0.01, MAT.deep, 1), 0, DECK + 0.1, w / 2 + 0.01);
  const handle = at(bevelBox(0.3, 0.03, 0.03, 0.01, MAT.steel, 1), 0, DECK + 0.22, w / 2 + 0.03);
  const lid = at(bevelBox(w - 0.2, 0.03, w - 0.2, 0.01, MAT.trim, 1), 0, DECK + 0.5, 0);
  const lamp = at(cylinder(0.04, 0.08, MAT.gunmetal, 12, 0.01), w / 2 - 0.1, DECK + 0.5, w / 2 - 0.1);
  // roof detail for the plan view: two hatches, a vent grille, panel seams and a hazard corner
  const roofY = DECK + 0.53;
  const hatches = [-0.32, 0.32].map((x) => group(at(bevelBox(0.42, 0.02, 0.3, 0.01, MAT.steel, 1), x, roofY, -0.2), at(bevelBox(0.3, 0.012, 0.03, 0.006, MAT.accent, 1), x, roofY + 0.02, -0.2)));
  const grille = at(vents(5, 0.05, 0.012, 0.035, MAT.deep), 0, roofY, 0.28).rotateX(0);
  const seams = [-1, 1].map((t) => at(bevelBox(0.012, 0.01, w - 0.3, 0.004, MAT.deep, 1), t * 0.62, roofY, 0));
  const warn = at(bevelBox(0.3, 0.01, 0.07, 0.003, MAT.hazard, 1), -0.45, roofY, 0.42);
  return group(...hatches, ...seams, warn, grille, slab(s, s, DECK, MAT.panel), at(bevelBox(s - 0.2, 0.015, s - 0.2, 0.006, MAT.trim, 1), 0, DECK, 0), box, stripe, ...ribs, ...ribsZ, door, handle, lid, lamp, at(dome(0.045, 0.04, STRIP, 10, 3), w / 2 - 0.1, DECK + 0.58, w / 2 - 0.1));
}, { bloom: 0.3 });

model('vault', (k: Kit) => {
  const s = sizeOf('vault');
  const w = s - 0.55;
  const h = 0.7;
  k.light(w / 2 - 0.15, h + 0.2, w / 2 - 0.15, COLORS.tech, { r: 11, phase: 0.6, size: 0.022 });
  k.goods(-0.3, h + 0.1, 0.3);
  k.wire(-w / 2 + 0.2, h + 0.18, -w / 2 + 0.2);
  const body = at(bevelBox(w, h, w, 0.1, MAT.gunmetal), 0, DECK, 0);
  const plates = at(bevelBox(w - 0.12, h - 0.14, w + 0.02, 0.05, MAT.trim), 0, DECK + 0.07, 0);
  const frame = (y: number): Object3D[] => [-1, 1].flatMap((t) => [at(bevelBox(w + 0.04, 0.05, 0.06, 0.02, MAT.gold, 1), 0, y, t * (w / 2 - 0.01)), at(bevelBox(0.06, 0.05, w + 0.04, 0.02, MAT.gold, 1), t * (w / 2 - 0.01), y, 0)]);
  const crown = group(...frame(DECK + h - 0.05), at(bevelBox(w - 0.2, 0.025, w - 0.2, 0.012, MAT.trim, 1), 0, DECK + h - 0.012, 0), at(ring(0.4, 0.02, MAT.gold, 40), 0, DECK + h + 0.012, 0));
  const base = group(...frame(DECK));
  // the round door on the +Z face, a wheel on top of it
  const doorY = DECK + h * 0.5;
  const door = group(at(cylinder(0.4, 0.05, MAT.steel, 40, 0.012), 0, 0, 0), at(ring(0.4, 0.028, MAT.gold, 40), 0, 0.03, 0), at(cylinder(0.11, 0.07, MAT.accent, 24, 0.012), 0, 0.04, 0));
  door.rotation.x = Math.PI / 2;
  door.position.set(0, doorY, w / 2 + 0.02);
  const spokes = [0, 1, 2].map((i) => at(turn(bevelBox(0.36, 0.03, 0.03, 0.01, MAT.steel, 1), (i * Math.PI) / 3), 0, 0, 0));
  const wheel = group(...spokes);
  wheel.position.set(0, doorY, w / 2 + 0.11);
  wheel.rotation.x = Math.PI / 2;
  const hinges = [-0.3, 0.3].map((t) => at(bevelBox(0.05, 0.14, 0.05, 0.015, MAT.deep, 1), -w / 2 + 0.04, DECK + h * 0.5 + t * 0.4, w / 2 + 0.02));
  const lamps = [-1, 1].map((t) => at(bevelBox(0.05, 0.3, 0.012, 0.004, STRIP, 1), t * (w / 2 - 0.2), DECK + h * 0.5 - 0.15, w / 2 + 0.01));
  const sideStrip = at(bevelBox(0.012, 0.05, w * 0.6, 0.004, STRIP, 1), w / 2 + 0.005, DECK + h * 0.7, 0);
  const hazard = at(bevelBox(w * 0.5, 0.012, 0.1, 0.004, MAT.hazard, 1), 0, DECK + h, w / 2 - 0.2);
  const roofY = DECK + h + 0.016;
  const roof = [at(vents(6, 0.06, 0.012, 0.04, MAT.deep), 0.55, roofY, 0.55), at(bevelBox(0.5, 0.012, 0.5, 0.01, MAT.gunmetal, 1), -0.45, roofY, -0.45), at(cylinder(0.17, 0.025, MAT.steel, 24, 0.008), -0.45, roofY, -0.45), at(ring(0.17, 0.01, MAT.accent, 24), -0.45, roofY + 0.025, -0.45), at(bevelBox(0.9, 0.01, 0.02, 0.004, MAT.deep, 1), 0.2, roofY, -0.2), at(bevelBox(0.02, 0.01, 0.9, 0.004, MAT.deep, 1), -0.05, roofY, 0.2), at(dome(0.04, 0.03, STRIP, 10, 3), 0.8, roofY, -0.8)];
  return group(...roof, slab(s, s, DECK, MAT.panel), at(bevelBox(s - 0.2, 0.015, s - 0.2, 0.006, MAT.trim, 1), 0, DECK, 0), body, plates, base, crown, door, wheel, ...hinges, ...lamps, sideStrip, hazard, at(rivets(0.52, 20, 0.01, MAT.trim), 0, DECK + h + 0.0, 0).rotateX(0), lightPool(1.2, WORLD.tech, 0.06));
}, { bloom: 0.3 });
