import type { ThemeDef } from './types';

/**
 * How a world paints and grows its terrain (mapgen owns it; read by the generator and render/world/ground.ts).
 * Colours are plain hex strings; amounts are 0..1 chances per small cell.
 */
export interface TerrainStyle {
  /** Multipliers for the generator: deep lakes, rock ridges, dust boulders (1 = the baseline). */
  gen: { lakes: number; ridges: number; boulders: number };
  /** Flecks on plain ground (pebbles, grass blades, snow glints): colours and how often. */
  speckle: { colors: string[]; amount: number };
  /** Sparse bright accents (flowers, ice sparkles, quartz); optional. */
  accent?: { colors: string[]; amount: number };
  /** Soft wind ripples across the ground (dunes, snow drifts): brightness swing 0..0.2. */
  ripple: number;
  /** Lighter band at the water's edge. */
  shore: string;
  /** Ridge rock: lit top-left faces and shaded bottom-right faces. */
  ridgeLit: string;
  ridgeShade: string;
}

declare module './types' {
  interface ThemeDef {
    terrain?: TerrainStyle;
  }
}

/** A theme's terrain style, with a neutral fallback for themes that have none. */
export function terrainOf(theme: ThemeDef): TerrainStyle {
  return theme.terrain ?? NEUTRAL;
}

const NEUTRAL: TerrainStyle = {
  gen: { lakes: 1, ridges: 1, boulders: 1 },
  speckle: { colors: ['#00000018'], amount: 0.1 },
  ripple: 0,
  shore: '#ffffff',
  ridgeLit: '#8a8a8a',
  ridgeShade: '#3a3a3a',
};

/** World themes: ground, sky, water and boulders change; buildings look the same everywhere. */
export const themes: ThemeDef[] = [
  {
    id: 'rust-desert',
    name: 'Rust Desert',
    palette: {
      void: '#0a1028',
      sky: { top: '#0a1130', mid: '#173a6b', horizon: '#ff9a76', haze: '#b4607e' },
      ground: ['#6b3f36', '#7a4838', '#8a5640', '#9a6448', '#a87350'],
      groundEdge: '#d08a6a',
      groundSide: '#2a1622',
      tech: '#6fe8dc',
      light: '#ffc99a',
      shadow: '#170c2a',
      dust: '#c08a68',
      ridge: '#4a2a2c',
      liquids: { water: '#3f86b0' },
    },
    terrain: {
      gen: { lakes: 0.7, ridges: 1.25, boulders: 1.3 },
      speckle: { colors: ['#b98a5e', '#4f2a28', '#d49a6a'], amount: 0.2 },
      accent: { colors: ['#e9b878', '#ff9a5a'], amount: 0.012 },
      ripple: 0.09,
      shore: '#e8c9a0',
      ridgeLit: '#8a5848',
      ridgeShade: '#3a2024',
    },
    boulders: ['obstacle-boulder-0', 'obstacle-boulder-1', 'obstacle-boulder-2', 'obstacle-boulder-3'],
    sound: { rootHz: 293.66, scale: [0, 2, 4, 7, 9] },
  },
  {
    id: 'green-meadow',
    name: 'Green Meadow',
    palette: {
      void: '#0b1a24',
      sky: { top: '#0e2a44', mid: '#2f6f8f', horizon: '#ffd59a', haze: '#8fb8a0' },
      ground: ['#3f6a3a', '#4b7a40', '#5a8a48', '#6a9850', '#7aa65a'],
      groundEdge: '#b8d890',
      groundSide: '#1a2a1c',
      tech: '#6fe8dc',
      light: '#fff0c0',
      shadow: '#10201c',
      dust: '#a89a6a',
      ridge: '#3a4a3a',
      liquids: { water: '#3a8fc8' },
    },
    terrain: {
      gen: { lakes: 1.5, ridges: 0.7, boulders: 0.8 },
      speckle: { colors: ['#9ad06a', '#2a5a2c', '#b4dc78'], amount: 0.3 },
      accent: { colors: ['#fff2a0', '#ffffff', '#ff9ec0'], amount: 0.01 },
      ripple: 0.03,
      shore: '#d8e8a8',
      ridgeLit: '#6a806a',
      ridgeShade: '#26382a',
    },
    boulders: ['obstacle-boulder-0', 'obstacle-boulder-1', 'obstacle-boulder-2', 'obstacle-boulder-3'],
    sound: { rootHz: 261.63, scale: [0, 2, 4, 7, 9] },
  },
  {
    id: 'ice-snow',
    name: 'Ice & Snow',
    palette: {
      void: '#0a1424',
      sky: { top: '#0c1a36', mid: '#3a6a9a', horizon: '#ffd0e0', haze: '#a8c0e0' },
      ground: ['#9db2ca', '#aabfd4', '#b8cbdd', '#c6d6e6', '#d6e4f0'],
      groundEdge: '#ffffff',
      groundSide: '#3a4a64',
      tech: '#6fe8dc',
      light: '#fff4e8',
      shadow: '#1a2440',
      dust: '#a8b8cc',
      ridge: '#7a8aa4',
      liquids: { water: '#5aa0d8' },
    },
    terrain: {
      gen: { lakes: 1.1, ridges: 1, boulders: 1 },
      speckle: { colors: ['#7f98bc', '#f4f8ff', '#6e8ab4'], amount: 0.2 },
      accent: { colors: ['#ffffff', '#c8ecff'], amount: 0.02 },
      ripple: 0.05,
      shore: '#f0faff',
      ridgeLit: '#a8bcd8',
      ridgeShade: '#4a5a7c',
    },
    boulders: ['obstacle-boulder-0', 'obstacle-boulder-1', 'obstacle-boulder-2', 'obstacle-boulder-3'],
    sound: { rootHz: 329.63, scale: [0, 2, 4, 7, 9] },
  },
];
