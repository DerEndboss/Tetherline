/**
 * The look of the ore fields, switched in ONE place. Every ore is drawn from the same three kinds of parts
 * (looks.ts): `chunk` (the ore's own lump: nuggets, slabs, splinters, pebbles ...), `spike` (its upright
 * crystal form) and `grit` (tiny pebbles of the ore between them). A style only decides how many of each a
 * tile gets and how big and tall they are, so changing the style is one word below plus
 * `npm run art -- --only ores`.
 *
 *   A `flat`     low chunks lying on the ground, no upright crystals: calm, reads like Mindustry ore.
 *   B `crystal`  upright crystals everywhere (metals as metallic points): loud and sparkly.
 *   C `mixed`    chunks with one or two crystals poking out: the default, the ore's shape plus some sparkle.
 *
 * For a preview without touching public/art: `npm run art -- --only ores --define ORE_STYLE=flat --out <dir>`.
 */

export interface OreStyle {
  /** Chunks per tile. */
  chunks: number;
  /** Upright crystals per tile. */
  spikes: number;
  /** Tiny pebbles per tile. */
  grit: number;
  /** Size and height multipliers of the chunks. */
  size: number;
  height: number;
  /** Height multiplier of the crystals. */
  tall: number;
}

export const STYLES = {
  flat: { chunks: 6, spikes: 0, grit: 6, size: 1.05, height: 0.7, tall: 1 },
  crystal: { chunks: 2, spikes: 6, grit: 4, size: 0.9, height: 0.8, tall: 1.1 },
  mixed: { chunks: 4, spikes: 2, grit: 5, size: 1.15, height: 0.8, tall: 1.05 },
} as const satisfies Record<string, OreStyle>;

export type OreStyleName = keyof typeof STYLES;

/** THE switch: the style the game's ore fields are rendered in. */
export const ORE_STYLE: OreStyleName = 'mixed';

/** Set by `npm run art -- --define ORE_STYLE=<name>` (esbuild define) for previews; undefined otherwise. */
declare const __ORE_STYLE__: string | undefined;

function override(): string | undefined {
  return typeof __ORE_STYLE__ === 'string' ? __ORE_STYLE__ : undefined;
}

/** The style to render: the preview override, else ORE_STYLE. */
export function activeStyle(): OreStyle {
  const name = override() ?? ORE_STYLE;
  if (!(name in STYLES)) throw new Error(`Unknown ore style ${name} (${Object.keys(STYLES).join(', ')})`);
  return STYLES[name as OreStyleName];
}
