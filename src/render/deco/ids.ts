/**
 * Sprite ids of the deco props (art3d/deco/ renders them, src/render/deco/ draws them). Shared by both, so
 * the models and the game never disagree on a name. Pure data: no Pixi, no three.js.
 */

export type PropKind = 'rack' | 'terminal' | 'antenna' | 'dish' | 'transformer' | 'lamp' | 'ram' | 'motherboard' | 'chip' | 'board';

/** Every prop kind and how many art variants it has. */
export const DECO_PROPS: readonly { kind: PropKind; variants: number }[] = [
  { kind: 'rack', variants: 2 },
  { kind: 'terminal', variants: 2 },
  { kind: 'antenna', variants: 1 },
  { kind: 'dish', variants: 1 },
  { kind: 'transformer', variants: 2 },
  { kind: 'lamp', variants: 1 },
  // circuit-board props: RAM sticks in slots, motherboards, a CPU, small boards
  { kind: 'ram', variants: 2 },
  { kind: 'motherboard', variants: 2 },
  { kind: 'chip', variants: 1 },
  { kind: 'board', variants: 2 },
];

export const decoId = (kind: PropKind, variant: number): string => `deco-${kind}-${variant}`;

/** The junction box where cables branch. */
export const JUNCTION_ID = 'deco-junction';

/** The small lit post beside belts. */
export const BOLLARD_ID = 'deco-bollard';

/** Every deco sprite id. */
export function decoIds(): string[] {
  return [...DECO_PROPS.flatMap((p) => Array.from({ length: p.variants }, (_, v) => decoId(p.kind, v))), JUNCTION_ID, BOLLARD_ID];
}

/** Art variants of a kind. */
export function variantsOf(kind: PropKind): number {
  return DECO_PROPS.find((p) => p.kind === kind)?.variants ?? 1;
}
