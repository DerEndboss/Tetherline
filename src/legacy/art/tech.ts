/**
 * Colours of the player's technology (base, drones, later buildings). They are the same on every world, so
 * the player's things always read as "mine": off-white hull, slate panels, one orange accent, teal light
 * (the teal itself comes from the world palette's `tech`). docs/art-direction.md lists them as tokens.
 */
export const TECH = {
  hull: '#eef2f8',
  hullDark: '#5d6a94',
  panel: '#3d4870',
  panelDark: '#161b33',
  accent: '#ff9a4d',
  beacon: '#ff6b6b',
  hatchHole: '#0d1226',
  solar: '#2f4f9a',
  solarLine: '#9fc4ff',
  /** Power lines and reach in build mode, the no-power badge's bolt. */
  power: '#ffd27a',
} as const;
