import type { DroneDef, WorldPalette } from '../content/types';
import { mix, shade } from './color';
import { beam, circlePoints, drawSolids, lathe, overlay, project, type Material, type Rig } from './solid';
import { circle, ellipse, line, polyPts, type Pt, type SpriteArt, Svg } from './svg';
import { TECH } from './tech';

/** Drone frames (rotor blades at two angles, alternated for the spin) and its ground shadow. */
export const DRONE_FRAMES = 2;
export const droneId = (kind: string, frame: number): string => `drone-${kind}-${frame}`;
export const DRONE_SHADOW = 'drone-shadow';

const W = 96;
const H = 72;
const ORIGIN: Pt = { x: 48, y: 40 };
const ARM = 0.27;

/**
 * A small round clearing drone: a white shell with the accent band, four arms with rotor rings, a glowing
 * eye looking forward-down (the laser comes out of it) and a soft under-light. Origin = body centre.
 */
export function droneSprites(def: DroneDef, palette: WorldPalette): SpriteArt[] {
  const rig: Rig = { origin: ORIGIN, light: palette.light, shadow: palette.shadow, sky: palette.sky.mid };
  const body: Material = { main: def.colors.body, dark: mix(TECH.hullDark, palette.shadow, 0.2) };
  const accent: Material = { main: def.colors.accent, dark: shade(def.colors.accent, -0.5), bare: true };
  const arms = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2;
    return beam({ x: 0, y: 0, z: 2 }, { x: Math.cos(a) * ARM, y: Math.sin(a) * ARM, z: 4 }, 0.035, { ...body, bare: true });
  });
  const shell = lathe(0, 0, [[0.07, -10], [0.15, -6], [0.17, 0], [0.15, 6], [0.09, 11], [0.02, 13]], 12, body);
  const band = overlay(lathe(0, 0, [[0.172, -2], [0.172, 2]], 12, accent, 0, true));
  const eye = project(rig, { x: 0.12, y: 0.12, z: -3 });
  const out: SpriteArt[] = [];
  for (let frame = 0; frame < DRONE_FRAMES; frame++) {
    const svg = new Svg(W, H);
    const rotors = [0, 1, 2, 3].map((i) => {
      const a = (i * Math.PI) / 2;
      return { x: Math.cos(a) * ARM, y: Math.sin(a) * ARM };
    });
    // Rotors behind the body first (smaller x + y), the rest after the shell.
    const back = rotors.filter((r) => r.x + r.y < 0);
    const front = rotors.filter((r) => r.x + r.y >= 0);
    const drawRotor = (r: Pt): void => {
      const c = project(rig, { x: r.x, y: r.y, z: 6 });
      const ringPts = circlePoints(rig, r.x, r.y, 0.11, 6, 18);
      svg.add(polyPts(ringPts, 'rgba(255,255,255,0.16)', `stroke="${shade(def.colors.body, -0.35)}" stroke-width="1.6"`));
      const a = frame * (Math.PI / 4) + (r.x > 0 ? 0.3 : 0);
      const dx = Math.cos(a) * 9;
      const dy = Math.sin(a) * 4.5;
      svg.add(line({ x: c.x - dx, y: c.y - dy }, { x: c.x + dx, y: c.y + dy }, '#ffffff', 2, 'opacity="0.55"'));
      svg.add(circle(c.x, c.y, 2, shade(def.colors.body, -0.4)));
    };
    back.forEach(drawRotor);
    drawSolids(svg, rig, [...arms, shell, band], { rim: 0.7, outline: 1.6 });
    svg.add(circle(eye.x, eye.y, 4.6, svg.radial(eye.x - 1, eye.y - 1, 5, [[0, '#ffffff'], [0.4, shade(def.colors.beam, 0.3)], [1, def.colors.beam]]), `stroke="${shade(TECH.hullDark, -0.5)}" stroke-width="1.3"`));
    front.forEach(drawRotor);
    out.push({
      id: droneId(def.id, frame),
      w: W,
      h: H,
      ax: ORIGIN.x / W,
      ay: ORIGIN.y / H,
      svg: svg.doc(),
      meta: { glints: [{ x: eye.x - ORIGIN.x, y: eye.y - ORIGIN.y }] },
    });
  }
  return out;
}

/** Soft dark ellipse the renderer puts on the ground under a flying drone. */
export function droneShadowSprite(palette: WorldPalette): SpriteArt {
  const svg = new Svg(80, 40);
  const fill = svg.radial(40, 20, 36, [
    [0, palette.shadow, 0.55],
    [0.6, palette.shadow, 0.25],
    [1, palette.shadow, 0],
  ], undefined, 0.5);
  svg.add(ellipse(40, 20, 36, 18, fill));
  return { id: DRONE_SHADOW, w: 80, h: 40, ax: 0.5, ay: 0.5, svg: svg.doc() };
}
