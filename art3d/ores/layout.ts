import { rand } from '../kit';
import type { OreStyle } from './style';

/**
 * Where the parts of one ore tile lie: spread evenly over the whole tile (not a heap in the middle), so
 * neighbouring tiles join into one field. Deterministic per variant. Model space: one unit = one tile edge,
 * +X screen lower right, +Z screen lower left, so -X-Z is the tile behind.
 */

export type PartKind = 'chunk' | 'spike' | 'grit';

export interface Part {
  kind: PartKind;
  x: number;
  z: number;
  /** Radius and height in tile units. */
  r: number;
  h: number;
  /** Turn around Y (radians) and lean of upright parts (units per unit of height, along X and Z). */
  turn: number;
  lean: readonly [number, number];
  /** 0..1 per part, for colour picks. */
  pick: number;
}

/** How far from the tile centre a part may sit (keeps chunks inside their own tile). */
const REACH = 0.38;

interface Placer {
  rnd: () => number;
  parts: Part[];
}

/** A free spot at least `gap` (scaled by the radii) from every placed part, or null after a few tries. */
function spot(p: Placer, r: number, reach: number, front: boolean): [number, number] | null {
  for (let tries = 0; tries < 40; tries++) {
    const x = (p.rnd() * 2 - 1) * reach;
    const z = (p.rnd() * 2 - 1) * reach;
    // tall parts stay out of the back corner: their tips would reach into the tile behind
    if (front && x + z < -0.25) continue;
    if (p.parts.every((q) => Math.hypot(q.x - x, q.z - z) > (q.r + r) * 0.92)) return [x, z];
  }
  return null;
}

function place(p: Placer, kind: PartKind, r: number, h: number): void {
  const reach = REACH - (kind === 'grit' ? -0.04 : r * 0.55);
  const at = spot(p, r, reach, kind === 'spike');
  if (!at) return;
  const dir = p.rnd() * Math.PI * 2;
  const lean = kind === 'spike' ? 0.15 + p.rnd() * 0.35 : 0;
  p.parts.push({ kind, x: at[0], z: at[1], r, h, turn: p.rnd() * Math.PI * 2, lean: [Math.cos(dir) * lean, Math.sin(dir) * lean], pick: p.rnd() });
}

/** The parts of one variant: the biggest first (they claim room), grit last (it fills the gaps). */
export function layout(style: OreStyle, variant: number, seed: number): Part[] {
  const p: Placer = { rnd: rand(seed * 977 + variant * 131 + 17), parts: [] };
  for (let i = 0; i < style.chunks; i++) {
    const r = (0.08 + p.rnd() * 0.05) * style.size;
    place(p, 'chunk', r, r * (0.7 + p.rnd() * 0.35) * style.height);
  }
  for (let i = 0; i < style.spikes; i++) {
    const r = 0.045 + p.rnd() * 0.025;
    place(p, 'spike', r, (0.1 + p.rnd() * 0.09) * style.tall);
  }
  for (let i = 0; i < style.grit; i++) {
    const r = 0.018 + p.rnd() * 0.018;
    place(p, 'grit', r, r * 0.8);
  }
  return p.parts;
}
