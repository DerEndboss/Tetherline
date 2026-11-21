import { describe, expect, it } from 'vitest';
import type { Dir } from '../sim/state';
import { aimFacing, linePath, routePath, type Terrain } from './line';

describe('dragged lines', () => {
  it('runs along the longer axis, turns, and faces onwards', () => {
    const path = linePath({ x: 0, y: 0 }, { x: 3, y: 1 }, 0);
    expect(path.map((p) => [p.x, p.y, p.rot])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 1],
      [3, 1, 1],
    ]);
  });

  it('a single tile keeps the chosen rotation', () => {
    expect(linePath({ x: 2, y: 2 }, { x: 2, y: 2 }, 3)).toEqual([{ x: 2, y: 2, rot: 3 }]);
  });

  it('can start along the other axis', () => {
    const path = linePath({ x: 0, y: 0 }, { x: 3, y: 1 }, 0, false);
    expect(path.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(path[0]!.rot).toBe(1);
    expect(path[1]!.rot).toBe(0);
  });
});

describe('routed lines', () => {
  const open = () => true;

  it('is the plain L when it is free', () => {
    expect(routePath({ x: 0, y: 0 }, { x: 3, y: 1 }, 0, open)).toEqual(linePath({ x: 0, y: 0 }, { x: 3, y: 1 }, 0));
  });

  it('takes the other L when the first is blocked', () => {
    const wall = (x: number, y: number) => !(x === 2 && y === 0);
    const path = routePath({ x: 0, y: 0 }, { x: 3, y: 1 }, 0, wall);
    expect(path.some((p) => p.x === 2 && p.y === 0)).toBe(false);
    expect(path[path.length - 1]).toMatchObject({ x: 3, y: 1 });
  });

  it('goes around a wall with few turns and never steps on a blocked tile', () => {
    // a vertical wall at x = 5 from y = -4..4, open above and below
    const free = (x: number, y: number) => !(x === 5 && y >= -4 && y <= 4);
    const path = routePath({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, free);
    expect(path[0]).toMatchObject({ x: 0, y: 0 });
    expect(path[path.length - 1]).toMatchObject({ x: 10, y: 0 });
    expect(path.every((p) => free(p.x, p.y))).toBe(true);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y)).toBe(1);
    const turns = path.filter((p, i) => i > 0 && p.rot !== path[i - 1]!.rot).length;
    expect(turns).toBeLessThanOrEqual(4);
  });

  it('falls back to the plain L when the end is walled in', () => {
    const free = (x: number, y: number) => !(Math.abs(x - 10) <= 1 && Math.abs(y) <= 1 && !(x === 10 && y === 0));
    const path = routePath({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, free);
    expect(path.length).toBe(11);
  });
});

