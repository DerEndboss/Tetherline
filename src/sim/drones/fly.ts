import type { Building, DroneState } from '../state';
import type { World } from '../world';
import type { FleetStats } from './tech';

/** Centre of a building's footprint in tile units. */
export function centre(w: World, b: Building): { x: number; y: number } {
  const size = w.def(b).size;
  return { x: b.x + size / 2, y: b.y + size / 2 };
}

/**
 * Flies towards a point; returns whether the drone is within `range` of it. It eases out over the last few
 * tiles (no hard stop) and stops at 80% of the range.
 */
export function approach(d: DroneState, x: number, y: number, dt: number, stats: FleetStats, range: number): boolean {
  const dx = x - d.x;
  const dy = y - d.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= range) return true;
  const gap = dist - range * 0.8;
  const step = Math.min(gap, stats.speed * dt * Math.min(1, 0.2 + gap / 5));
  d.x += (dx / dist) * step;
  d.y += (dy / dist) * step;
  return false;
}

/** Tiles over which a gliding drone eases out towards its stand point. */
const EASE = 1.2;

/**
 * Glides towards a point and stays `hold` tiles short of it: full speed while far, speed proportional to the gap
 * when near. Unlike `approach` it never stops at a range edge, so a drone follows a front that keeps moving
 * (a belt line being laid) in one smooth run instead of stop and go.
 */
export function follow(d: DroneState, x: number, y: number, dt: number, speed: number, hold: number): void {
  const dx = x - d.x;
  const dy = y - d.y;
  const dist = Math.hypot(dx, dy);
  const gap = dist - hold;
  if (gap < 0.02) return;
  const step = Math.min(gap, speed * dt * Math.min(1, gap / EASE));
  d.x += (dx / dist) * step;
  d.y += (dy / dist) * step;
}

/** A fixed small offset per drone so several drones at one spot do not sit on each other. */
export function spread(index: number): { x: number; y: number } {
  const a = index * 2.4;
  return { x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5 };
}
