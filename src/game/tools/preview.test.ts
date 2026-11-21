import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { beltLine, placeNow, testWorld } from '../../sim/dev';
import { DX, DY } from '../../sim/grid';
import type { World } from '../../sim/world';
import { autoRot, placePreview, type PreviewGhost } from './preview';

const conveyor = content.buildings.get('conveyor');
const kind = content.buildings.indexOf('conveyor');
const mods = { shift: false, ctrl: false };

describe('a single clicked belt turns to fit its neighbours', () => {
  it('feeds the back of a belt that runs away from it (the gap between a drill and its line)', () => {
    const w = testWorld(content, 30, 30);
    beltLine(w, 10, 11, 1, 5); // a line heading south, starting one tile below (10, 10)
    expect(autoRot(w, conveyor, { x: 10, y: 10 }, 0)).toBe(1);
  });

  it('continues a belt whose front points at it', () => {
    const w = testWorld(content, 30, 30);
    beltLine(w, 5, 10, 0, 4); // heading east, the last piece at (8, 10) faces (9, 10)
    expect(autoRot(w, conveyor, { x: 9, y: 10 }, 3)).toBe(0);
  });

  it('keeps the chosen way in open ground and once the player turned it', () => {
    const w = testWorld(content, 30, 30);
    expect(autoRot(w, conveyor, { x: 9, y: 10 }, 2)).toBe(2);
    beltLine(w, 10, 11, 1, 5);
    expect(placePreview(w, conveyor, kind, { x: 10, y: 10 }, null, 2, mods, false)[0]!.rot).toBe(2);
    expect(placePreview(w, conveyor, kind, { x: 10, y: 10 }, null, 2, mods, true)[0]!.rot).toBe(1);
  });
});

describe('dragging a belt line across another belt (Mindustry)', () => {
  const junction = content.buildings.indexOf('junction');
  const drag = (x: number, y: number) => ({ from: { x, y }, xFirst: true });

  it('puts a junction where the line crosses a belt that runs the other way', () => {
    const w = testWorld(content, 30, 30);
    beltLine(w, 10, 5, 1, 10); // a line heading south through (10, 10)
    const ghosts = placePreview(w, conveyor, kind, { x: 14, y: 10 }, drag(6, 10), 0, mods);
    const at = ghosts.find((g) => g.x === 10 && g.y === 10)!;
    expect(at.kind).toBe(junction);
    expect(at.ok).toBe(true);
    expect(ghosts.filter((g) => g.kind === junction)).toHaveLength(1);
  });

  it('turns a parallel belt instead, and keeps the end tiles as belts', () => {
    const w = testWorld(content, 30, 30);
    beltLine(w, 6, 10, 2, 9); // the same row, heading west
    const ghosts = placePreview(w, conveyor, kind, { x: 14, y: 10 }, drag(6, 10), 0, mods);
    expect(ghosts.some((g) => g.kind === junction)).toBe(false);
    const w2 = testWorld(content, 30, 30);
    beltLine(w2, 6, 5, 1, 10); // crosses only the first tile of the drag
    expect(placePreview(w2, conveyor, kind, { x: 14, y: 10 }, drag(6, 10), 0, mods)[0]!.kind).toBe(kind);
  });
});

/** A 40x40 test world with the core at (10, 20) (it covers 10..12 x 20..22), the way the tutorial has it. */
function coreWorld(): World {
  const w = testWorld(content, 40, 40);
  placeNow(w, 'core-shard', 10, 20);
  return w;
}

const ridge = (w: World, x: number, y: number) => {
  w.state.map.ridge[y * w.state.map.w + x] = 1;
};
const at = (ghosts: PreviewGhost[], x: number, y: number) => ghosts.find((g) => g.x === x && g.y === y);
const lastOf = (ghosts: PreviewGhost[]) => ghosts[ghosts.length - 1]!;
const dragFrom = (x: number, y: number, xFirst: boolean | null = null) => ({ from: { x, y }, xFirst });

