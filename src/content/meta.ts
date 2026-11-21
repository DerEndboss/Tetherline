import { buildings } from './buildings';
import { materials } from './materials';
import type { Id, MetaNodeDef } from './types';

/**
 * The meta tree between rounds: the currency (rules.metaCurrency, "Blueprints") comes
 * from order rewards and the win bonus. Four branches: Builder, Miner, Logistics and Power, plus buildings to
 * unlock. Nodes that name a building or material the content does not have yet are dropped, and the tree closes
 * the gap (`droppedMeta`), like the order chain.
 */

const bonus = (stat: 'build-speed' | 'drill-speed' | 'core-capacity' | 'belt-speed' | 'power', value: number) => ({ kind: 'bonus', stat, value }) as const;
const items = (...list: [Id, number][]) => ({ kind: 'start-items', items: list.map(([item, n]) => ({ item, n })) }) as const;
const unlock = (building: Id) => ({ kind: 'unlock', building }) as const;

const full: MetaNodeDef[] = [
  // Builder
  { id: 'quick-hands', name: 'Quick Hands', description: 'Your drone builds 20 % faster.', cost: 1, requires: [], effect: bonus('build-speed', 0.2) },
  { id: 'steady-hands', name: 'Steady Hands', description: 'Your drone builds another 25 % faster.', cost: 3, requires: ['quick-hands'], effect: bonus('build-speed', 0.25) },
  { id: 'foreman', name: 'Foreman', description: 'Your drone builds another 30 % faster.', cost: 5, requires: ['steady-hands'], effect: bonus('build-speed', 0.3) },
  // Miner
  { id: 'starter-crate', name: 'Starter Crate', description: 'Start each round with 200 extra copper ore.', cost: 1, requires: [], effect: items(['copper-ore', 200]) },
  { id: 'deep-bits', name: 'Deep Bits', description: 'Drills work 10 % faster.', cost: 2, requires: ['starter-crate'], effect: bonus('drill-speed', 0.1) },
  { id: 'iron-stash', name: 'Iron Stash', description: 'Start with 100 iron bars and 60 copper wire.', cost: 2, requires: ['starter-crate'], effect: items(['iron-bar', 100], ['copper-wire', 60]) },
  { id: 'hard-rock', name: 'Hard Rock', description: 'Drills work another 15 % faster.', cost: 4, requires: ['deep-bits'], effect: bonus('drill-speed', 0.15) },
  { id: 'laser-drill-kit', name: 'Laser Drill Kit', description: 'Unlocks the Laser Drill from the start.', cost: 4, requires: ['hard-rock'], effect: unlock('laser-drill') },
  { id: 'deep-stash', name: 'Deep Stash', description: 'Start with 80 steel and 60 silicon.', cost: 4, requires: ['iron-stash'], effect: items(['steel', 80], ['silicon', 60]) },
  { id: 'chip-box', name: 'Chip Box', description: 'Start with 10 core chips and 50 circuits.', cost: 6, requires: ['deep-stash'], effect: items(['core-chip', 10], ['circuit', 50]) },
  // Logistics
  { id: 'faster-belts', name: 'Greased Rollers', description: 'Conveyors move 15 % faster.', cost: 2, requires: ['starter-crate'], effect: bonus('belt-speed', 0.15) },
  { id: 'bigger-hold', name: 'Bigger Hold', description: 'The core and containers hold 25 % more.', cost: 2, requires: ['quick-hands'], effect: bonus('core-capacity', 0.25) },
  { id: 'vault-plans', name: 'Vault Plans', description: 'Unlocks the Vault from the start.', cost: 3, requires: ['bigger-hold'], effect: unlock('vault') },
  { id: 'mass-driver-plans', name: 'Driver Plans', description: 'Unlocks the Mass Driver from the start.', cost: 4, requires: ['faster-belts'], effect: unlock('mass-driver') },
  { id: 'deep-hold', name: 'Deep Hold', description: 'The core and containers hold another 50 % more.', cost: 5, requires: ['vault-plans'], effect: bonus('core-capacity', 0.5) },
  // Power
  { id: 'warm-core', name: 'Warm Core', description: 'All power sources make 10 % more.', cost: 3, requires: ['faster-belts'], effect: bonus('power', 0.1) },
  { id: 'solar-plans', name: 'Sun Plans', description: 'Unlocks Large Solar from the start.', cost: 3, requires: ['warm-core'], effect: unlock('large-solar') },
  { id: 'wind-plans', name: 'Wind Plans', description: 'Unlocks the Wind Turbine from the start.', cost: 3, requires: ['warm-core'], effect: unlock('wind-turbine') },
  { id: 'grid-genius', name: 'Grid Genius', description: 'All power sources make another 20 % more.', cost: 5, requires: ['solar-plans'], effect: bonus('power', 0.2) },
];

/** Drops nodes naming content that does not exist and re-wires what required them. */
function fit(nodes: readonly MetaNodeDef[], blocks: Set<Id>, mats: Set<Id>): { meta: MetaNodeDef[]; dropped: Id[] } {
  const bad = (n: MetaNodeDef): boolean => {
    const e = n.effect;
    if (e.kind === 'unlock') return !blocks.has(e.building);
    if (e.kind === 'start-items') return e.items.some((s) => !mats.has(s.item));
    return false;
  };
  const gone = new Set(nodes.filter(bad).map((n) => n.id));
  const needs = (n: MetaNodeDef): Id[] => [...new Set(n.requires.flatMap((r) => (gone.has(r) ? needs(nodes.find((x) => x.id === r)!) : [r])))];
  return { meta: nodes.filter((n) => !gone.has(n.id)).map((n) => ({ ...n, requires: needs(n) })), dropped: [...gone] };
}

const fitted = fit(full, new Set(buildings.map((b) => b.id)), new Set(materials.map((m) => m.id)));

export const meta: MetaNodeDef[] = fitted.meta;
export const droppedMeta: readonly Id[] = fitted.dropped;
