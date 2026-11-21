import { Color, MeshPhysicalMaterial, DoubleSide, type Object3D } from 'three';
import { at, bevelBox, cylinder, dome, emissive, frames, group, lathe, MAT, ring, strut, surface, taper, turn, type V } from '../kit';

/**
 * Drones (docs/art.md, units): a glossy ceramic shell with a role colour band, four arms with shrouded rotors
 * (two blade positions = the two frames), a teal thruster underneath and a lens in the beam colour. Origin = body
 * centre; ground 'none' (the shadow is its own sprite). Each role has its own tool underneath, so they read apart.
 */

interface DroneSpec {
  id: string;
  accent: string;
  beam: string;
  /** Overall scale (the heavy and cargo drones are bigger). */
  s: number;
  tool: 'laser' | 'weld' | 'clamp' | 'cannon' | 'bay';
}

const DISC = new MeshPhysicalMaterial({ color: new Color('#cfe6ff'), transparent: true, opacity: 0.16, roughness: 0.2, side: DoubleSide, depthWrite: false });

function rotor(x: number, z: number, frame: number, accent: MeshPhysicalMaterial, tilt: number): Object3D {
  const shroud = at(ring(0.085, 0.009, MAT.gunmetal, 40), 0, 0, 0);
  const lip = at(ring(0.085, 0.004, accent, 40), 0, 0.012, 0);
  const hubBase = at(cylinder(0.02, 0.03, MAT.steel, 16), 0, -0.03, 0);
  const motor = at(cylinder(0.03, 0.036, MAT.gunmetal, 20), 0, -0.036, 0);
  const cap = at(dome(0.022, 0.02, MAT.hull, 16, 4), 0, 0.0, 0);
  const a = frame * (Math.PI / 4) + tilt;
  const blade = (k: number) => turn(at(bevelBox(0.15, 0.004, 0.022, 0.002, MAT.steel, 1), 0, 0.008, 0), a + k * (Math.PI / 2));
  const disc = at(cylinder(0.08, 0.002, DISC, 32, 0.0005), 0, 0.006, 0);
  const spoke = [0, 1].map((i) => turn(at(bevelBox(0.16, 0.005, 0.008, 0.002, MAT.trim, 1), 0, -0.002, 0), (i * Math.PI) / 2 + 0.3));
  return at(group(shroud, lip, motor, hubBase, ...spoke, blade(0), blade(1), cap, disc), x, 0.02, z);
}

function tool(spec: DroneSpec, accent: MeshPhysicalMaterial, beamMat: ReturnType<typeof emissive>): Object3D {
  const t = spec.tool;
  if (t === 'laser') {
    const barrel = at(taper(0.03, 0.018, 0.1, MAT.gunmetal, 16), 0.12, -0.1, 0.12);
    barrel.rotation.set(0, 0, 0);
    const tip = at(cylinder(0.014, 0.012, beamMat, 12), 0.12, -0.112, 0.12);
    const collar = at(cylinder(0.04, 0.02, accent, 20), 0.12, -0.04, 0.12);
    return group(collar, barrel, tip);
  }
  if (t === 'cannon') {
    const barrel = strut([0.05, -0.04, 0.05], [0.2, -0.1, 0.2], 0.028, MAT.gunmetal, 14);
    const sleeve = strut([0.1, -0.065, 0.1], [0.17, -0.09, 0.17], 0.04, accent, 14);
    const muzzle = at(cylinder(0.022, 0.02, beamMat, 14), 0.2, -0.11, 0.2);
    const fins = [-1, 1].map((s) => at(bevelBox(0.14, 0.012, 0.03, 0.005, MAT.trim, 1), 0.02, -0.07, s * 0.1));
    return group(barrel, sleeve, muzzle, ...fins);
  }
  if (t === 'weld') {
    const arm = strut([0.0, -0.06, 0.04], [0.11, -0.13, 0.12], 0.016, MAT.steel, 10);
    const arm2 = strut([0.11, -0.13, 0.12], [0.17, -0.1, 0.17], 0.013, MAT.steel, 10);
    const joint = at(cylinder(0.022, 0.03, accent, 14), 0.11, -0.145, 0.12);
    const torch = at(taper(0.02, 0.008, 0.045, MAT.gunmetal, 12), 0.17, -0.125, 0.17);
    const spark = at(cylinder(0.011, 0.01, beamMat, 10), 0.17, -0.135, 0.17);
    return group(arm, arm2, joint, torch, spark);
  }
  if (t === 'clamp') {
    const jaws = [-1, 1].map((s) => at(bevelBox(0.16, 0.025, 0.02, 0.007, accent, 2), 0, -0.14, s * 0.07));
    const rods = [-1, 1].flatMap((s) => [-1, 1].map((q) => strut([q * 0.06, -0.06, s * 0.04], [q * 0.06, -0.135, s * 0.07], 0.01, MAT.steel, 8)));
    const bar = at(bevelBox(0.16, 0.02, 0.1, 0.008, MAT.trim, 2), 0, -0.07, 0);
    return group(bar, ...rods, ...jaws);
  }
  // bay: a freight cradle with a hull crate under the belly
  const cradle = at(bevelBox(0.3, 0.012, 0.26, 0.005, MAT.trim, 2), 0, -0.1, 0);
  const crate = at(bevelBox(0.26, 0.12, 0.22, 0.012, MAT.hull, 3), 0, -0.22, 0);
  const strap = at(bevelBox(0.272, 0.025, 0.232, 0.006, accent, 2), 0, -0.175, 0);
  const posts = [-1, 1].flatMap((s) => [-1, 1].map((q) => strut([q * 0.1, -0.03, s * 0.08], [q * 0.12, -0.1, s * 0.1], 0.012, MAT.steel, 8)));
  const lamp = at(bevelBox(0.14, 0.012, 0.012, 0.004, beamMat, 1), 0.0, -0.17, 0.12);
  return group(cradle, ...posts, crate, strap, lamp);
}