describe('the end of a dragged line points at its target', () => {
  it('lays the axes so that the last segment runs into the core (tutorial: drill to core)', () => {
    const w = coreWorld();
    // from the tile under a drill at (11, 10) to the tile above the core: the long way is down, but ending west
    // would run along the core's edge, so the line goes west first and then straight down into the core
    const ghosts = placePreview(w, conveyor, kind, { x: 10, y: 19 }, dragFrom(11, 12), 0, mods, true);
    expect(ghosts.map((g) => [g.x, g.y])).toEqual([[11, 12], [10, 12], [10, 13], [10, 14], [10, 15], [10, 16], [10, 17], [10, 18], [10, 19]]);
    expect(lastOf(ghosts).rot).toBe(1);
    expect(ghosts.every((g) => g.ok)).toBe(true);
  });

  it('turns the last tile into the core when only the other order is free', () => {
    const w = coreWorld();
    ridge(w, 10, 12); // the west-first line is blocked
    const ghosts = placePreview(w, conveyor, kind, { x: 10, y: 19 }, dragFrom(11, 12), 0, mods, true);
    expect(at(ghosts, 11, 19)!.rot).toBe(2);
    expect(lastOf(ghosts)).toMatchObject({ x: 10, y: 19, rot: 1 });
  });

  it('keeps the axis the player flipped with Ctrl but still turns the end into the core', () => {
    const w = coreWorld();
    const flipped = placePreview(w, conveyor, kind, { x: 10, y: 19 }, dragFrom(4, 18), 0, { shift: false, ctrl: true }, true);
    expect(flipped[1]).toMatchObject({ x: 4, y: 19 });
    expect(lastOf(flipped)).toMatchObject({ x: 10, y: 19, rot: 1 });
    const plain = placePreview(w, conveyor, kind, { x: 10, y: 19 }, dragFrom(4, 18), 0, mods, true);
    expect(plain[1]).toMatchObject({ x: 5, y: 18 });
    expect(lastOf(plain)).toMatchObject({ x: 10, y: 19, rot: 1 });
  });

  it('ends a detour round a rock rib facing the core (coal line)', () => {
    const w = coreWorld();
    ridge(w, 5, 21);
    const ghosts = placePreview(w, conveyor, kind, { x: 9, y: 21 }, dragFrom(1, 21), 0, mods, true);
    expect(at(ghosts, 5, 21)).toBeUndefined();
    expect(lastOf(ghosts)).toMatchObject({ x: 9, y: 21, rot: 0 });
    expect(ghosts.every((g) => g.ok)).toBe(true);
  });

  it('leaves the end as it came once the player has turned the tool with R', () => {
    const w = coreWorld();
    const ghosts = placePreview(w, conveyor, kind, { x: 10, y: 19 }, dragFrom(11, 12), 0, mods, false);
    expect(lastOf(ghosts)).toMatchObject({ x: 10, y: 19, rot: 2 });
  });

  it('does not turn into a belt that comes head-on or that runs alongside', () => {
    const w = testWorld(content, 40, 40);
    beltLine(w, 20, 11, 2, 5); // runs west along y = 11, beside the end tile (20, 10)
    const ghosts = placePreview(w, conveyor, kind, { x: 20, y: 10 }, dragFrom(10, 10), 0, mods, true);
    expect(lastOf(ghosts)).toMatchObject({ x: 20, y: 10, rot: 0 });
    const w2 = testWorld(content, 40, 40);
    beltLine(w2, 20, 11, 3, 1); // one belt facing north, back at the end tile's side: it takes items from behind
    expect(lastOf(placePreview(w2, conveyor, kind, { x: 20, y: 12 }, dragFrom(10, 12), 0, mods, true)).rot).toBe(3);
  });

  it('turns a single clicked belt next to the core into it, until R is pressed', () => {
    const w = coreWorld();
    expect(autoRot(w, conveyor, { x: 10, y: 19 }, 0)).toBe(1);
    expect(placePreview(w, conveyor, kind, { x: 10, y: 19 }, null, 0, mods, true)[0]!.rot).toBe(1);
    expect(placePreview(w, conveyor, kind, { x: 10, y: 19 }, null, 0, mods, false)[0]!.rot).toBe(0);
    expect(autoRot(w, conveyor, { x: 20, y: 19 }, 0)).toBe(0);
  });

  it('also aims at a queued factory ghost', () => {
    const w = testWorld(content, 40, 40);
    const smelter = content.buildings.indexOf('smelter');
    w.state.plans.push({ kind: smelter, x: 20, y: 20, rot: 0, config: -1 });
    const ghosts = placePreview(w, conveyor, kind, { x: 19, y: 20 }, dragFrom(10, 20), 0, mods, true);
    expect(lastOf(ghosts)).toMatchObject({ x: 19, y: 20, rot: 0 });
    const side = placePreview(w, conveyor, kind, { x: 21, y: 19 }, dragFrom(30, 19), 0, mods, true);
    expect(lastOf(side)).toMatchObject({ x: 21, y: 19, rot: 1 });
  });
});

