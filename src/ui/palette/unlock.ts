import type { BuildingDef } from '../../content/types';
import type { World } from '../../sim/world';

/** Whether the player may build `def` now: start buildings always, the rest once an order or wreck unlocked them. */
export function isUnlocked(w: World, def: BuildingDef): boolean {
  return def.unlock === 'start' || w.state.progress.unlocked.includes(def.id);
}

/** Why a building is locked, in words for the tooltip. */
export function unlockHint(def: BuildingDef): string {
  switch (def.unlock) {
    case 'order':
      return 'Unlocked by an order';
    case 'wreck':
      return 'Blueprint hides in a wreck on the map';
    case 'meta':
      return 'Unlocked in the tech tree between rounds';
    default:
      return '';
  }
}

/** Whether the core holds the full cost right now. */
export function canAfford(w: World, def: BuildingDef, stock: readonly number[]): boolean {
  return def.cost.every((c) => (stock[w.content.materials.indexOf(c.item)] ?? 0) >= c.n);
}
