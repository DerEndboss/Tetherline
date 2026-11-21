import type { Material, Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, emissive, group, MAT, plate, ring, surface, type Kit } from '../kit';

/**
 * Circuit-board deco props: RAM sticks in their slots, motherboards, a CPU on its
 * socket and two small boards. Every piece stands inside one tile (|x|, |z| <= 0.36), stays low and quiet so the
 * map is not cluttered, and reads as a tiny piece of hardware. Lit sides face the camera (+X and +Z).
 */

const PCB = surface('#27386a', { rough: 0.36, metal: 0.3, coat: 0.6 });
const PCB_DARK = surface('#161d3d', { rough: 0.5, metal: 0.2, coat: 0.4 });
const TRACE = emissive(COLORS.tech, 1.0);
const LED = emissive(COLORS.tech, 2.6);
const LED_AMBER = emissive('#ffb347', 2.3);
const LED_GREEN = emissive('#7dffa8', 2.1);
const SCREEN = emissive(COLORS.tech, 1.35);
const STRIP = emissive(COLORS.tech, 2.2);
const COPPER = surface('#e39a62', { rough: 0.28, metal: 0.9, coat: 0.4 });
const SILVER = surface('#d6dcee', { rough: 0.22, metal: 0.85, coat: 0.5 });

/** A board `w` x `d` on four small standoffs; its top is at y = 0.058. */
function pcb(w: number, d: number, mat: Material = PCB): Object3D {
  const standoffs = ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([x, z]) => at(cylinder(0.018, 0.03, MAT.gunmetal, 10, 0.004), x * (w / 2 - 0.035), 0, z * (d / 2 - 0.035)));
  const edge = at(bevelBox(w - 0.1, 0.008, 0.01, 0.003, TRACE, 1), 0, 0.05, d / 2 - 0.008);
  const edgeX = at(bevelBox(0.01, 0.008, d - 0.1, 0.003, TRACE, 1), w / 2 - 0.008, 0.05, 0);
  return group(...standoffs, at(plate(w, d, 0.028, mat, 0.01), 0, 0.03, 0), edge, edgeX);
}

/** Flat traces: thin teal bars along a polyline of (x, z) points, on the board top. */
function traces(points: readonly (readonly [number, number])[]): Object3D {
  const parts: Object3D[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const bar = bevelBox(bx === ax ? 0.008 : len, 0.004, bx === ax ? len : 0.008, 0.0015, TRACE, 1);
    parts.push(at(bar, (ax + bx) / 2, 0.058, (az + bz) / 2));
  }
  return group(...parts);
}

const Y = 0.058;

/** Small SMD capacitors / resistors scattered on a board. */
function smd(spots: readonly (readonly [number, number, number])[]): Object3D {
  return group(...spots.map(([x, z, r], i) => at(bevelBox(r ? 0.04 : 0.024, 0.018, r ? 0.022 : 0.04, 0.005, i % 3 === 0 ? MAT.gold : MAT.steel, 1), x, Y, z)));
}

/** A RAM stick standing in a slot: slate board, four black chips on the visible face, a gold-capped top. */
function stick(h: number, len: number, spreader: boolean, lit: boolean): Object3D {
  const body = bevelBox(0.016, h, len, 0.005, spreader ? MAT.accent : MAT.trim, 2);
  const chips = Array.from({ length: 4 }, (_, i) => at(bevelBox(0.008, h * 0.4, len * 0.17, 0.003, MAT.deep, 1), 0.011, h * 0.3, -len * 0.36 + i * len * 0.24));
  const top = at(bevelBox(0.02, 0.014, len - 0.02, 0.004, lit ? LED : MAT.hull, 1), 0, h - 0.012, 0);
  const label = at(bevelBox(0.006, h * 0.12, len * 0.3, 0.002, MAT.hull, 1), 0.011, h * 0.8, len * 0.2);
  return group(body, ...chips, top, label);
}

