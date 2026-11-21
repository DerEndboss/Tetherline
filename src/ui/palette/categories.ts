import type { BuildCategory, BuildingDef } from '../../content/types';
import type { World } from '../../sim/world';

export const CATEGORIES: { id: BuildCategory; name: string }[] = [
  { id: 'core', name: 'Core' },
  { id: 'mining', name: 'Mining' },
  { id: 'logistics', name: 'Logistics' },
  { id: 'power', name: 'Power' },
  { id: 'factories', name: 'Factories' },
  { id: 'liquids', name: 'Liquids' },
  { id: 'mega', name: 'Mega' },
];

/** The id of the core stage that upgrades the run's core next (null: none, or the core is at its last stage). */
export function nextCoreId(w: World): string | null {
  const core = w.core;
  return core ? (w.def(core).core?.next ?? null) : null;
}

/**
 * Palette entries of a category, in palette order. Of the core stages only the next upgrade is listed: there is one
 * core per run, every other stage could never be placed.
 */
export function categoryList(all: readonly BuildingDef[], tab: BuildCategory, nextCore: string | null = null): BuildingDef[] {
  return all.filter((b) => b.category === tab && (b.behaviour !== 'core' || b.id === nextCore)).sort((a, b) => a.order - b.order);
}
