import { touches } from './grid';
import type { Building } from './state';
import type { World } from './world';

interface StorageInfo {
  /** Per-material capacity of the core stock (core + docked storage). */
  capacity: number;
  /** Storage buildings touching the core: they act as part of it. */
  docked: Set<number>;
}

/** Core capacity and docked containers, cached per layout. */
export function storageInfo(w: World): StorageInfo {
  const hit = w.cache.storage as StorageInfo | undefined;
  if (hit) return hit;
  const core = w.core;
  const docked = new Set<number>();
  const room = (b: Building) => (w.def(b).storage?.capacity ?? 0) * w.state.bonus.capacity;
  let capacity = core ? room(core) : 0;
  for (const n of core ? w.neighbours(core) : []) {
    if (w.def(n).behaviour !== 'storage' || !w.ready(n) || !touches(w.rect(core!), w.rect(n))) continue;
    docked.add(n.id);
    capacity += room(n);
  }
  const info = { capacity: Math.floor(capacity), docked };
  w.cache.storage = info;
  return info;
}

/** Room left in the core stock for one material. */
export function coreRoom(w: World, item: number): number {
  return storageInfo(w).capacity - (w.state.stock[item] ?? 0);
}

/** Puts items into the core stock (clamped to capacity); returns how many fit. */
export function storeInCore(w: World, item: number, n: number): number {
  const fit = Math.max(0, Math.min(n, coreRoom(w, item)));
  w.state.stock[item] = (w.state.stock[item] ?? 0) + fit;
  w.state.stats.delivered[item] = (w.state.stats.delivered[item] ?? 0) + fit;
  return fit;
}

/**
 * An item arriving at the core (a belt, a neighbour, a docked container's input): it always counts as delivered,
 * and what does not fit is burned, as in Mindustry. A full core never stops a belt, so one capped item can not
 * jam a shared line, and a "deliver" order never waits for the stock to drop (titanium ore once sat at the
 * cap before its order started, and the order could not move at all).
 */
export function deliverToCore(w: World, item: number): void {
  w.state.stock[item] = (w.state.stock[item] ?? 0) + Math.min(1, Math.max(0, coreRoom(w, item)));
  w.state.stats.delivered[item] = (w.state.stats.delivered[item] ?? 0) + 1;
}

/** Core and docked storage share one stock. */
export function isCoreStock(w: World, b: Building): boolean {
  return b.id === w.state.core || storageInfo(w).docked.has(b.id);
}

/** Items a storage-like building holds of one material (the core stock for the core and docked storage). */
export function heldBy(w: World, b: Building, item: number): number {
  return isCoreStock(w, b) ? (w.state.stock[item] ?? 0) : (b.items[item] ?? 0);
}

/** Takes one item out of a storage-like building. */
export function takeFrom(w: World, b: Building, item: number): boolean {
  if (heldBy(w, b, item) <= 0) return false;
  if (isCoreStock(w, b)) w.state.stock[item]!--;
  else b.items[item]!--;
  return true;
}