/** A row of RAM slots (dark channels with latch clips); `filled` says which hold a stick. */
function slots(count: number, filled: readonly boolean[], spreader: boolean, pitch = 0.075, len = 0.4): Object3D {
  const parts: Object3D[] = [];
  const x0 = -((count - 1) * pitch) / 2;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * pitch;
    parts.push(at(bevelBox(0.034, 0.03, len, 0.008, MAT.deep, 1), x, 0, 0));
    parts.push(at(bevelBox(0.03, 0.05, 0.03, 0.006, MAT.accent, 1), x, 0, len / 2 + 0.01), at(bevelBox(0.03, 0.05, 0.03, 0.006, MAT.accent, 1), x, 0, -len / 2 - 0.01));
    if (filled[i]) parts.push(at(stick(spreader ? 0.2 : 0.16, len - 0.04, spreader, spreader), x, 0.03, 0));
  }
  return group(...parts);
}

function ram(k: Kit, variant: number): Object3D {
  const board = at(pcb(0.62, 0.52, PCB_DARK), 0, 0, 0);
  const s = at(slots(4, variant === 0 ? [false, true, false, true] : [true, true, false, false], variant === 1), 0, Y, -0.01);
  const rail = traces([[-0.26, 0.2], [0.26, 0.2]]);
  const caps = smd([[-0.25, 0.22, 0], [0.25, 0.22, 1], [-0.25, -0.22, 1]]);
  const led = at(bevelBox(0.02, 0.012, 0.012, 0.003, variant === 0 ? LED_GREEN : LED_AMBER, 1), 0.27, Y, 0.22);
  const l = k.light(0.27, Y + 0.02, 0.22, variant === 0 ? '#7dffa8' : '#ffb347', { r: 5, phase: 0.3 * variant, lamp: false });
  void l;
  return group(board, s, rail, caps, led);
}

/** A heatsink: base plate and `n` fins; the cap colour marks the CPU. */
function heatsink(w: number, h: number, n: number, mat: Material): Object3D {
  const base = bevelBox(w, 0.02, w, 0.006, MAT.gunmetal, 1);
  const fins = Array.from({ length: n }, (_, i) => at(bevelBox(w / (n * 1.9), h, w * 0.92, 0.004, mat, 1), -w / 2 + w * 0.06 + (i + 0.5) * ((w * 0.88) / n), 0.02, 0));
  return group(base, ...fins);
}

/** The motherboard, variant 0: CPU heatsink, four RAM slots with two sticks, VRM row, PCIe slot, chipset. */
function boardFull(): Object3D {
  const board = pcb(0.7, 0.66);
  const cpu = at(group(at(bevelBox(0.2, 0.014, 0.2, 0.005, MAT.deep, 1), 0, 0, 0), at(heatsink(0.17, 0.1, 6, MAT.steel), 0, 0.014, 0), at(bevelBox(0.17, 0.012, 0.012, 0.004, STRIP, 1), 0, 0.12, 0.1)), -0.12, Y, 0.04);
  const mem = at(slots(4, [true, false, true, false], false, 0.06, 0.36), 0.22, Y, 0.0);
  const vrm = at(group(bevelBox(0.3, 0.07, 0.06, 0.012, MAT.gunmetal), at(bevelBox(0.3, 0.012, 0.064, 0.004, MAT.accent, 1), 0, 0.06, 0)), -0.12, Y, -0.26);
  const caps = Array.from({ length: 5 }, (_, i) => at(cylinder(0.02, 0.045, i % 2 ? MAT.hull : MAT.steel, 12, 0.004), -0.32 + i * 0.044, Y, -0.17));
  const pcie = at(group(bevelBox(0.46, 0.022, 0.04, 0.006, MAT.deep, 1), at(bevelBox(0.4, 0.006, 0.01, 0.002, LED, 1), 0, 0.02, 0)), -0.02, Y, 0.27);
  const chipset = at(group(bevelBox(0.1, 0.03, 0.1, 0.012, MAT.accent, 1), at(bevelBox(0.07, 0.006, 0.07, 0.003, LED, 1), 0, 0.03, 0)), 0.04, Y, -0.1);
  const coin = at(cylinder(0.034, 0.016, SILVER, 18, 0.004), -0.28, Y, 0.27);
  const tr = traces([[-0.3, -0.05], [-0.3, 0.1], [-0.24, 0.1]]);
  const tr2 = traces([[0.08, 0.1], [0.08, 0.2], [0.14, 0.2]]);
  return group(board, cpu, mem, vrm, ...caps, pcie, chipset, coin, tr, tr2, smd([[0.1, 0.3, 1], [-0.34, -0.28, 0], [0.3, -0.28, 1]]));
}

