import { shade } from './color';
import { GOLD, type BuildingModel, type ModelKit } from './machines';
import { beam, circlePoints, crystal, lathe, overlay, type Material, type Rig, type Solid } from './solid';
import { polyline, polyPts, type SpriteLight, type Svg } from './svg';
import { project } from './solid';
import { TECH } from './tech';

/**
 * The Skyforge, the megastructure at the back corner of the map (docs/art-direction.md, "Skyforge"). It is
 * the player's tech at its biggest: a round foundation with four pylons (level 1), then one stage per level,
 * each fed with parts and raised by build drones: a tapering steel lattice spine with a teal conduit inside
 * (2), copper coil drums wound round it and four buttresses (3), a platform with a fan of lumen-glass lenses
 * (4), and the heart: a glowing core in a gold cradle (5). When it stands, the renderer adds a beam into the
 * sky. Each stage's own solids are its `fresh` parts, so a stage under construction can rise on its own.
 * 4 x 4 footprint; x, y in tiles with the footprint centred on 0; z in world px.
 */

const DECK = 42;
const SPINE_BASE = 70;
const SPINE_TOP = 330;
const PLATFORM = 344;
const HEART = 404;
/** Sprite headroom above the footprint centre (the tower is much taller than any other building). */
export const SKYFORGE_HEADROOM = 500;

const COPPER: Material = { main: '#e39a62', dark: '#6b3222' };
const LUMEN: Material = { main: '#d2c4ff', dark: '#5b41c4', emissive: true };
const CORE: Material = { main: '#fbe2ff', dark: '#a04ee0', emissive: true };
const LUMEN_GLOW = '#a891ff';
const CORE_GLOW = '#e3a8ff';

type Stage = (k: ModelKit) => { solids: Solid[]; lights: SpriteLight[] };

/** Level -> the parts that level adds (level 1 is the foundation). */
const STAGES: readonly Stage[] = [foundation, spine, coils, lenses, heart];

/** The height each level reaches (sprite top, effects, the weld aim). */
const TOPS = [62, SPINE_TOP + 16, SPINE_TOP + 16, PLATFORM + 84, HEART + 44];

export function skyforgePart(k: ModelKit): BuildingModel {
  const level = Math.max(1, Math.min(STAGES.length, k.level));
  const body: Solid[] = [];
  const lights: SpriteLight[] = [];
  let fresh: Solid[] = [];
  STAGES.slice(0, level).forEach((stage, i) => {
    const add = stage(k);
    body.push(...add.solids);
    lights.push(...add.lights);
    if (i === level - 1) fresh = add.solids;
  });
  const pad = lathe(0, 0, [[1.96, -6], [1.96, 4], [1.88, 8]], 8, k.panel, Math.PI / 8);
  return {
    pad: [pad],
    marks: (svg, rig) => deckMarks(svg, rig, k),
    body,
    fresh,
    lights,
    top: TOPS[level - 1]!,
    vents: [k.at(0, 0, level >= 5 ? HEART : TOPS[level - 1]!)],
  };
}

/* ---------- Level 1: foundation ---------- */

function foundation(k: ModelKit): { solids: Solid[]; lights: SpriteLight[] } {
  const drum = lathe(0, 0, [[1.56, 6], [1.56, 20]], 16, k.hull);
  const band = overlay(lathe(0, 0, [[1.565, 10], [1.565, 15]], 16, k.accent, 0, true));
  const walk = lathe(0, 0, [[1.52, 20], [1.5, 24]], 16, k.panel);
  const tier = lathe(0, 0, [[1.02, 23], [1.02, DECK - 4], [0.96, DECK]], 16, k.hull);
  const windows = overlay(lathe(0, 0, [[1.026, 28], [1.026, 34]], 16, k.tech, 0, true));
  const solids: Solid[] = [drum, band, walk, tier, windows];
  // The socket the spine will stand in; covered by the spine's collar from level 2 on.
  if (k.level === 1) solids.push(overlay(lathe(0, 0, [[0.62, DECK], [0.62, DECK + 1]], 12, k.dark)));
  const lights: SpriteLight[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 1.62;
    const y = Math.sin(a) * 1.62;
    // The front pylon stands in front of the window band (drawn after the overlays).
    const front = i === 0;
    const parts = [lathe(x, y, [[0.2, 6], [0.2, 40], [0.15, 48]], 10, k.hull), overlay(lathe(x, y, [[0.205, 24], [0.205, 30]], 10, k.accent, 0, true)), lathe(x, y, [[0.08, 48], [0.06, 54]], 8, k.tech)];
    solids.push(...parts.map((p) => (front ? { ...p, layer: 2 + (p.layer ?? 0) * 0.1 } : p)));
    lights.push(k.light(x, y, 54, k.palette.tech, 14, i / 4));
  }
  return { solids, lights };
}

