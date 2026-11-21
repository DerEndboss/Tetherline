import { PointLight, type Group, type Object3D } from 'three';
import { at, bevelBox, cylinder, dome, emissive, group, lathe, lightPool, MAT, obstacleColors, rand, rock, rockMat, sprite, strut, surface, turn, WORLD } from '../kit';
import { obstacles } from '../../src/legacy/content/obstacles';

/** Wreckage: a half-sunk fuel tank, a tipped cargo container, leaning hull plates, an engine nozzle. */
const C = obstacleColors('wreck');
const HULL = surface(C.main, { rough: 0.38, metal: 0.55, coat: 0.5 });
const DARK = surface(C.shade, { rough: 0.5, metal: 0.6 });
const RUST = surface('#7b5a52', { rough: 0.8, metal: 0.3 });
const STRIPE = surface(C.glow, { rough: 0.4, coat: 0.6 });
const LAMP = emissive(C.glow, 2.4);
const SAND = [rockMat(WORLD.ground[1]!), rockMat(WORLD.ground[2]!, 0.75)];
void obstacles;

function rubble(rnd: () => number, n: number, spread: number): Object3D[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rnd() * 6.28;
    return at(rock(rnd, 0.06 + rnd() * 0.08, 0.05 + rnd() * 0.07, SAND[i % 2]!, 10, 0.35), Math.cos(a) * spread, -0.01, Math.sin(a) * spread * 0.85);
  });
}

function beacon(x: number, y: number, z: number): Object3D {
  const stem = at(cylinder(0.012, 0.07, DARK, 8), x, y, z);
  const bulb = at(dome(0.035, 0.05, LAMP, 16, 5), x, y + 0.07, z);
  return group(stem, bulb);
}

/** Tank lying on its side, sunk a little, with bands, end caps, a valve and a torn plate. */
function tank(rnd: () => number, v: number): Group {
  const body = lathe([[0.02, -0.4], [0.16, -0.38], [0.22, -0.3], [0.24, -0.2], [0.24, 0.2], [0.22, 0.3], [0.16, 0.38], [0.02, 0.4]], 40, HULL);
  body.rotation.z = Math.PI / 2;
  const bands = [-0.14, 0.14].map((x) => {
    const b = lathe([[0.246, -0.035], [0.252, -0.03], [0.252, 0.03], [0.246, 0.035]], 40, STRIPE);
    b.rotation.z = Math.PI / 2;
    return at(b, x, 0, 0);
  });
  const rings = [-0.3, 0.3].map((x) => {
    const b = lathe([[0.2, -0.02], [0.236, -0.015], [0.236, 0.015], [0.2, 0.02]], 32, DARK);
    b.rotation.z = Math.PI / 2;
    return at(b, x, 0, 0);
  });
  const valve = group(at(cylinder(0.04, 0.05, DARK, 16), 0, 0.23, 0.02), at(cylinder(0.02, 0.06, STRIPE, 12), 0, 0.27, 0.02));
  const lay = group(body, ...bands, ...rings, valve);
  lay.position.set(0, 0.2, 0);
  lay.rotation.z = 0.12 + (v % 2) * 0.08;
  const saddle = [-0.2, 0.2].map((x) => at(bevelBox(0.06, 0.12, 0.34, 0.02, DARK), x, 0, 0));
  const plate = at(bevelBox(0.3, 0.025, 0.2, 0.008, HULL), 0.22, 0.05, 0.32);
  plate.rotation.z = 0.25;
  plate.rotation.y = 0.5;
  const cap = at(bevelBox(0.16, 0.12, 0.12, 0.03, RUST), -0.32, 0, 0.3);
  const g = group(lay, ...saddle, plate, cap, beacon(-0.05, 0.4, -0.02), ...rubble(rnd, 6, 0.46));
  return turn(g, -0.45);
}