describe('a clicked belt, its hover ghost and a drag that never leaves the tile face the same way', () => {
  const faces = (w: World, x: number, y: number, auto = true) => ({
    auto: autoRot(w, conveyor, { x, y }, 0),
    hover: placePreview(w, conveyor, kind, { x, y }, null, 0, mods, auto)[0]!.rot,
    tiny: placePreview(w, conveyor, kind, { x, y }, dragFrom(x, y), 0, mods, auto)[0]!.rot,
  });

  it('turns into the core when the belt that leads in would only run along its edge', () => {
    const w = coreWorld();
    beltLine(w, 5, 19, 0, 5); // the last piece (9, 19) faces (10, 19), which sits right above the core
    expect(faces(w, 10, 19)).toEqual({ auto: 1, hover: 1, tiny: 1 });
    // R has been pressed: the player's own direction stands, for all three
    expect(faces(w, 10, 19, false)).toEqual({ auto: 1, hover: 0, tiny: 0 });
  });

  it('keeps going when the tile ahead takes the items (a belt, the core) and in open ground', () => {
    const w = coreWorld();
    beltLine(w, 5, 19, 0, 6); // the last piece (10, 19) faces (11, 19), above the core
    beltLine(w, 12, 19, 0, 3); // a belt line right ahead of (11, 19): joined, not left for the core
    expect(faces(w, 11, 19)).toEqual({ auto: 0, hover: 0, tiny: 0 });
    const open = testWorld(content, 40, 40);
    beltLine(open, 5, 10, 0, 4);
    expect(faces(open, 9, 10)).toEqual({ auto: 0, hover: 0, tiny: 0 });
    const down = coreWorld();
    beltLine(down, 11, 14, 1, 5); // heading south, (11, 19) is the last tile before the core
    expect(faces(down, 11, 19)).toEqual({ auto: 1, hover: 1, tiny: 1 });
  });

  it('prefers the core beside the tile to a factory ahead of it, but a belt ahead stays joined', () => {
    const w = coreWorld();
    placeNow(w, 'wire-mill', 8, 18); // covers 8..9 x 18..19, the tile west of (10, 19)
    beltLine(w, 11, 19, 2, 1); // (11, 19) heads west into (10, 19)
    expect(faces(w, 10, 19)).toEqual({ auto: 1, hover: 1, tiny: 1 });
    const join = coreWorld();
    beltLine(join, 11, 19, 2, 1);
    beltLine(join, 9, 19, 2, 3); // a belt line to the west that (10, 19) feeds from behind
    expect(faces(join, 10, 19)).toEqual({ auto: 2, hover: 2, tiny: 2 });
  });
});

describe('a line that ends beside several targets turns into the best one', () => {
  it('ends in the core, not in the factory it points at', () => {
    const w = coreWorld();
    placeNow(w, 'wire-mill', 10, 18); // covers 10..11 x 18..19, just west of (12, 19) and above the core
    const ghosts = placePreview(w, conveyor, kind, { x: 12, y: 19 }, dragFrom(20, 12, false), 0, mods, true);
    expect(at(ghosts, 13, 19)!.rot).toBe(2);
    expect(lastOf(ghosts)).toMatchObject({ x: 12, y: 19, rot: 1 });
    // R pressed: the end stays as it came
    expect(lastOf(placePreview(w, conveyor, kind, { x: 12, y: 19 }, dragFrom(20, 12, false), 0, mods, false)).rot).toBe(2);
  });

  it('keeps a factory ahead when it is the only target, and a core ahead over a factory beside', () => {
    const w = coreWorld();
    placeNow(w, 'wire-mill', 8, 18); // covers 8..9 x 18..19
    const mill = placePreview(w, conveyor, kind, { x: 10, y: 17 }, dragFrom(20, 12, false), 0, mods, true);
    expect(lastOf(mill)).toMatchObject({ x: 10, y: 17, rot: 2 }); // nothing there: keeps its way
    const into = placePreview(w, conveyor, kind, { x: 10, y: 19 }, dragFrom(10, 12, true), 0, mods, true);
    expect(lastOf(into)).toMatchObject({ x: 10, y: 19, rot: 1 }); // straight into the core, the mill to its west is not better
  });
});

