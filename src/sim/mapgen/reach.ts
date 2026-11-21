import type { Id } from '../../content/types';
import type { MapState } from '../state';
import { DIRS, inMap } from './grid';
import { flood } from './land';

/** A tile a building can stand on (boulders do not count: building over them clears them). */
export function walkable(map: MapState, deepIds: ReadonlySet<number>): (i: number) => boolean {
  return (i) => map.ground[i]! > 0 && !map.ridge[i] && !deepIds.has(map.floor[i]!);
}

/** The floor bytes of deep liquids (only pumps may stand there). */
export function deepFloors(floors: readonly { id: Id; deep?: boolean }[]): Set<number> {
  const out = new Set<number>();
  floors.forEach((f, i) => f.deep && out.add(i + 1));
  return out;
}

/**
 * 0-1 BFS from the reachable area over every land tile: free over buildable tiles, cost 1 over a wall (rock,
 * deep water). `from` is the BFS tree: following it from a cut-off tile leads to the reachable area through the
 * fewest walls.
 */
function wallTree(map: MapState, ok: (i: number) => boolean, reached: Uint8Array): Int32Array {
  const n = map.w * map.h;
  const cost = new Int32Array(n).fill(-1);
  const from = new Int32Array(n).fill(-1);
  const settled = new Uint8Array(n);
  let level: number[] = [];
  let next: number[] = [];
  reached.forEach((r, i) => {
    if (!r) return;
    cost[i] = 0;
    level.push(i);
  });
  const relax = (i: number, step: number, dx: number, dy: number): void => {
    const x = (i % map.w) + dx;
    const y = Math.floor(i / map.w) + dy;
    const j = y * map.w + x;
    if (!inMap(map, x, y) || !map.ground[j] || settled[j]) return;
    const c = step + (ok(j) ? 0 : 1);
    if (cost[j] !== -1 && c >= cost[j]!) return;
    cost[j] = c;
    from[j] = i;
    (c === step ? level : next).push(j);
  };
  for (let step = 0; level.length; step++) {
    while (level.length) {
      const i = level.pop()!;
      if (settled[i]) continue;
      settled[i] = 1;
      for (const [dx, dy] of DIRS) relax(i, step, dx, dy);
    }
    level = next;
    next = [];
  }
  return from;
}

/**
 * Every buildable tile reachable from `start` (4-neighbours): the playability rule. Pockets that rocks or lakes
 * cut off are opened with a cut through the cheapest wall, or filled with rock when tiny and empty.
 */
export function connect(map: MapState, start: number, deep: ReadonlySet<number>, shallow: number): void {
  const ok = walkable(map, deep);
  const reached = flood(map.w, map.h, start, ok);
  openPockets(map, ok, reached, wallTree(map, ok, reached), deep, shallow);
}

/** Size of a pocket and whether a resource floor lies in it. */
function inspect(map: MapState, pocket: Uint8Array, done: Uint8Array): { size: number; marked: boolean } {
  let size = 0;
  let marked = false;
  pocket.forEach((p, j) => {
    if (!p) return;
    done[j] = 1;
    size++;
    marked ||= map.floor[j]! > 0;
  });
  return { size, marked };
}

function openPockets(map: MapState, ok: (i: number) => boolean, reached: Uint8Array, from: Int32Array, deep: ReadonlySet<number>, shallow: number): void {
  const done = new Uint8Array(reached);
  for (let i = 0; i < reached.length; i++) {
    if (done[i] || !ok(i)) continue;
    const pocket = flood(map.w, map.h, i, (j) => ok(j) && !done[j]);
    const { size, marked } = inspect(map, pocket, done);
    if (size < 14 && !marked) pocket.forEach((p, j) => p && (map.ridge[j] = 1));
    else cutPath(map, i, from, reached, done, deep, shallow);
  }
}

/** Walks back from a pocket tile to the reachable area along the BFS tree and clears walls on the way. */
/** `done` marks the opened tiles so the pocket scan does not mistake the cut for a new pocket. */
function cutPath(map: MapState, start: number, from: Int32Array, reached: Uint8Array, done: Uint8Array, deep: ReadonlySet<number>, shallow: number): void {
  let i = start;
  while (i >= 0 && !reached[i]) {
    clearTile(map, i, deep, shallow);
    done[i] = 1;
    const x = i % map.w;
    const y = (i - x) / map.w;
    for (const [dx, dy] of DIRS) {
      const j = (y + dy) * map.w + x + dx;
      if (x + dx >= 0 && x + dx < map.w && y + dy >= 0 && y + dy < map.h && map.ridge[j]) {
        clearTile(map, j, deep, shallow);
        done[j] = 1;
      }
    }
    i = from[i]!;
  }
}

/** A wall tile opens: rock goes, deep water becomes the shallow kind so a belt can cross. */
function clearTile(map: MapState, i: number, deep: ReadonlySet<number>, shallow: number): void {
  map.ridge[i] = 0;
  if (shallow && deep.has(map.floor[i]!)) map.floor[i] = shallow;
}