/** A cargo container tipped into the ground. */
function container(rnd: () => number): Group {
  const box = group(
    at(bevelBox(0.74, 0.4, 0.38, 0.03, HULL), 0, 0, 0),
    ...[-0.27, -0.09, 0.09, 0.27].map((x) => at(bevelBox(0.05, 0.37, 0.4, 0.01, DARK), x, 0.015, 0)),
    at(bevelBox(0.76, 0.06, 0.4, 0.02, STRIPE), 0, 0.17, 0),
    at(bevelBox(0.04, 0.34, 0.04, 0.01, RUST), 0.37, 0.03, 0.19),
    at(bevelBox(0.7, 0.03, 0.36, 0.01, DARK), 0, 0.4, 0),
  );
  box.rotation.z = 0.22;
  box.rotation.x = 0.1;
  box.position.set(0, 0.04, 0);
  const lid = at(bevelBox(0.36, 0.03, 0.34, 0.01, HULL), 0.34, 0.03, 0.3);
  lid.rotation.y = 0.6;
  lid.rotation.z = 0.12;
  return turn(group(box, lid, beacon(-0.28, 0.36, 0.1), ...rubble(rnd, 6, 0.46)), 0.35);
}

/** Two hull plates leaning into each other on a rib, with a hazard-stripe band. */
function plates(rnd: () => number): Group {
  const pl = (w: number, h: number, mat = HULL): Object3D => {
    const p = group(at(bevelBox(w, h, 0.045, 0.012, mat), 0, 0, 0), at(bevelBox(w * 0.96, 0.035, 0.052, 0.008, STRIPE), 0, h * 0.62, 0));
    for (const f of [-0.33, 0, 0.33]) p.add(at(bevelBox(0.022, h * 0.9, 0.05, 0.006, DARK), w * f, h * 0.04, 0));
    return p;
  };
  const a = at(pl(0.7, 0.62), -0.02, -0.02, -0.14);
  a.rotation.x = -0.4;
  const b = at(pl(0.6, 0.5, DARK), 0.02, -0.02, 0.17);
  b.rotation.x = 0.5;
  const rib = group(at(bevelBox(0.06, 0.5, 0.06, 0.018, DARK), -0.24, 0, 0.02), at(bevelBox(0.05, 0.3, 0.05, 0.015, RUST), 0.26, 0, 0.1));
  const strutA = strut([0.32, 0, 0.3], [0.2, 0.22, 0.05], 0.02, DARK);
  return turn(group(a, b, rib, strutA, beacon(0.0, 0.5, 0.0), ...rubble(rnd, 6, 0.42)), 0.25);
}

/** Engine nozzle: a big bell on a stub, tilted, half sunk. */
function engine(rnd: () => number): Group {
  const bell = lathe([[0.1, 0], [0.12, 0.08], [0.18, 0.22], [0.28, 0.4], [0.3, 0.44], [0.26, 0.44], [0.16, 0.28], [0.08, 0.1]], 36, HULL);
  const ringBand = lathe([[0.265, 0.4], [0.29, 0.405], [0.29, 0.43], [0.265, 0.435]], 36, STRIPE);
  const inner = at(dome(0.14, 0.05, DARK, 20, 4), 0, 0.34, 0);
  const m = group(bell, ringBand, inner, at(cylinder(0.1, 0.14, DARK, 24), 0, -0.1, 0), at(cylinder(0.05, 0.3, RUST, 12), 0.01, -0.3, 0.02));
  m.rotation.z = -0.5;
  m.rotation.x = 0.15;
  m.position.set(-0.05, 0.1, 0);
  const frame = group(at(bevelBox(0.3, 0.04, 0.5, 0.012, DARK), 0.3, 0, 0.1), at(bevelBox(0.22, 0.12, 0.2, 0.03, HULL), 0.32, 0.03, 0.14));
  frame.rotation.y = 0.4;
  return turn(group(m, frame, beacon(0.3, 0.14, 0.14), ...rubble(rnd, 6, 0.46)), 0.2);
}

const BUILD = [tank, container, plates, engine];
for (let v = 0; v < 4; v++) {
  sprite({
    id: `obstacle-wreck-${v}`,
    glow: true,
    build: () => {
      const g = BUILD[v]!(rand(5200 + v * 13), v);
      const spill = new PointLight(C.glow, 0.5, 0.6, 1.6);
      spill.position.set(0, 0.4, 0.1);
      return group(lightPool(0.4, C.glow, 0.12), g, spill);
    },
  });
}
void MAT;