/** The motherboard, variant 1: a compact board with a CPU fan, two RAM slots and a flat M.2 stick. */
function boardMini(): Object3D {
  const board = pcb(0.6, 0.6);
  const blades = [0, 1, 2, 3, 4].map((i) => {
    const b = at(bevelBox(0.1, 0.012, 0.035, 0.005, MAT.steel, 1), 0.05, 0.02, 0);
    const g = group(b);
    g.rotation.y = (i * Math.PI * 2) / 5;
    return g;
  });
  const fan = at(group(ring(0.13, 0.022, MAT.gunmetal, 28), at(cylinder(0.12, 0.014, MAT.deep, 28, 0.004), 0, 0, 0), at(cylinder(0.04, 0.05, MAT.accent, 16, 0.008), 0, 0.014, 0), ...blades.map((b) => at(b, 0, 0.012, 0))), -0.1, Y, 0.0);
  const mem = at(slots(2, [true, true], false, 0.065, 0.34), 0.2, Y, -0.04);
  const m2 = at(group(bevelBox(0.34, 0.012, 0.08, 0.004, PCB_DARK, 1), at(bevelBox(0.07, 0.016, 0.06, 0.004, MAT.deep, 1), 0.09, 0.012, 0), at(bevelBox(0.07, 0.016, 0.06, 0.004, MAT.deep, 1), -0.05, 0.012, 0)), -0.04, Y, -0.24);
  const port = at(group(bevelBox(0.1, 0.06, 0.06, 0.01, MAT.steel, 1), at(bevelBox(0.07, 0.03, 0.008, 0.003, MAT.deep, 1), 0, 0.015, 0.032)), 0.22, Y, 0.25);
  const led = at(bevelBox(0.02, 0.012, 0.012, 0.003, LED_GREEN, 1), -0.26, Y, 0.26);
  return group(board, fan, mem, m2, port, led, traces([[-0.26, -0.1], [-0.26, 0.1], [-0.2, 0.1]]), smd([[0.1, 0.26, 0], [-0.28, -0.26, 1], [0.28, 0.1, 0]]));
}

function motherboard(_k: Kit, variant: number): Object3D {
  return variant === 0 ? boardFull() : boardMini();
}

/** A CPU on its socket: a big heat spreader with a glowing ring and a notch, caps around the socket. */
function chip(k: Kit): Object3D {
  const board = pcb(0.54, 0.54);
  const socket = at(bevelBox(0.4, 0.026, 0.4, 0.01, MAT.deep, 1), 0, Y, 0);
  const pkg = at(bevelBox(0.34, 0.03, 0.34, 0.012, MAT.hull, 2), 0, Y + 0.024, 0);
  const spreader = at(bevelBox(0.29, 0.035, 0.29, 0.014, SILVER, 2), 0, Y + 0.052, 0);
  const halo = at(ring(0.075, 0.007, LED, 28), 0, Y + 0.09, 0);
  const core = at(cylinder(0.045, 0.012, MAT.deep, 20, 0.003), 0, Y + 0.082, 0);
  const notch = at(bevelBox(0.05, 0.012, 0.05, 0.004, MAT.accent, 1), -0.115, Y + 0.088, -0.115);
  const caps = Array.from({ length: 6 }, (_, i) => at(bevelBox(0.03, 0.018, 0.02, 0.005, i % 2 ? MAT.gold : MAT.steel, 1), -0.2 + i * 0.08, Y, 0.235));
  const l = k.light(0, Y + 0.1, 0, COLORS.tech, { r: 7, phase: 0.2, lamp: false });
  void l;
  return group(board, socket, pkg, spreader, halo, core, notch, ...caps, traces([[-0.24, -0.22], [-0.24, 0.2], [-0.2, 0.2]]));
}