describe('routes with rules', () => {
  const open = () => true;

  it('takes the other L when only that one ends pointing at a target, unless the axis is kept', () => {
    // the target is the tile (4, 6): only a belt on (4, 5) heading south points at it
    const feeds = (x: number, y: number, d: Dir): number => (x + [1, 0, -1, 0][d]! === 4 && y + [0, 1, 0, -1][d]! === 6 ? 1 : 0);
    const terrain: Terrain = { free: open, feeds };
    // the longer axis is y, so the plain L runs down first and ends going east, along the target
    const path = routePath({ x: 0, y: 0 }, { x: 4, y: 5 }, 0, terrain);
    expect(path[1]).toMatchObject({ x: 1, y: 0 });
    expect(path[path.length - 1]).toMatchObject({ x: 4, y: 5, rot: 1 });
    const kept = routePath({ x: 0, y: 0 }, { x: 4, y: 5 }, 0, { ...terrain, keepAxis: true });
    expect(kept[1]).toMatchObject({ x: 0, y: 1 });
    expect(kept[kept.length - 1]).toMatchObject({ x: 4, y: 5, rot: 1 }); // still turned into the target
  });

  it('turns the last tile towards the best neighbour, never back the way it came', () => {
    // two targets: west of (4, 0) (behind the line, so not taken) and south of it
    const feeds = (x: number, y: number, d: Dir): number => (x === 4 && y === 0 ? (d === 2 ? 5 : d === 1 ? 1 : 0) : 0);
    const path = routePath({ x: 0, y: 0 }, { x: 4, y: 0 }, 0, { free: open, feeds });
    expect(path[path.length - 1]).toMatchObject({ x: 4, y: 0, rot: 1 });
    expect(path.slice(0, -1).every((p) => p.rot === 0)).toBe(true);
  });

  it('leaves the last tile alone when it already faces a target, or when nothing takes items', () => {
    const faces = (x: number, y: number, d: Dir): number => (x === 4 && y === 0 && d === 0 ? 1 : 0);
    expect(routePath({ x: 0, y: 0 }, { x: 4, y: 0 }, 0, { free: open, feeds: faces }).pop()!.rot).toBe(0);
    expect(routePath({ x: 0, y: 0 }, { x: 4, y: 0 }, 0, { free: open, feeds: () => 0 }).pop()!.rot).toBe(0);
  });

  it('keeps a target straight ahead unless a neighbour beside the end takes items strictly better', () => {
    // at (4, 0): east (ahead) scores 2, south scores 4, west is the way it came
    const scores = (ahead: number, side: number) => (x: number, y: number, d: Dir): number => (x === 4 && y === 0 ? (d === 0 ? ahead : d === 1 ? side : d === 2 ? 9 : 0) : 0);
    const end = (ahead: number, side: number) => routePath({ x: 0, y: 0 }, { x: 4, y: 0 }, 0, { free: open, feeds: scores(ahead, side) }).pop()!.rot;
    expect(end(2, 4)).toBe(1); // the better side target wins over the weaker one ahead
    expect(end(4, 4)).toBe(0); // an equal one does not: the line stays as it was aimed
    expect(end(5, 4)).toBe(0); // a join ahead outranks the core beside it
  });

  it('asks `guard` for the first and the last tile only, and takes the facing it gives', () => {
    const asked: string[] = [];
    const guard = (x: number, y: number, rot: Dir): Dir => {
      asked.push(`${x},${y}`);
      return x === 4 ? 1 : rot;
    };
    const path = routePath({ x: 0, y: 0 }, { x: 4, y: 0 }, 0, { free: open, guard });
    expect(asked.sort()).toEqual(['0,0', '4,0']);
    expect(path.map((p) => p.rot)).toEqual([0, 0, 0, 0, 1]);
    asked.length = 0;
    routePath({ x: 2, y: 2 }, { x: 2, y: 2 }, 0, { free: open, guard });
    expect(asked).toEqual([]); // one tile (a click) is not a line
  });

  it('refuses the plain L over a tile `pass` vetoes, and a detour never uses a tile only a direct drag may', () => {
    const slow = (x: number, y: number, _in: Dir, _out: Dir, direct: boolean): boolean => !(y === 0 && x >= 2 && x <= 3) || direct;
    const path = routePath({ x: 0, y: 0 }, { x: 6, y: 0 }, 0, { free: open, pass: slow });
    expect(path).toHaveLength(7);
    const veto = (x: number, y: number): boolean => !(y === 0 && x >= 2 && x <= 3);
    const around = routePath({ x: 0, y: 0 }, { x: 6, y: 0 }, 0, { free: open, pass: veto });
    expect(around.some((p) => p.y !== 0)).toBe(true);
    expect(around.some((p) => p.y === 0 && p.x >= 2 && p.x <= 3)).toBe(false);
  });
});

describe('aimFacing', () => {
  const ahead = (x: number, y: number, d: Dir, straight: boolean): number => (x === 0 && y === 0 ? (d === 0 ? 2 : d === 3 ? 3 : d === 2 && !straight ? 4 : 0) : 0);

  it('turns to the strictly better neighbour and never back the way a line came', () => {
    expect(aimFacing(ahead, 0, 0, 0, true)).toBe(3); // north scores 3 > east 2; west (4) is behind the line
    expect(aimFacing(ahead, 0, 0, 0, false)).toBe(2); // with no line behind it, west is fair game
  });

  it('keeps its facing when nothing beside it is better, or no neighbour takes items at all', () => {
    expect(aimFacing((_x, _y, d) => (d === 0 ? 5 : d === 1 ? 2 : 0), 0, 0, 0, true)).toBe(0);
    expect(aimFacing(() => 0, 0, 0, 1, true)).toBe(1);
  });
});
