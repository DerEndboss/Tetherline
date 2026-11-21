import type { TickContext } from './blocks/types';
import type { MapState } from './state';
import { storeInCore } from './storage';
import type { World } from './world';

/**
 * Wrecks: mapgen scatters them; clicking one salvages it. Its blueprint unlocks a rare
 * building for this run (progress.unlocked) and it gives some scrap.
 */

type Wreck = MapState['wrecks'][number];

/** Scrap a salvaged wreck gives (scrap comes from wrecks). */
const WRECK_SCRAP = 60;
/** How far from its centre a wreck can be clicked (the painted hull is 7x7). */
const WRECK_REACH = 3;

/** The untaken wreck whose hull covers a tile, if any. */
export function wreckAt(w: World, x: number, y: number): Wreck | undefined {
  return w.state.map.wrecks.find((r) => !r.taken && Math.abs(r.x - x) <= WRECK_REACH && Math.abs(r.y - y) <= WRECK_REACH);
}

export function salvage(w: World, x: number, y: number, ctx: TickContext): void {
  const wreck = wreckAt(w, x, y);
  if (!wreck) return;
  wreck.taken = true;
  const { unlocked } = w.state.progress;
  if (!unlocked.includes(wreck.building)) unlocked.push(wreck.building);
  const scrap = w.content.materials.indexOf('scrap');
  if (scrap >= 0) storeInCore(w, scrap, WRECK_SCRAP);
  ctx.events.push({ type: 'wreck-salvaged', building: wreck.building, x: wreck.x, y: wreck.y });
}