/** Two small boards: a sensor board (screen, chips, pin header) and a power board (caps, coil, terminals). */
function smallBoard(k: Kit, variant: number): Object3D {
  if (variant === 0) {
    const base = pcb(0.56, 0.42);
    const screen = at(group(bevelBox(0.26, 0.016, 0.16, 0.006, MAT.deep, 1), at(bevelBox(0.22, 0.006, 0.12, 0.003, SCREEN, 1), 0, 0.012, 0), ...[0, 1, 2, 3].map((i) => at(bevelBox(0.03, 0.01 + i * 0.008, 0.012, 0.002, MAT.hull, 1), -0.08 + i * 0.054, 0.016, 0.02))), -0.1, Y, 0.02);
    const chips = [0.14, 0.2].map((z, i) => at(group(bevelBox(0.1, 0.022, 0.06, 0.006, MAT.deep, 1), at(bevelBox(0.012, 0.004, 0.012, 0.002, MAT.steel, 1), -0.03, 0.022, 0)), 0.17, Y, z - 0.18 + i * 0.1));
    const header = at(group(...Array.from({ length: 6 }, (_, i) => at(cylinder(0.008, 0.04, MAT.gold, 8, 0.002), -0.12 + i * 0.048, 0, 0)), bevelBox(0.3, 0.016, 0.034, 0.004, MAT.deep, 1)), 0, Y, -0.16);
    const led = at(bevelBox(0.02, 0.012, 0.012, 0.003, LED_AMBER, 1), 0.24, Y, 0.16);
    const l = k.light(0.24, Y + 0.02, 0.16, '#ffb347', { r: 5, phase: 0.5, lamp: false });
    void l;
    return group(base, screen, ...chips, header, led, traces([[-0.26, -0.1], [-0.26, 0.14]]));
  }
  const base = pcb(0.52, 0.52);
  const bigCaps = [[-0.14, 0.14], [0.02, 0.15]].map(([x, z], i) => at(group(cylinder(0.065, 0.16, i ? MAT.hull : MAT.trim, 24, 0.012), at(ring(0.067, 0.006, MAT.accent, 24), 0, 0.12, 0), at(cylinder(0.05, 0.01, MAT.steel, 18, 0.003), 0, 0.16, 0)), x!, Y, z!));
  const coil = at(group(...[0, 1, 2, 3].map((i) => at(ring(0.075, 0.018, COPPER, 24), 0, 0.03 + i * 0.034, 0))), 0.18, Y, -0.1);
  const block = at(group(bevelBox(0.18, 0.05, 0.1, 0.01, MAT.gunmetal, 1), ...[0, 1, 2].map((i) => at(bevelBox(0.036, 0.014, 0.012, 0.003, MAT.steel, 1), -0.05 + i * 0.05, 0.05, 0.042))), -0.08, Y, -0.17);
  const term = at(group(bevelBox(0.16, 0.07, 0.07, 0.01, MAT.accent, 1), ...[0, 1].map((i) => at(cylinder(0.014, 0.02, MAT.steel, 8, 0.003), -0.04 + i * 0.08, 0.07, 0))), 0.0, Y, 0.0);
  void term;
  const strip = at(bevelBox(0.3, 0.012, 0.012, 0.003, LED, 1), 0.0, Y, 0.235);
  void k;
  return group(base, ...bigCaps, coil, block, strip, traces([[-0.22, -0.2], [-0.22, 0.08]]));
}

/** The builders keyed by prop kind (art3d/deco/props.ts merges them). */
export const BOARD_BUILDERS: Record<string, (k: Kit, variant: number) => Object3D> = {
  ram,
  motherboard,
  chip: (k) => chip(k),
  board: smallBoard,
};

