import { type Object3D } from 'three';
import { at, bevelBox, COLORS, chevron, cylinder, dome, emissive, group, heading, lathe, LOOP_FPS, MAT, rivets, slab, sprite, strut, turn, workLoop, type Kit } from '../kit';

/**
 * The item steering pieces: junction, router, sorter, overflow gate, bridge, unloader. All 1x1 on the square slab,
 * lanes open at the middle of every edge (belts dock without a gap), corner posts instead of rails.
 * Junction, router, sorter, overflow gate and unloader play a work loop while items pass (kit/loop.ts): lights
 * run along the arrows, rotors turn, flaps wave; slab, lanes and posts stay still.
 */

const FRAMES = 12;
const TAU = Math.PI * 2;

/** Registers `building-<id>` (frame 0) and its work loop. */
function looped(id: string, build: (k: Kit, frame: number) => Object3D): void {
  workLoop({ key: `building-${id}`, count: FRAMES, fps: LOOP_FPS, build }, {}, { idleSprite: true });
}

/** A light that runs past `q` of `n` places once per loop: 0..1, sharp peak. */
const chase = (frame: number, q: number, n: number, dir = 1): number => Math.max(0, Math.cos(TAU * (frame / FRAMES - (dir * q) / n))) ** 4;

/** A material that glows `p` (0..1) on top of a dim base: the lit arrows and marks. */
const lit = (p: number, color: string = COLORS.tech): ReturnType<typeof emissive> => emissive(color, 0.35 + 2.6 * p);

const SLAB = 0.045;
const LANE = 0.058;
const POST = 0.1;
const LIGHT = emissive(COLORS.tech, 2.2);

/** Slab, the cross of lanes and four corner posts: the common body of every router piece. */
function cross(): Object3D[] {
  const parts: Object3D[] = [slab(1, 1, SLAB, MAT.panel)];
  parts.push(at(bevelBox(1, LANE - SLAB, 0.62, 0.004, MAT.rubber, 1), 0, SLAB, 0));
  parts.push(at(bevelBox(0.62, LANE - SLAB, 1, 0.004, MAT.rubber, 1), 0, SLAB, 0));
  for (const x of [-1, 1]) for (const z of [-1, 1]) parts.push(at(bevelBox(0.2, POST - SLAB, 0.2, 0.025, MAT.trim, 2), x * 0.4, SLAB, z * 0.4));
  return parts;
}

/** Four chevrons around the middle, each glowing as the light runs past it (`frame`), pointing outward. */
function litArrows(r: number, frame: number, dir = 1): Object3D[] {
  return [0, 1, 2, 3].map((q) => at(turn(chevron(0, 0, 0.12, 0.08, 0.032, 0.008, lit(chase(frame, q, 4, dir))), (-q * Math.PI) / 2), Math.cos((q * Math.PI) / 2) * r, LANE, Math.sin((q * Math.PI) / 2) * r));
}

looped('junction', (k: Kit, f: number) => {
  k.wire(0, 0.2, 0);
  const cap = at(bevelBox(0.4, 0.05, 0.4, 0.02, MAT.hull), 0, LANE, 0);
  // the two bars of the cross mark take turns, like the two lines that cross here
  const mark = [0, 1].map((i) => at(bevelBox(i ? 0.03 : 0.24, 0.01, i ? 0.24 : 0.03, 0.004, lit(0.5 + 0.5 * Math.cos(TAU * (f / FRAMES + i / 2))), 1), 0, LANE + 0.05, 0));
  // straight-through arrows: opposite pairs light together
  const arrowsLit = [0, 1, 2, 3].map((q) => at(turn(chevron(0, 0, 0.12, 0.08, 0.032, 0.008, lit(chase(f, q % 2, 2))), (-q * Math.PI) / 2), Math.cos((q * Math.PI) / 2) * 0.36, LANE, Math.sin((q * Math.PI) / 2) * 0.36));
  return group(...cross(), cap, ...mark, ...arrowsLit);
});

/** The router's distributor: four paddles on a collar around the hub top, turned by `a`. */
function distributor(a: number): Object3D {
  const paddles = [0, 1, 2, 3].map((i) => turn(at(bevelBox(0.1, 0.03, 0.04, 0.01, i === 0 ? MAT.accent : MAT.steel, 1), 0.13, 0, 0), -(i * TAU) / 4));
  return turn(group(cylinder(0.12, 0.025, MAT.gunmetal, 24, 0.008), ...paddles.map((p) => at(p, 0, 0.02, 0))), a);
}