/** A big teal ring on the pad and a dashed one on the deck, chevrons pointing in. */
function deckMarks(svg: Svg, rig: Rig, k: ModelKit): void {
  const ring = circlePoints(rig, 0, 0, 1.78, 8.2, 64);
  svg.add(polyline([...ring, ring[0]!], k.palette.tech, 2.4, 'opacity="0.5"'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tip = project(rig, { x: c * 1.66, y: s * 1.66, z: 8.2 });
    const l = project(rig, { x: c * 1.86 - s * 0.1, y: s * 1.86 + c * 0.1, z: 8.2 });
    const r = project(rig, { x: c * 1.86 + s * 0.1, y: s * 1.86 - c * 0.1, z: 8.2 });
    svg.add(polyPts([l, tip, r], 'none', `stroke="${TECH.accent}" stroke-width="2.4" stroke-linejoin="round" opacity="0.8"`));
  }
}

/* ---------- Level 2: the lattice spine ---------- */

/** Corner of the lattice at height z: it tapers from 0.46 tiles at the base to 0.2 at the top. */
function corner(i: number, z: number): { x: number; y: number; z: number } {
  const t = (z - SPINE_BASE) / (SPINE_TOP - SPINE_BASE);
  const r = 0.56 - 0.32 * t;
  const sx = i === 0 || i === 3 ? -1 : 1;
  const sy = i < 2 ? -1 : 1;
  return { x: sx * r, y: sy * r, z };
}

function spine(k: ModelKit): { solids: Solid[]; lights: SpriteLight[] } {
  const steel: Material = { ...k.steel, bare: true };
  const collar = lathe(0, 0, [[0.86, DECK], [0.82, SPINE_BASE - 10], [0.66, SPINE_BASE]], 12, k.hull);
  const collarBand = overlay(lathe(0, 0, [[0.85, DECK + 8], [0.842, DECK + 14]], 12, k.accent, 0, true));
  const posts = [0, 1, 2, 3].map((i) => beam(corner(i, SPINE_BASE), corner(i, SPINE_TOP), 0.07, { ...k.steel }));
  const braces: Solid[] = [];
  const rings = 6;
  for (let r = 0; r < rings; r++) {
    const z0 = SPINE_BASE + ((SPINE_TOP - SPINE_BASE) * r) / rings;
    const z1 = SPINE_BASE + ((SPINE_TOP - SPINE_BASE) * (r + 1)) / rings;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      braces.push(beam(corner(i, z0), corner(j, z1), 0.03, steel));
      braces.push(beam(corner(j, z0), corner(i, z1), 0.03, steel));
      braces.push(beam(corner(i, z1), corner(j, z1), 0.04, steel));
    }
  }
  const cap = lathe(0, 0, [[0.3, SPINE_TOP - 4], [0.34, SPINE_TOP + 6], [0.26, SPINE_TOP + 12]], 12, k.hull);
  const lights: SpriteLight[] = [0.25, 0.5, 0.75].map((t, i) => ({ ...k.light(0, 0, SPINE_BASE + (SPINE_TOP - SPINE_BASE) * t, k.palette.tech, 16, i / 3), work: true }));
  lights.push(k.light(0, 0, SPINE_TOP + 14, TECH.beacon, 16, 0.5));
  return { solids: [collar, collarBand, ...posts, ...braces, cap], lights };
}

