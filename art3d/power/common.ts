import type { Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, emissive, group, lathe, MAT, plate, rivets, surface } from '../kit';

/** Shared bits of the power category (kept here, not in the kit). */
export const STRIP = emissive(COLORS.tech, 2.4);
export const COPPER = surface('#e39a62', { rough: 0.28, metal: 0.9, coat: 0.4 });
export const COAL = surface('#2c2a36', { rough: 0.9 });

/** A square deck with a trim inset, bevelled edge and a glowing teal edge strip on the two visible sides. */
export function deck(size = 0.92, withStrip = true): Object3D {
  const base = plate(size, size, 0.07, MAT.panel, 0.025);
  const inset = at(plate(size - 0.18, size - 0.18, 0.012, MAT.trim, 0.006), 0, 0.07, 0);
  const parts: Object3D[] = [base, inset];
  if (withStrip) {
    const e = size / 2 - 0.012;
    parts.push(at(bevelBox(size - 0.16, 0.012, 0.014, 0.004, STRIP, 1), 0, 0.058, e));
    parts.push(at(bevelBox(0.014, 0.012, size - 0.16, 0.004, STRIP, 1), e, 0.058, 0));
  }
  parts.push(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => at(rivets(0, 1, 0.014, MAT.steel), x! * (size / 2 - 0.04), 0.07, z! * (size / 2 - 0.04))));
  return group(...parts);
}

/** A round foot / flange with bolts: stands on y = 0 of its parent. */
export function flange(r: number, h = 0.03): Object3D {
  return group(cylinder(r, h, MAT.gunmetal, 32, 0.008), at(rivets(r * 0.78, 8, 0.01, MAT.steel), 0, h, 0));
}

export { lathe };