looped('router', (k: Kit, f: number) => {
  k.light(0, 0.2, 0, COLORS.tech, { r: 10, phase: 0.1, size: 0.02 });
  const hub = lathe([[0, LANE], [0.24, LANE], [0.25, LANE + 0.02], [0.22, LANE + 0.09], [0.15, LANE + 0.13], [0, LANE + 0.14]], 32, MAT.hull);
  const band = at(cylinder(0.255, 0.022, MAT.accent, 32, 0.006), 0, LANE + 0.035, 0);
  const rotor = at(distributor((f * TAU) / 2 / FRAMES), 0, LANE + 0.125, 0);
  const lamp = at(dome(0.06, 0.04, LIGHT, 16, 4), 0, LANE + 0.17, 0);
  return group(...cross(), hub, band, rotor, lamp, ...litArrows(0.37, f));
});

looped('sorter', (k: Kit, f: number) => {
  k.light(0, 0.2, 0, COLORS.tech, { r: 10, phase: 0.5, size: 0.02 });
  const body = at(bevelBox(0.46, 0.1, 0.46, 0.03, MAT.hull), 0, LANE, 0);
  const lensRim = at(cylinder(0.14, 0.02, MAT.gunmetal, 24, 0.006), 0, LANE + 0.1, 0);
  const lens = at(dome(0.11, 0.05, MAT.glass, 24, 6), 0, LANE + 0.115, 0);
  const core = at(dome(0.05, 0.03, lit(0.45 + 0.4 * Math.cos(TAU * (f / FRAMES) * 2)), 16, 4), 0, LANE + 0.12, 0);
  // a scanner bar sweeps round under the lens, a full lap per loop
  const scan = at(turn(at(bevelBox(0.1, 0.008, 0.016, 0.003, emissive(COLORS.tech, 3), 1), 0.05, 0, 0), (f * TAU) / FRAMES), 0, LANE + 0.118, 0);
  const dots = [-1, 0, 1].map((i) => at(cylinder(0.022, 0.012, chase(f, i + 1, 3) > 0.5 ? lit(1, COLORS.accent) : i === 0 ? MAT.hazard : MAT.accent, 12, 0.004), i * 0.11, LANE + 0.1, 0.19));
  return group(...cross(), body, lensRim, lens, core, scan, ...dots, ...litArrows(0.37, f, -1));
});

looped('overflow-gate', (_k: Kit, f: number) => {
  const body = at(bevelBox(0.46, 0.09, 0.46, 0.03, MAT.trim), 0, LANE, 0);
  // the slats flap open one after the other, a wave across the gate
  const slats = [-0.13, 0, 0.13].map((z, i) => {
    const s = at(bevelBox(0.4, 0.016, 0.06, 0.006, MAT.hazard, 1), 0, 0, 0);
    s.rotation.x = 0.5 * Math.max(0, Math.sin(TAU * (f / FRAMES - i / 6)));
    return at(group(s), 0, LANE + 0.095, z);
  });
  const front = at(chevron(0, 0, 0.2, 0.12, 0.04, 0.012, emissive(COLORS.accent, 1.2 + 1.6 * chase(f, 0, 1))), 0.13, LANE + 0.1, 0);
  return group(...cross(), body, ...slats, front, at(cylinder(0.05, 0.03, MAT.steel, 16, 0.008), 0, LANE + 0.105, 0), ...litArrows(0.37, f));
});

