import { rand } from '../kit';
import { ORE_SCATTER } from '../../src/render/world/ore-art';
import type { OreStyle } from './style';

/**
 * Where the parts of one ore PIECE lie. A piece is a small cluster, not a tile: the ore layer lays up to three
 * of them per tile at hashed spots, so neighbours overlap and no tile grid shows. Inside a piece the parts are
 * spread over a disc (not a heap in the middle) with a big lump or two first and grit in the gaps.
 * Deterministic per variant. Model space: one unit = one tile edge, +X screen lower right, +Z screen lower
 * left, so -X-Z is the tile behind.
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

/** Radius of the disc the parts of a piece lie in: everyday clusters and the big outcrops of a rich middle. */
export const SCATTER_REACH = 0.3;
export const OUTCROP_REACH = 0.4;

/** Whether piece `variant` is one of the big outcrops. */
export const isOutcrop = (variant: number): boolean => variant >= ORE_SCATTER;

interface Placer {
  rnd: () => number;
  parts: Part[];
  reach: number;
}

/** A free spot in the piece's disc at least `gap` (scaled by the radii) from every placed part, or null after a few tries. */
function spot(p: Placer, r: number, reach: number): [number, number] | null {
  for (let tries = 0; tries < 40; tries++) {
    const a = p.rnd() * Math.PI * 2;
    const d = Math.sqrt(p.rnd()) * reach;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d * 0.9;
    if (p.parts.every((q) => Math.hypot(q.x - x, q.z - z) > (q.r + r) * 0.88)) return [x, z];
  }
  return null;
}

function place(p: Placer, kind: PartKind, r: number, h: number): void {
  const at = spot(p, r, Math.max(0.05, p.reach - (kind === 'grit' ? -0.05 : r * 0.5)));
  if (!at) return;
  const dir = p.rnd() * Math.PI * 2;
  const lean = kind === 'spike' ? 0.15 + p.rnd() * 0.35 : 0;
  p.parts.push({ kind, x: at[0], z: at[1], r, h, turn: p.rnd() * Math.PI * 2, lean: [Math.cos(dir) * lean, Math.sin(dir) * lean], pick: p.rnd() });
}

/**
 * The parts of one variant, biggest first (they claim room), grit last (it fills the gaps). Counts come from the
 * style; a piece is a share of a tile, so a tile of two or three pieces holds about twice what the style names.
 */
export function layout(style: OreStyle, variant: number, seed: number): Part[] {
  const outcrop = isOutcrop(variant);
  const p: Placer = { rnd: rand(seed * 977 + variant * 131 + 17), parts: [], reach: outcrop ? OUTCROP_REACH : SCATTER_REACH };
  const lumps = style.chunks + (outcrop ? 3 : 0);
  for (let i = 0; i < lumps; i++) {
    // the first lump is the big one (the outcrop's is bigger still), the rest are mid and small
    const big = i === 0 ? (outcrop ? 0.17 : 0.12) + p.rnd() * 0.05 : 0.065 + p.rnd() * 0.05;
    const r = big * style.size;
    place(p, 'chunk', r, r * (0.7 + p.rnd() * 0.35) * style.height);
  }
  const spikes = style.spikes === 0 ? 0 : style.spikes + (outcrop ? 1 : 0) - (p.rnd() < 0.35 ? 1 : 0);
  for (let i = 0; i < spikes; i++) {
    const r = 0.045 + p.rnd() * 0.025;
    place(p, 'spike', r, (0.1 + p.rnd() * 0.09) * style.tall);
  }
  for (let i = 0; i < style.grit + 3; i++) {
    const r = 0.018 + p.rnd() * 0.018;
    place(p, 'grit', r, r * 0.8);
  }
  return p.parts;
}
