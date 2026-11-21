import { TICK_HZ } from '../sim/constants';
import type { World } from '../sim/world';

/** A run older than this (sim seconds) at the moment the guide first sees it is no beginner's: the guide ends silently. */
export const LATE_SECONDS = 15 * 60;

const reached = new WeakMap<World, number>();

/** The furthest step already reached in this run (0 at the start). */
export const reachedStep = (world: World): number => reached.get(world) ?? 0;

/**
 * The step to show: the first one not done, but never earlier than one already reached in this run (demolishing the
 * drill later must not send the player back to "place a drill").
 */
export function reach(world: World, open: number): number {
  const index = Math.max(reached.get(world) ?? 0, open);
  reached.set(world, index);
  return index;
}

/** Whether the run is too far along for a first-round guide. */
export function isLate(world: World): boolean {
  return world.state.tick > LATE_SECONDS * TICK_HZ;
}