function drone(spec: DroneSpec, frame: number): Object3D {
  const accent = surface(spec.accent, { rough: 0.32, coat: 0.8 });
  const beamMat = emissive(spec.beam, 2.4);
  const lens = emissive(spec.beam, 1.6);
  // Hull: a rounded pod, widest just above the middle.
  const shell = lathe([[0, -0.1], [0.07, -0.098], [0.12, -0.075], [0.15, -0.035], [0.155, 0.0], [0.14, 0.04], [0.1, 0.075], [0.05, 0.095], [0, 0.1]], 40, MAT.hull);
  const band = lathe([[0.1565, -0.03], [0.1625, -0.024], [0.1625, -0.004], [0.1565, 0.002]], 40, accent);
  const groove = at(ring(0.15, 0.003, MAT.deep, 40), 0, 0.04, 0);
  const belly = lathe([[0, -0.108], [0.08, -0.104], [0.09, -0.098], [0, -0.098]], 24, MAT.panel);
  const thruster = at(ring(0.06, 0.007, MAT.tech, 32), 0, -0.106, 0);
  const visor = group(
    at(bevelBox(0.085, 0.045, 0.012, 0.01, MAT.glass, 3), 0, 0, 0),
    at(bevelBox(0.05, 0.016, 0.014, 0.006, lens, 2), 0, 0.001, 0.003),
  );
  // Visor faces +X/+Z (toward the camera): rotate so its normal (+Z local) points at (1,0,1).
  const faceYaw = Math.PI / 4;
  const eye = at(turn(visor, faceYaw), 0.1, 0.012, 0.1);
  const antenna = at(cylinder(0.006, 0.07, MAT.steel, 8), -0.05, 0.09, -0.05);
  const beacon = at(cylinder(0.011, 0.012, MAT.beacon, 10), -0.05, 0.158, -0.05);
  const arms: Object3D[] = [];
  const rotors: Object3D[] = [];
  const R = 0.31;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    const p0: V = [Math.cos(a) * 0.13, 0.0, Math.sin(a) * 0.13];
    arms.push(strut(p0, [x, 0.012, z], 0.019, MAT.hull, 10));
    arms.push(strut([Math.cos(a) * 0.15, -0.02, Math.sin(a) * 0.15], [x * 0.9, -0.012, z * 0.9], 0.009, MAT.steel, 8));
    rotors.push(rotor(x, z, frame, accent, i * 0.4));
  }
  const body = group(shell, band, groove, belly, thruster, eye, antenna, beacon, tool(spec, accent, beamMat));
  const g = group(body, ...arms, ...rotors);
  g.scale.setScalar(spec.s);
  return g;
}

const SPECS: DroneSpec[] = [
  { id: 'build-drone', accent: '#ffd166', beam: '#ffe9a8', s: 1, tool: 'weld' },
];

for (const s of SPECS) {
  frames([`drone-${s.id}-0`, `drone-${s.id}-1`], { ground: 'none', bloom: 0.3, build: (_k, i) => drone(s, i) });
}