/* ---------- Level 3: coils and buttresses ---------- */

/** A ring of short copper beams around the spine (a coil): convex pieces sort right around the lattice. */
function coilRing(r: number, z: number, n: number): Solid[] {
  return Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    return beam({ x: Math.cos(a0) * r, y: Math.sin(a0) * r, z }, { x: Math.cos(a1) * r, y: Math.sin(a1) * r, z }, 0.085, { ...COPPER, bare: true });
  });
}

function coils(k: ModelKit): { solids: Solid[]; lights: SpriteLight[] } {
  const solids: Solid[] = [];
  const lights: SpriteLight[] = [];
  [[132, 0.86], [196, 0.74], [258, 0.62]].forEach(([z, r], i) => {
    solids.push(...coilRing(r!, z!, 22));
    lights.push({ ...k.light(0, 0, z! + 5, k.palette.tech, 26, i / 3), work: true });
  });
  // Buttresses from the walkway to the spine, set between the pylons so none crosses the tower's middle.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    solids.push(beam({ x: Math.cos(a) * 1.3, y: Math.sin(a) * 1.3, z: 24 }, { x: Math.cos(a) * 0.4, y: Math.sin(a) * 0.4, z: 226 }, 0.1, k.hull));
    solids.push(lathe(Math.cos(a) * 1.3, Math.sin(a) * 1.3, [[0.13, 22], [0.11, 32]], 8, k.accentBody));
  }
  return { solids, lights };
}

/* ---------- Level 4: the lens array ---------- */

function lenses(k: ModelKit): { solids: Solid[]; lights: SpriteLight[] } {
  const deck = lathe(0, 0, [[0.4, SPINE_TOP + 8], [0.82, PLATFORM - 4], [0.82, PLATFORM], [0.76, PLATFORM + 4]], 16, k.hull);
  const band = overlay(lathe(0, 0, [[0.822, PLATFORM - 3], [0.822, PLATFORM]], 16, k.accent, 0, true));
  const petals: Solid[] = [];
  const lights: SpriteLight[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 0.56;
    const y = Math.sin(a) * 0.56;
    petals.push(crystal(x, y, 0.15, 54, 26, Math.cos(a) * 0.0046, Math.sin(a) * 0.0046, LUMEN, 4, a, PLATFORM - 2));
    lights.push(k.light(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, PLATFORM + 64, LUMEN_GLOW, 20, i / 8));
  }
  return { solids: [deck, band, ...petals], lights };
}

/* ---------- Level 5: the heart ---------- */

function heart(k: ModelKit): { solids: Solid[]; lights: SpriteLight[] } {
  const gold: Material = { main: GOLD, dark: shade(GOLD, -0.45) };
  const cradle = lathe(0, 0, [[0.22, PLATFORM + 4], [0.3, PLATFORM + 16], [0.38, PLATFORM + 24]], 12, gold);
  const prongs = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    return beam({ x: Math.cos(a) * 0.34, y: Math.sin(a) * 0.34, z: PLATFORM + 22 }, { x: Math.cos(a) * 0.3, y: Math.sin(a) * 0.3, z: HEART + 8 }, 0.055, { ...gold, bare: true });
  });
  const orb = lathe(0, 0, [[0.08, HEART - 34], [0.22, HEART - 27], [0.32, HEART - 13], [0.35, HEART], [0.32, HEART + 13], [0.22, HEART + 26], [0.08, HEART + 33]], 16, CORE);
  const lights: SpriteLight[] = [k.light(0, 0, HEART, CORE_GLOW, 46, 0), k.light(0, 0, HEART, '#ffffff', 18, 0.5)];
  return { solids: [cradle, ...prongs, { ...orb, layer: 1 }], lights };
}

/** The light of the finished heart, for the renderer's beam (sprite-relative, like a light). */
export function skyforgeHeart(k: ModelKit): { x: number; y: number } {
  return k.at(0, 0, HEART);
}

export const SKYFORGE_COLORS = { lumen: LUMEN_GLOW, core: CORE_GLOW } as const;