/** Gantry that the bridge sprites share: a ceramic tower with an arch for the belt, a dish and a lit emitter. */
function gantry(k: Kit, frame = 0): Object3D {
  const tower = at(bevelBox(0.5, 0.26, 0.5, 0.05, MAT.hull), 0, SLAB, 0);
  const arch = at(bevelBox(0.22, 0.15, 0.52, 0.04, MAT.deep, 2), 0, SLAB + 0.02, 0);
  const band = at(bevelBox(0.51, 0.03, 0.51, 0.012, MAT.accent, 1), 0, SLAB + 0.2, 0);
  const mast = at(cylinder(0.014, 0.2, MAT.steel, 10, 0.004), 0.12, SLAB + 0.26, 0.12);
  const dish = at(dome(0.09, 0.05, MAT.steel, 20, 5), -0.05, SLAB + 0.26, -0.05);
  // the emitter pulses as items are thrown, and three rings run out along the mast
  const emit = at(cylinder(0.075, 0.03, lit(0.3 + 0.7 * chase(frame, 0, 1)), 20, 0.008), 0.255, SLAB + 0.13, 0);
  const rings = [0, 1, 2].map((i) => {
    const t = (frame / FRAMES + i / 3) % 1;
    return at(cylinder(0.03, 0.012, emissive(COLORS.tech, 0.4 + 2.6 * Math.sin(t * Math.PI)), 12, 0.003), 0.12, SLAB + 0.28 + 0.15 * t, 0.12);
  });
  k.light(0.12, SLAB + 0.47, 0.12, COLORS.beacon, { r: 9, phase: 0.2, size: 0.018 });
  k.wire(0.12, SLAB + 0.46, 0.12);
  return group(tower, arch, band, mast, dish, emit, ...rings, at(rivets(0.2, 8, 0.008, MAT.trim), 0, SLAB + 0.26, 0));
}

function bridge(k: Kit, rot: number, frame: number): Object3D {
  const stub = at(bevelBox(0.3, LANE - SLAB, 0.62, 0.004, MAT.rubber, 1), -0.35, SLAB, 0);
  const rails = [-1, 1].map((s) => at(bevelBox(0.3, POST - SLAB, 0.1, 0.02, MAT.trim, 2), -0.35, SLAB, s * 0.36));
  const ramp = at(bevelBox(0.16, 0.06, 0.4, 0.02, MAT.steel), -0.17, SLAB, 0);
  return heading(group(slab(1, 1, SLAB, MAT.panel), stub, ...rails, ramp, gantry(k, frame)), rot);
}

// the game draws the plain id for every heading: it carries the loop; -r0..3 stay still pictures (icons, overviews)
looped('bridge-conveyor', (k: Kit, f: number) => bridge(k, 0, f));
for (let r = 0; r < 4; r++) sprite({ id: `building-bridge-conveyor-r${r}`, build: (k) => bridge(k, r, 0) });

/** Vanes around the unloader's nozzle (6), turned by `a`. */
function vanes(a: number): Object3D {
  return turn(group(...Array.from({ length: 6 }, (_, i) => turn(at(bevelBox(0.1, 0.035, 0.03, 0.008, i % 2 ? MAT.steel : MAT.accent, 1), 0.15, 0, 0), -(i * TAU) / 6))), a);
}

looped('unloader', (k: Kit, f: number) => {
  k.light(0, 0.34, 0, COLORS.accent, { r: 10, phase: 0.7, size: 0.02 });
  const body = at(bevelBox(0.5, 0.2, 0.5, 0.05, MAT.hull), 0, SLAB, 0);
  const band = at(bevelBox(0.51, 0.03, 0.51, 0.012, MAT.accent, 1), 0, SLAB + 0.12, 0);
  const nozzle = at(lathe([[0, 0], [0.12, 0], [0.12, 0.03], [0.08, 0.07], [0.05, 0.12], [0, 0.12]], 24, MAT.steel), 0, SLAB + 0.2, 0);
  const eye = at(dome(0.04, 0.03, emissive(COLORS.accent, 1.2 + 1.4 * chase(f, 0, 1)), 14, 4), 0, SLAB + 0.32, 0);
  const ring6 = at(vanes((f * TAU) / 3 / FRAMES), 0, SLAB + 0.2, 0);
  const ports = [0, 1, 2, 3].map((q) => heading(at(bevelBox(0.14, 0.07, 0.2, 0.02, MAT.deep, 1), 0.31, SLAB, 0), q));
  const portLights = [0, 1, 2, 3].map((q) => heading(at(bevelBox(0.016, 0.02, 0.12, 0.005, lit(chase(f, q, 4)), 1), 0.38, SLAB + 0.05, 0), q));
  const hose = at(strut([0.05, 0.1, 0.1], [-0.12, 0.2, 0.15], 0.012, MAT.rubber), 0, SLAB, 0);
  return group(slab(1, 1, SLAB, MAT.panel), body, band, ...ports, ...portLights, nozzle, ring6, eye, hose);
});
