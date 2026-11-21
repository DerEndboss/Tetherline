import type { WorldPt } from './region';

/**
 * Hooks between the pointer input (render/input.ts) and the tools, so the right mouse button can act on the
 * world without every renderer file knowing about it. The Interaction installs `secondary` when it is created;
 * render-world may install `probes.decoAt` so a right click only removes decoration where there is some.
 */
export interface SecondarySink {
  /** A right click without dragging on a tile; true = handled (otherwise the old "let go of the tool" applies). */
  tap(x: number, y: number): boolean;
  /** A right drag begins: true = the tools take it (it sweeps boulders), false = it pans the camera. `at`: the pointer in world px. */
  dragStart(x: number, y: number, at?: WorldPt): boolean;
  drag(x: number, y: number, at?: WorldPt): void;
  dragEnd(x: number, y: number, at?: WorldPt): void;
}

export const secondarySink: { current: SecondarySink | null } = { current: null };

export const probes: {
  /** Whether a decoration piece (prop or junction box) stands on this tile (set by the deco view). Without it a right click always asks to remove. */
  decoAt?: (x: number, y: number) => boolean;
  /** A plain click selected the decoration on this tile: the hook for later easter eggs (render/deco/pick.ts `tapDeco`). */
  decoTap?: (x: number, y: number) => void;
} = {};
