import type { MaterialDef } from '../types';

/**
 * Tier 1 raw (mines, rubble) -> 2 refined (smelter) -> 3 mixed (mixer, `src/content/alloys`) -> 4 parts
 * (fabricator). Each material has its own icon: a silhouette per family, its colours, and for the metal
 * bars a stamp; alloys show the colours of their inputs in their ratio (from the alloys data).
 * Bauxite and lumenite only lie in fogged regions (`worlds`); making their refined forms needs research
 * (`unlockedBy`).
 */
export const materials: MaterialDef[] = [
  { id: 'iron-ore', name: 'Iron Ore', tier: 1, value: 1, color: '#b0674a', accent: '#c9d2dc', icon: 'nugget' },
  { id: 'copper-ore', name: 'Copper Ore', tier: 1, value: 1, color: '#d9894a', accent: '#5fd0a8', icon: 'nugget' },
  { id: 'tin-ore', name: 'Tin Ore', tier: 1, value: 1, color: '#8794a6', accent: '#f2f6fa', icon: 'nugget' },
  { id: 'quartz-sand', name: 'Quartz Sand', tier: 1, value: 1, color: '#e6d3a8', accent: '#fff6e0', icon: 'sand' },
  { id: 'coal', name: 'Coal', tier: 1, value: 1, color: '#3d3a45', icon: 'lump' },
  { id: 'bauxite', name: 'Bauxite', tier: 1, value: 2, color: '#c9784a', accent: '#f4d3a6', icon: 'lump' },
  { id: 'lumenite', name: 'Lumenite', tier: 1, value: 3, color: '#b183ff', accent: '#f3e2ff', icon: 'block' },

  { id: 'iron-bar', name: 'Iron Bar', tier: 2, value: 4, color: '#8d9aa6', icon: 'bar', mark: 'line' },
  { id: 'copper-bar', name: 'Copper Bar', tier: 2, value: 4, color: '#e0925a', icon: 'bar', mark: 'ring' },
  { id: 'tin-bar', name: 'Tin Bar', tier: 2, value: 4, color: '#c4ccd2', icon: 'bar', mark: 'dot' },
  { id: 'silicon', name: 'Silicon', tier: 2, value: 4, color: '#6f7fa8', accent: '#b9c6ec', icon: 'wafer' },
  { id: 'graphite', name: 'Graphite', tier: 2, value: 4, color: '#55525e', accent: '#a6a2b4', icon: 'rods' },
  { id: 'aluminium', name: 'Aluminium Bar', tier: 2, value: 6, color: '#bcd6ee', icon: 'bar', mark: 'cross', unlockedBy: 'aluminium-smelting' },
  { id: 'lumen-glass', name: 'Lumen Glass', tier: 2, value: 10, color: '#8e74f0', accent: '#e9ddff', icon: 'wafer', unlockedBy: 'lumen-refining' },

  { id: 'steel', name: 'Steel', tier: 3, value: 14, color: '#a9b8c6', icon: 'ingot' },
  { id: 'cast-iron', name: 'Cast Iron', tier: 3, value: 11, color: '#6e7480', icon: 'ingot' },
  { id: 'bronze', name: 'Bronze', tier: 3, value: 14, color: '#c98a3e', icon: 'ingot' },
  { id: 'bell-metal', name: 'Bell Metal', tier: 3, value: 16, color: '#e2b65e', icon: 'ingot' },
  { id: 'speculum', name: 'Speculum', tier: 3, value: 18, color: '#dfe4ea', icon: 'ingot' },
  { id: 'pewter', name: 'Pewter', tier: 3, value: 14, color: '#9ea6b4', icon: 'ingot' },
  { id: 'silicon-bronze', name: 'Silicon Bronze', tier: 3, value: 16, color: '#c7745a', icon: 'plate' },
  { id: 'silicon-steel', name: 'Silicon Steel', tier: 3, value: 16, color: '#7f93c2', icon: 'plate' },
  { id: 'tinplate', name: 'Tinplate', tier: 3, value: 12, color: '#e4eaf0', icon: 'plate' },
  { id: 'silicon-carbide', name: 'Silicon Carbide', tier: 3, value: 18, color: '#3fae96', accent: '#b8fff0', icon: 'block' },
  { id: 'aluminium-bronze', name: 'Aluminium Bronze', tier: 3, value: 20, color: '#eaa23a', icon: 'plate' },
  { id: 'duralumin', name: 'Duralumin', tier: 3, value: 22, color: '#9fd0ea', icon: 'ingot' },
  { id: 'slag', name: 'Slag', tier: 3, value: 0, color: '#6b5a52', accent: '#ff9a4d', icon: 'blob' },

  { id: 'frame', name: 'Frame', tier: 4, value: 40, color: '#7fd1c7', icon: 'truss' },
  { id: 'conductor', name: 'Conductor', tier: 4, value: 50, color: '#f0b45c', accent: '#5d6a94', icon: 'coil' },
  { id: 'circuit', name: 'Circuit', tier: 4, value: 80, color: '#5fd38a', accent: '#ffd98a', icon: 'board' },
  { id: 'core', name: 'Core', tier: 4, value: 160, color: '#c58cf0', accent: '#fff0ff', icon: 'orb' },
];