describe('a line through a junction', () => {
  /** An east-heading row at y = 15 with a junction at (12, 15). */
  function junctionWorld(): World {
    const w = testWorld(content, 40, 40);
    beltLine(w, 5, 15, 0, 7);
    placeNow(w, 'junction', 12, 15);
    beltLine(w, 13, 15, 0, 8);
    return w;
  }

  it('runs straight through an existing junction, which stays, and turns nothing of the line beside it', () => {
    const w = junctionWorld();
    const ghosts = placePreview(w, conveyor, kind, { x: 12, y: 20 }, dragFrom(12, 10, true), 0, mods, true);
    expect(at(ghosts, 12, 15)).toBeUndefined();
    expect(ghosts.map((g) => g.y)).toEqual([10, 11, 12, 13, 14, 16, 17, 18, 19, 20]);
    expect(ghosts.every((g) => g.x === 12 && g.rot === 1 && g.ok && g.replace === undefined && g.kind === kind)).toBe(true);
  });

  it('also goes through it from the other side and along the row', () => {
    const w = junctionWorld();
    const up = placePreview(w, conveyor, kind, { x: 12, y: 10 }, dragFrom(12, 20, true), 0, mods, true);
    expect(up.every((g) => g.rot === 3 && g.replace === undefined)).toBe(true);
    expect(at(up, 12, 15)).toBeUndefined();
    const along = placePreview(w, conveyor, kind, { x: 20, y: 15 }, dragFrom(8, 15, true), 0, mods, true);
    expect(along.filter((g) => g.replace !== undefined).every((g) => g.rot === 0)).toBe(true);
  });

  it('never turns the belts beside the junction when a rock sits in the way', () => {
    const w = junctionWorld();
    ridge(w, 12, 12);
    const ghosts = placePreview(w, conveyor, kind, { x: 12, y: 20 }, dragFrom(12, 10, true), 0, mods, true);
    for (const g of ghosts) {
      const b = w.at(g.x, g.y);
      if (b && g.kind === kind) expect([0, 2]).toContain((b.rot - g.rot) & 3);
    }
  });

  it('does not cut a belt it would have to turn at a corner: the other order is taken', () => {
    const w = testWorld(content, 40, 40);
    beltLine(w, 14, 10, 0, 5); // a row heading east through (15, 10)
    const ghosts = placePreview(w, conveyor, kind, { x: 15, y: 14 }, dragFrom(10, 10, true), 0, mods, true);
    expect(at(ghosts, 15, 10)).toBeUndefined();
    expect(ghosts.every((g) => g.replace === undefined && g.ok)).toBe(true);
    expect(lastOf(ghosts)).toMatchObject({ x: 15, y: 14 });
  });

  it('turns a belt that runs the other way only when the player drags straight over it', () => {
    const w = testWorld(content, 40, 40);
    beltLine(w, 14, 10, 2, 5); // heading west, y = 10, x 14..10... the player drags over it
    const direct = placePreview(w, conveyor, kind, { x: 18, y: 10 }, dragFrom(10, 10, true), 0, mods, true);
    expect(direct.filter((g) => g.replace !== undefined).length).toBeGreaterThan(0);
    expect(direct.every((g) => g.rot === 0 && g.ok)).toBe(true);
    // a rock forces a detour: the opposite belts are not reused for it
    const w2 = testWorld(content, 40, 40);
    beltLine(w2, 20, 10, 2, 6); // x 20..15 heading west
    ridge(w2, 14, 10);
    const around = placePreview(w2, conveyor, kind, { x: 24, y: 10 }, dragFrom(10, 10, true), 0, mods, true);
    for (const g of around) {
      const b = w2.at(g.x, g.y);
      if (b && g.kind === kind && g !== around[0] && g !== lastOf(around)) expect((b.rot - g.rot) & 3).not.toBe(2);
    }
  });

  it('never turns a belt of another line sideways, whatever is dragged', () => {
    const w = testWorld(content, 40, 40);
    beltLine(w, 20, 5, 1, 30); // a column heading south
    beltLine(w, 2, 10, 0, 17); // a row heading east, crossing it at (20, 10)
    beltLine(w, 38, 30, 2, 12); // a row heading west
    placeNow(w, 'junction', 25, 30);
    for (let y = 18; y <= 26; y++) ridge(w, 8, y);
    ridge(w, 14, 10);
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      // half the drags begin on a belt, so that lines run along, over and across the others
      const own = w.state.buildings[next(w.state.buildings.length)]!;
      const from = next(2) === 0 ? { x: own.x, y: own.y } : { x: 1 + next(38), y: 1 + next(38) };
      const to = { x: 1 + next(38), y: 1 + next(38) };
      const ghosts = placePreview(w, conveyor, kind, to, { from, xFirst: next(2) === 0 }, 0, mods, true).filter((g) => g.kind === kind);
      ghosts.forEach((g, n) => {
        const b = w.at(g.x, g.y);
        const end = n === 0 || n === ghosts.length - 1;
        // the ends too, unless the belt there leads nowhere (a loose end is extended) or it is a single tile (clicked)
        const loose = !w.at(b ? b.x + DX[b.rot]! : 0, b ? b.y + DY[b.rot]! : 0);
        if (b && g.ok && g.replace !== undefined && ghosts.length > 1 && !(end && loose)) {
          expect((b.rot - g.rot) & 1).toBe(0);
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('the ends of a line never cut another line either', () => {
  /** A column heading south at x = 20, y 5..24. */
  function columnWorld(): World {
    const w = testWorld(content, 40, 40);
    beltLine(w, 20, 5, 1, 20);
    return w;
  }

  it('a line ending on a belt that runs another way joins it from the side, with or without R', () => {
    const w = columnWorld();
    for (const auto of [true, false]) {
      const ghosts = placePreview(w, conveyor, kind, { x: 20, y: 10 }, dragFrom(10, 10, true), 0, mods, auto);
      expect(lastOf(ghosts)).toMatchObject({ x: 20, y: 10, rot: 1, ok: true, replace: w.at(20, 10)!.id });
      expect(at(ghosts, 19, 10)!.rot).toBe(0); // the piece before it feeds the column from the side
      expect(ghosts.slice(0, -1).every((g) => g.replace === undefined)).toBe(true);
    }
  });

  it('a drag that starts on such a belt leaves it as it is', () => {
    const w = columnWorld();
    for (const auto of [true, false]) {
      const ghosts = placePreview(w, conveyor, kind, { x: 30, y: 10 }, dragFrom(20, 10, true), 0, mods, auto);
      expect(ghosts[0]).toMatchObject({ x: 20, y: 10, rot: 1, ok: true, replace: w.at(20, 10)!.id });
      expect(ghosts[1]).toMatchObject({ x: 21, y: 10, rot: 0 });
    }
  });

  it('turns a loose end instead: that is how a line is extended round a corner', () => {
    const w = columnWorld(); // its last piece (20, 24) faces (20, 25), nothing there
    const start = placePreview(w, conveyor, kind, { x: 30, y: 24 }, dragFrom(20, 24, true), 0, mods, true);
    expect(start[0]).toMatchObject({ x: 20, y: 24, rot: 0, replace: w.at(20, 24)!.id });
    const end = placePreview(w, conveyor, kind, { x: 20, y: 24 }, dragFrom(10, 24, true), 0, mods, false);
    expect(lastOf(end)).toMatchObject({ x: 20, y: 24, rot: 0, replace: w.at(20, 24)!.id });
  });

  it('still turns a belt that runs head-on, and one clicked on its own', () => {
    const w = columnWorld();
    const along = placePreview(w, conveyor, kind, { x: 20, y: 5 }, dragFrom(20, 15, true), 0, mods, true);
    expect(along.every((g) => g.rot === 3 && g.replace !== undefined)).toBe(true);
    // the belt tool turned by R, then a click on a belt in the middle of a line: that is how one belt is turned
    const click = placePreview(w, conveyor, kind, { x: 20, y: 10 }, dragFrom(20, 10, true), 0, mods, false);
    expect(click[0]).toMatchObject({ x: 20, y: 10, rot: 0, replace: w.at(20, 10)!.id });
    expect(placePreview(w, conveyor, kind, { x: 20, y: 10 }, null, 0, mods, false)[0]!.rot).toBe(0);
  });

  it('keeps pipes of another line as they are too', () => {
    const w = testWorld(content, 40, 40);
    for (let y = 5; y < 25; y++) placeNow(w, 'conduit', 20, y, 1);
    const conduit = content.buildings.get('conduit');
    const kindC = content.buildings.indexOf('conduit');
    const ghosts = placePreview(w, conduit, kindC, { x: 20, y: 10 }, dragFrom(10, 10, true), 0, mods, false);
    expect(lastOf(ghosts)).toMatchObject({ x: 20, y: 10, rot: 1, ok: true });
  });
});

describe('dragging bridges', () => {
  const bridge = content.buildings.get('bridge-conveyor');
  const bridgeKind = content.buildings.indexOf('bridge-conveyor');

  it('sets them at most a reach apart, from the start to the end, facing along the line', () => {
    const w = testWorld(content, 40, 40);
    const ghosts = placePreview(w, bridge, bridgeKind, { x: 17, y: 10 }, dragFrom(5, 10, true), 0, mods, true);
    expect(ghosts.map((g) => g.x)).toEqual([5, 9, 13, 17]);
    expect(ghosts.every((g) => g.y === 10 && g.rot === 0 && g.ok)).toBe(true);
    const north = placePreview(w, bridge, bridgeKind, { x: 5, y: 3 }, dragFrom(5, 10, false), 0, mods, true);
    expect(north.map((g) => g.y)).toEqual([10, 6, 3]);
    expect(north.every((g) => g.rot === 3)).toBe(true);
  });

  it('jumps a rock: no bridge where one cannot stand, the next one as far as it reaches', () => {
    const w = testWorld(content, 40, 40);
    ridge(w, 9, 10);
    ridge(w, 10, 10);
    const ghosts = placePreview(w, bridge, bridgeKind, { x: 17, y: 10 }, dragFrom(5, 10, true), 0, mods, true);
    expect(ghosts.map((g) => g.x)).toEqual([5, 8, 12, 16, 17]);
  });

  it('ends the run with a red bridge where a gap is wider than the range, and places nothing beyond it', () => {
    const w = testWorld(content, 40, 40);
    for (let x = 6; x <= 12; x++) ridge(w, x, 10);
    const ghosts = placePreview(w, bridge, bridgeKind, { x: 17, y: 10 }, dragFrom(5, 10, true), 0, mods, true);
    expect(ghosts.map((g) => [g.x, g.ok])).toEqual([[5, true], [13, false]]);
    // a gap the range just spans is fine
    const w2 = testWorld(content, 40, 40);
    for (let x = 6; x <= 8; x++) ridge(w2, x, 10);
    const fine = placePreview(w2, bridge, bridgeKind, { x: 17, y: 10 }, dragFrom(5, 10, true), 0, mods, true);
    expect(fine.map((g) => g.x)).toEqual([5, 9, 13, 17]);
    expect(fine.every((g) => g.ok)).toBe(true);
  });

  it('puts one at each end of a short drag and one for a click', () => {
    const w = testWorld(content, 40, 40);
    expect(placePreview(w, bridge, bridgeKind, { x: 7, y: 10 }, dragFrom(5, 10, true), 0, mods, true).map((g) => g.x)).toEqual([5, 7]);
    expect(placePreview(w, bridge, bridgeKind, { x: 5, y: 10 }, dragFrom(5, 10, true), 2, mods, true)).toHaveLength(1);
  });

  it('links up when built: every bridge sends to the next', () => {
    const w = testWorld(content, 40, 40);
    const ghosts = placePreview(w, bridge, bridgeKind, { x: 21, y: 10 }, dragFrom(5, 10, true), 0, mods, true);
    const built = ghosts.map((g) => placeNow(w, 'bridge-conveyor', g.x, g.y, g.rot));
    built.slice(0, -1).forEach((b, i) => expect(b.link).toBe(built[i + 1]!.id));
    expect(built[built.length - 1]!.link).toBe(-1);
  });

  it('does the same for conduit bridges and keeps conduits and belts as lines', () => {
    const w = testWorld(content, 40, 40);
    const cb = content.buildings.get('conduit-bridge');
    const ghosts = placePreview(w, cb, content.buildings.indexOf('conduit-bridge'), { x: 5, y: 20 }, dragFrom(5, 10, false), 0, mods, true);
    expect(ghosts.map((g) => g.y)).toEqual([10, 14, 18, 20]);
    expect(placePreview(w, conveyor, kind, { x: 5, y: 20 }, dragFrom(5, 10, false), 0, mods, true)).toHaveLength(11);
  });
});

describe('pipes cross each other with a conduit junction', () => {
  it('lays one where a pipe line runs straight across another pipe', () => {
    const w = testWorld(content, 40, 40);
    for (let y = 5; y < 15; y++) placeNow(w, 'conduit', 10, y, 1);
    const conduit = content.buildings.get('conduit');
    const ghosts = placePreview(w, conduit, content.buildings.indexOf('conduit'), { x: 14, y: 10 }, dragFrom(6, 10, true), 0, mods, true);
    expect(ghosts.find((g) => g.x === 10)?.kind).toBe(content.buildings.indexOf('conduit-junction'));
  });
});
