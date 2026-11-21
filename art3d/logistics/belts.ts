import type { Material, Object3D } from 'three';
import { content } from '../../src/content';
import { at, bendArc, bevelBox, bends, chevron, COLORS, emissive, group, heading, MAT, rotating, sector, slab, turn, type Kit } from '../kit';

/**
 * Belts (conveyor, fast conveyor) and their bends: a low rail body on a square slab. The lane is open at the
 * middle of both edges and the rails run the full tile, so a line of belts reads as one continuous belt. The
 * game draws its own animated treads and the items on top (render/world/belt-art.ts); these sprites are the
 * 3D look for the palette, the ghost and the build overview. Built heading +X, turned by the heading.
 */

const SLAB = 0.045;
const LANE = 0.058;
const RAIL = 0.088;
/** Lane half width and rail thickness: the rails sit at 0.31..0.41 either side of the lane centre. */
const LANE_HALF = 0.31;
const RAIL_W = 0.1;

interface Tier {
  rail: Material;
  lane: Material;
  arrow: Material;
  arrows: number;
}

const NORMAL: Tier = { rail: MAT.trim, lane: MAT.rubber, arrow: MAT.steel, arrows: 3 };
const FAST: Tier = { rail: MAT.accent, lane: MAT.deep, arrow: emissive(COLORS.accent, 1.7), arrows: 4 };
/** Wreck-blueprint belt: pale ceramic rails, a glass lane and violet phase chevrons. */
const PHASE: Tier = { rail: MAT.hull, lane: MAT.glass, arrow: emissive('#b98cff', 2.2), arrows: 5 };

function straight(t: Tier): Object3D {
  const parts: Object3D[] = [slab(1, 1, SLAB, MAT.panel), at(bevelBox(1, LANE - SLAB, LANE_HALF * 2, 0.004, t.lane, 1), 0, SLAB, 0)];
  for (const s of [-1, 1]) parts.push(at(bevelBox(1, RAIL - SLAB, RAIL_W, 0.02, t.rail, 2), 0, SLAB, s * (LANE_HALF + RAIL_W / 2)));
  for (let i = 0; i < t.arrows; i++) parts.push(chevron(-0.5 + (i + 0.5) / t.arrows, 0, 0.13, 0.085, 0.034, 0.008, t.arrow, LANE));
  return group(...parts);
}

function bend(t: Tier, side: 'l' | 'r'): Object3D {
  const { cx, cz, a0, a1 } = bendArc(side);
  const parts: Object3D[] = [slab(1, 1, SLAB, MAT.panel), sector(cx, cz, 0.5 - LANE_HALF, 0.5 + LANE_HALF, a0, a1, LANE, t.lane, 0.004)];
  parts.push(sector(cx, cz, 0.5 - LANE_HALF - RAIL_W, 0.5 - LANE_HALF, a0, a1, RAIL, t.rail, 0.01));
  parts.push(sector(cx, cz, 0.5 + LANE_HALF, 0.5 + LANE_HALF + RAIL_W, a0, a1, RAIL, t.rail, 0.01));
  // arrows along the arc, pointing the way the items go
  const dir = side === 'r' ? 1 : -1;
  for (let i = 0; i < t.arrows - 1; i++) {
    const a = a0 + ((i + 0.5) / (t.arrows - 1)) * (a1 - a0);
    const tx = -Math.sin(a) * dir;
    const tz = Math.cos(a) * dir;
    const c = turn(chevron(0, 0, 0.13, 0.085, 0.034, 0.008, t.arrow, LANE), Math.atan2(-tz, tx));
    parts.push(at(c, cx + 0.5 * Math.cos(a), 0, cz + 0.5 * Math.sin(a)));
  }
  return group(...parts);
}

/** The look of a belt content entry: by id, else by speed (belts the content adds later still get a tier). */
function tierOf(id: string, speed: number): Tier {
  if (id === 'phase-conveyor') return PHASE;
  return speed > 6 ? FAST : NORMAL;
}

for (const def of content.buildings.list.filter((b) => b.category === 'logistics' && b.behaviour === 'conveyor')) {
  const id = def.id;
  const tier = tierOf(id, def.conveyor?.speed ?? 0);
  rotating(id, (_k: Kit, rot: number) => heading(straight(tier), rot), { bloom: 0.2 });
  bends(id, (_k: Kit, side, rot) => heading(bend(tier, side), rot), { bloom: 0.2 });
}
