import type { MaterialDef } from './types';

/**
 * Every item. The order is the stored index order (belts, stock): new materials are
 * appended so earlier indices stay put. Icons are `icon-<id>`: big, with an own silhouette and glow (art-factories).
 *
 * Tiers: 1 raw ore, 2 first processing, 3 alloys and plates, 4 parts, 5 wonder materials (mega machines).
 * Everywhere: copper + iron. Standard (rolled per map): coal, sand, lead, tin, titanium, bauxite, lithium salt,
 * tungsten. World ores: emberite (Rust Desert), verdite (Green Meadow), frostine (Ice & Snow). Rare: prismite,
 * obsidion. Scrap comes from wrecks.
 */
export const materials: MaterialDef[] = [
  // Raw, everywhere
  { id: 'copper-ore', name: 'Copper Ore', kind: 'raw', tier: 1, color: '#d9824a', accent: '#5fd0b5', icon: 'icon-copper-ore' },
  { id: 'iron-ore', name: 'Iron Ore', kind: 'raw', tier: 1, color: '#8f6f63', accent: '#c9a28d', icon: 'icon-iron-ore' },
  // Raw, standard
  { id: 'coal', name: 'Coal', kind: 'raw', tier: 1, color: '#3a3640', accent: '#6a6474', icon: 'icon-coal', fuel: 4 },
  { id: 'sand', name: 'Sand', kind: 'raw', tier: 1, color: '#e3c88f', accent: '#f4e2b8', icon: 'icon-sand' },
  { id: 'titanium-ore', name: 'Titanium Ore', kind: 'raw', tier: 2, color: '#8fa7d8', accent: '#d8e4ff', icon: 'icon-titanium-ore' },
  { id: 'scrap', name: 'Scrap', kind: 'raw', tier: 1, color: '#7d8590', accent: '#c47a3a', icon: 'icon-scrap' },
  // Processed
  { id: 'copper-wire', name: 'Copper Wire', kind: 'processed', tier: 2, color: '#e0894e', accent: '#ffc07a', icon: 'icon-copper-wire' },
  { id: 'iron-bar', name: 'Iron Bar', kind: 'processed', tier: 2, color: '#9aa3ad', accent: '#d5dbe2', icon: 'icon-iron-bar' },
  { id: 'graphite', name: 'Graphite', kind: 'processed', tier: 2, color: '#4b5063', accent: '#8b93ad', icon: 'icon-graphite' },
  { id: 'silicon', name: 'Silicon', kind: 'processed', tier: 2, color: '#5b6378', accent: '#a7b4d6', icon: 'icon-silicon' },
  { id: 'glass', name: 'Glass', kind: 'processed', tier: 2, color: '#9fd8e6', accent: '#e6fbff', icon: 'icon-glass' },
  { id: 'steel', name: 'Steel', kind: 'processed', tier: 3, color: '#b6c0cc', accent: '#eef2f6', icon: 'icon-steel' },
  { id: 'titanium-plate', name: 'Titanium Plate', kind: 'processed', tier: 3, color: '#a9b8e6', accent: '#e8eeff', icon: 'icon-titanium-plate' },
  { id: 'plastic', name: 'Plastic', kind: 'processed', tier: 3, color: '#e7e1f2', accent: '#b49be0', icon: 'icon-plastic' },
  // Parts
  { id: 'frame', name: 'Frame', kind: 'part', tier: 3, color: '#c8ccd4', accent: '#f2994a', icon: 'icon-frame' },
  { id: 'circuit', name: 'Circuit', kind: 'part', tier: 3, color: '#3aa37b', accent: '#ffd36b', icon: 'icon-circuit' },
  { id: 'motor', name: 'Motor', kind: 'part', tier: 4, color: '#6c7a96', accent: '#f2994a', icon: 'icon-motor' },
  { id: 'battery-cell', name: 'Battery Cell', kind: 'part', tier: 4, color: '#4ccfa0', accent: '#1f3b4d', icon: 'icon-battery-cell' },
  { id: 'core-chip', name: 'Core Chip', kind: 'part', tier: 4, color: '#7fe3ff', accent: '#ffffff', icon: 'icon-core-chip' },
  // Raw, standard (rolled per map)
  { id: 'lead-ore', name: 'Lead Ore', kind: 'raw', tier: 1, color: '#6f7f9a', accent: '#b8c6de', icon: 'icon-lead-ore' },
  { id: 'tin-ore', name: 'Tin Ore', kind: 'raw', tier: 2, color: '#c7b9a0', accent: '#f1e6d0', icon: 'icon-tin-ore' },
  { id: 'bauxite', name: 'Bauxite', kind: 'raw', tier: 2, color: '#b5503c', accent: '#f08a5d', icon: 'icon-bauxite' },
  { id: 'lithium-salt', name: 'Lithium Salt', kind: 'raw', tier: 3, color: '#f0d9ea', accent: '#ff9fd0', icon: 'icon-lithium-salt' },
  { id: 'tungsten-ore', name: 'Tungsten Ore', kind: 'raw', tier: 3, color: '#4a4658', accent: '#9a8fc4', icon: 'icon-tungsten-ore' },
  // Raw, world ores (one per world) and rare ores
  { id: 'emberite', name: 'Emberite', kind: 'raw', tier: 3, color: '#ff7a2e', accent: '#ffd36b', icon: 'icon-emberite', fuel: 16 },
  { id: 'verdite', name: 'Verdite', kind: 'raw', tier: 3, color: '#56d37a', accent: '#c8ffd9', icon: 'icon-verdite', fuel: 6 },
  { id: 'frostine', name: 'Frostine', kind: 'raw', tier: 3, color: '#79c8ff', accent: '#e6f6ff', icon: 'icon-frostine' },
  { id: 'prismite', name: 'Prismite', kind: 'raw', tier: 4, color: '#e9a8ff', accent: '#7ff0e8', icon: 'icon-prismite' },
  { id: 'obsidion', name: 'Obsidion', kind: 'raw', tier: 4, color: '#2a1f4a', accent: '#b06bff', icon: 'icon-obsidion' },
  // Processed, new
  { id: 'lead-ingot', name: 'Lead Ingot', kind: 'processed', tier: 2, color: '#8b9ab8', accent: '#d3ddf0', icon: 'icon-lead-ingot' },
  { id: 'tin-ingot', name: 'Tin Ingot', kind: 'processed', tier: 2, color: '#dccfb8', accent: '#fff4de', icon: 'icon-tin-ingot' },
  { id: 'aluminium', name: 'Aluminium', kind: 'processed', tier: 3, color: '#d3dbe6', accent: '#ffffff', icon: 'icon-aluminium' },
  { id: 'lithium', name: 'Lithium', kind: 'processed', tier: 3, color: '#ffb8de', accent: '#fff0f8', icon: 'icon-lithium' },
  { id: 'tungsten-carbide', name: 'Tungsten Carbide', kind: 'processed', tier: 3, color: '#5d5873', accent: '#b9b0e6', icon: 'icon-tungsten-carbide' },
  { id: 'prism-lens', name: 'Prism Lens', kind: 'processed', tier: 4, color: '#f3c8ff', accent: '#8ff6ee', icon: 'icon-prism-lens' },
  // Wonder materials: late game, for the mega machines and the Space Elevator
  { id: 'star-alloy', name: 'Star Alloy', kind: 'part', tier: 5, color: '#ffe27a', accent: '#fffbe0', icon: 'icon-star-alloy' },
  { id: 'singularity', name: 'Singularity', kind: 'part', tier: 5, color: '#1a1030', accent: '#c78bff', icon: 'icon-singularity' },
  { id: 'elevator-segment', name: 'Elevator Segment', kind: 'part', tier: 5, color: '#e8f1ff', accent: '#ffd36b', icon: 'icon-elevator-segment' },
];
