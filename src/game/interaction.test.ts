import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { gridToWorld, setViewMode } from '../render/iso';
import { placeNow } from '../sim/dev';
import { createRun } from '../sim/newgame';
import { Game } from './game';
import { Interaction } from './interaction';
import { probes, secondarySink } from './tools/sink';

/** A run with the core, a rich stock, and the interaction on top; helper to let the drone work. */
function setup() {
  const world = createRun(content, { seed: 7 });
  world.state.stock.fill(500);
  const game = new Game(content, world, 1);
  const ia = new Interaction(game);
  const run = (seconds: number): void => {
    for (let i = 0; i < seconds * 20; i++) game.frame(50, i * 50);
  };
  return { world, game, ia, run, core: world.core! };
}

describe('placing', () => {
  it('a drag with the belt tool lays a line that turns on its own and builds it', () => {
    const { world, ia, run, core } = setup();
    ia.startPlacing('conveyor');
    const y = core.y - 6;
    ia.dragStart(core.x, y);
    ia.hoverAt(core.x + 5, y);
    ia.hoverAt(core.x + 5, y + 3);
    expect(ia.preview().length).toBe(9);
    ia.dragEnd(core.x + 5, y + 3);
    run(0.1);
    expect(world.state.plans.length + world.state.buildings.length).toBeGreaterThanOrEqual(9);
    run(30);
    expect(world.at(core.x, y)?.rot).toBe(0);
    expect(world.at(core.x + 5, y + 3)?.rot).toBe(1);
    expect(ia.getView().undo).toBe(1);
  });

  it('undo takes the whole line back, redo puts it again, and the materials return', () => {
    const { world, ia, run, core } = setup();
    ia.startPlacing('conveyor');
    const y = core.y - 6;
    ia.dragStart(core.x, y);
    ia.dragEnd(core.x + 4, y);
    run(30);
    const placed = world.state.buildings.filter((b) => world.def(b).id === 'conveyor').length;
    expect(placed).toBe(5);
    ia.undo();
    run(30);
    expect(world.state.buildings.filter((b) => world.def(b).id === 'conveyor').length).toBe(0);
    ia.redo();
    run(30);
    expect(world.state.buildings.filter((b) => world.def(b).id === 'conveyor').length).toBe(5);
  });

  it('dragging a belt over existing belts of the same kind only turns them', () => {
    const { world, ia, run, core } = setup();
    ia.startPlacing('conveyor');
    const y = core.y - 6;
    ia.dragStart(core.x, y);
    ia.dragEnd(core.x + 3, y);
    run(20);
    ia.rotate(2);
    ia.dragStart(core.x, y);
    ia.hoverAt(core.x + 3, y);
    const turned = ia.preview();
    expect(turned.every((g) => g.replace !== undefined && g.ok)).toBe(true);
    ia.dragEnd(core.x + 3, y);
    run(5);
    expect(world.at(core.x + 1, y)?.rot).toBe(0);
    expect(world.state.plans.length).toBe(0);
  });

  it('Shift fills a rectangle with copies of a big building and the preview is cached between moves', () => {
    const { ia, core } = setup();
    ia.startPlacing('container');
    ia.setModifiers(true, false);
    ia.dragStart(core.x + 6, core.y - 12);
    ia.hoverAt(core.x + 11, core.y - 9);
    const size = content.buildings.get('container').size;
    expect(ia.preview().length).toBe(Math.floor(6 / size) * Math.floor(4 / size));
    expect(ia.preview()).toBe(ia.preview());
  });

  it('without keeping the tool it drops after one placement unless Shift is held', async () => {
    const { toolSettings } = await import('./tools/settings');
    toolSettings.set('keepTool', false);
    const { ia, core } = setup();
    ia.startPlacing('conveyor');
    ia.tap(core.x, core.y - 6);
    expect(ia.getView().mode.kind).toBe('none');
    ia.startPlacing('conveyor');
    ia.setModifiers(true, false);
    ia.tap(core.x, core.y - 7);
    expect(ia.getView().mode.kind).toBe('place');
    toolSettings.set('keepTool', true);
  });
});

describe('demolishing and clearing', () => {
  it('a demolish rectangle takes everything in it and gives the materials back', () => {
    const { world, ia, run, core } = setup();
    ia.startPlacing('conveyor');
    const y = core.y - 6;
    ia.dragStart(core.x, y);
    ia.dragEnd(core.x + 5, y);
    run(30);
    const before = world.state.stock[content.materials.indexOf('copper-ore')]!;
    ia.startRemoving();
    ia.dragStart(core.x - 1, y - 1);
    ia.hoverAt(core.x + 6, y + 1);
    expect(ia.removeRect()).toEqual({ x0: core.x - 1, y0: y - 1, x1: core.x + 6, y1: y + 1 });
    ia.dragEnd(core.x + 6, y + 1);
    run(30);
    expect(world.state.buildings.filter((b) => world.def(b).id === 'conveyor').length).toBe(0);
    expect(world.state.stock[content.materials.indexOf('copper-ore')]!).toBeGreaterThan(before);
    ia.undo();
    run(30);
    expect(world.state.buildings.filter((b) => world.def(b).id === 'conveyor').length).toBe(6);
  });

  it('never demolishes the core', () => {
    const { world, ia, run, core } = setup();
    ia.startRemoving();
    ia.tap(core.x + 1, core.y + 1);
    run(5);
    expect(world.core).toBeDefined();
  });

  it('Delete demolishes the building under the cursor, else clears the boulder, else the decoration', () => {
    const { world, ia, run, core } = setup();
    const { map } = world.state;
    const spot = { x: core.x - 8, y: core.y - 8 };
    map.boulder[spot.y * map.w + spot.x] = 1;
    ia.hoverAt(spot.x, spot.y);
    ia.demolishAtCursor();
    run(1);
    expect(map.boulder[spot.y * map.w + spot.x]).toBe(0);
    ia.demolishAtCursor();
    run(1);
    expect(world.state.deco.removed).toContain(spot.y * map.w + spot.x);
  });

  it('right click and right drag with no tool clear boulders; with a tool they are left alone', () => {
    const { world, ia, run, core } = setup();
    const { map } = world.state;
    const at = (x: number, y: number) => y * map.w + x;
    const x0 = core.x - 10;
    const y0 = core.y - 10;
    for (let i = 0; i < 4; i++) map.boulder[at(x0 + i, y0)] = 1;
    const sink = secondarySink.current!;
    expect(sink.dragStart(x0, y0)).toBe(true);
    sink.drag(x0 + 3, y0);
    sink.dragEnd(x0 + 3, y0);
    run(1);
    expect([0, 1, 2, 3].map((i) => map.boulder[at(x0 + i, y0)])).toEqual([0, 0, 0, 0]);
    ia.startPlacing('conveyor');
    expect(sink.tap(x0, y0)).toBe(false);
    expect(sink.dragStart(x0, y0)).toBe(false);
  });
});

describe('blueprints', () => {
  it('copies an area, pastes it turned, and undo removes the paste', () => {
    const { world, ia, run, core } = setup();
    ia.startPlacing('conveyor');
    const y = core.y - 6;
    ia.dragStart(core.x, y);
    ia.dragEnd(core.x + 3, y);
    run(20);
    ia.startSelecting();
    ia.dragStart(core.x - 1, y - 1);
    ia.hoverAt(core.x + 4, y + 1);
    ia.dragEnd(core.x + 4, y + 1);
    expect(ia.getView().mode.kind).toBe('paste');
    expect(ia.getView().clip?.count).toBe(4);
    ia.rotate(1);
    ia.tap(core.x + 10, y - 6);
    run(20);
    const belts = world.state.buildings.filter((b) => world.def(b).id === 'conveyor');
    expect(belts.length).toBe(8);
    expect(belts.filter((b) => b.rot === 1).length).toBe(4);
    ia.undo();
    run(20);
    expect(world.state.buildings.filter((b) => world.def(b).id === 'conveyor').length).toBe(4);
  });

  it('Q picks the building under the cursor with its rotation', () => {
    const { ia, run, core } = setup();
    ia.startPlacing('conveyor');
    ia.rotate(1);
    ia.tap(core.x, core.y - 6);
    run(20);
    ia.cancel();
    ia.hoverAt(core.x, core.y - 6);
    const picked: string[] = [];
    ia.onPick((id) => picked.push(id));
    ia.pipette();
    expect(ia.getView().mode).toEqual({ kind: 'place', building: 'conveyor' });
    expect(ia.getView().rot).toBe(1);
    expect(picked).toEqual(['conveyor']);
  });

  it('Q on a configured building carries its recipe to the copies placed next (and not to other kinds)', () => {
    const { world, ia, run, core } = setup();
    const src = placeNow(world, 'smelter', core.x + 5, core.y - 7, 0, 2); // tin
    ia.hoverAt(src.x, src.y);
    ia.pipette();
    expect(ia.getView().mode).toEqual({ kind: 'place', building: 'smelter' });
    ia.tap(core.x - 7, core.y - 7);
    run(30);
    const copy = world.at(core.x - 7, core.y - 7);
    expect(copy && world.def(copy).id).toBe('smelter');
    expect(copy?.config).toBe(2);
    // a fresh tool from the palette starts with no setting
    ia.startPlacing('smelter');
    ia.tap(core.x - 7, core.y - 11);
    run(30);
    expect(world.at(core.x - 7, core.y - 11)?.config).toBe(-1);
  });

  it('R with no tool turns the finished belt under the cursor and undo turns it back', () => {
    const { world, ia, run, core } = setup();
    ia.startPlacing('conveyor');
    ia.tap(core.x, core.y - 6);
    run(20);
    ia.cancel();
    ia.hoverAt(core.x, core.y - 6);
    ia.rotate(1);
    run(2);
    expect(world.at(core.x, core.y - 6)?.rot).toBe(1);
    ia.undo();
    run(2);
    expect(world.at(core.x, core.y - 6)?.rot).toBe(0);
  });
});

/** Decoration pieces stand where the test says (the deco layer installs these probes in the game). */
function withDeco(...tiles: { x: number; y: number }[]) {
  const here = (x: number, y: number): boolean => tiles.some((t) => t.x === x && t.y === y);
  const taps: { x: number; y: number }[] = [];
  probes.decoAt = here;
  probes.decoTap = (x, y) => taps.push({ x, y });
  return { taps };
}

describe('decoration pieces', () => {
  afterEach(() => {
    delete probes.decoAt;
    delete probes.decoTap;
  });

  const idx = (world: ReturnType<typeof setup>['world'], x: number, y: number): number => y * world.state.map.w + x;

  it('a plain click selects the piece under the pointer and runs the easter-egg hook', () => {
    const { ia, core } = setup();
    const spot = { x: core.x - 8, y: core.y - 8 };
    const { taps } = withDeco(spot);
    ia.tap(spot.x, spot.y);
    expect(ia.selectedDeco).toEqual(spot);
    expect(ia.getView().decoSelected).toEqual(spot);
    expect(ia.getView().selected).toBe(-1);
    expect(taps).toEqual([spot]);
    ia.tap(spot.x + 1, spot.y);
    expect(ia.selectedDeco).toBeNull();
    expect(taps.length).toBe(1);
  });

  it('a building keeps the click on its own tile; Escape lets the piece go', () => {
    const { ia, core } = setup();
    const spot = { x: core.x - 8, y: core.y - 8 };
    withDeco(spot, { x: core.x, y: core.y });
    ia.tap(spot.x, spot.y);
    ia.tap(core.x, core.y);
    expect(ia.selectedDeco).toBeNull();
    expect(ia.getView().selected).toBe(core.id);
    ia.tap(spot.x, spot.y);
    expect(ia.selectedDeco).toEqual(spot);
    ia.cancel();
    expect(ia.selectedDeco).toBeNull();
  });

  it('with a tool in hand a click does not select a piece', () => {
    const { ia, core } = setup();
    const spot = { x: core.x - 8, y: core.y - 8 };
    const { taps } = withDeco(spot);
    ia.startPlacing('conveyor');
    ia.tap(spot.x, spot.y);
    expect(ia.selectedDeco).toBeNull();
    expect(taps).toEqual([]);
  });

  it('Backspace / Delete removes the piece under the pointer and leaves the others', () => {
    const { world, ia, run, core } = setup();
    const a = { x: core.x - 8, y: core.y - 8 };
    const b = { x: core.x + 8, y: core.y - 8 };
    withDeco(a, b);
    ia.tap(a.x, a.y);
    ia.hoverAt(a.x, a.y);
    ia.demolishAtCursor();
    run(1);
    expect(world.state.deco.removed).toEqual([idx(world, a.x, a.y)]);
    expect(ia.selectedDeco).toBeNull();
    expect(ia.getView().decoSelected).toBeNull();
  });

  it('with the pointer over nothing, Backspace removes the piece that was clicked; over a boulder it clears that first', () => {
    const { world, ia, run, core } = setup();
    const piece = { x: core.x - 8, y: core.y - 8 };
    const rock = { x: core.x - 9, y: core.y - 9 };
    withDeco(piece);
    world.state.map.boulder[idx(world, rock.x, rock.y)] = 1;
    ia.tap(piece.x, piece.y);
    ia.hoverAt(rock.x, rock.y);
    ia.demolishAtCursor();
    run(1);
    expect(world.state.map.boulder[idx(world, rock.x, rock.y)]).toBe(0);
    expect(world.state.deco.removed).toEqual([]);
    expect(ia.selectedDeco).toEqual(piece);
    ia.hoverAt(piece.x + 3, piece.y);
    ia.demolishAtCursor();
    run(1);
    expect(world.state.deco.removed).toEqual([idx(world, piece.x, piece.y)]);
    expect(ia.selectedDeco).toBeNull();
  });

  it('a right click removes the piece only where there is one, and not with a tool in hand', () => {
    const { world, ia, run, core } = setup();
    const piece = { x: core.x - 8, y: core.y - 8 };
    withDeco(piece);
    const sink = secondarySink.current!;
    expect(sink.tap(piece.x + 1, piece.y)).toBe(true);
    run(1);
    expect(world.state.deco.removed).toEqual([]);
    ia.tap(piece.x, piece.y);
    expect(sink.tap(piece.x, piece.y)).toBe(true);
    run(1);
    expect(world.state.deco.removed).toEqual([idx(world, piece.x, piece.y)]);
    expect(ia.selectedDeco).toBeNull();
    ia.startPlacing('conveyor');
    expect(sink.tap(piece.x - 2, piece.y)).toBe(false);
  });
});

describe('decoration on touch (no right button, no keyboard)', () => {
  afterEach(() => {
    delete probes.decoAt;
    delete probes.decoTap;
  });

  const idx = (world: ReturnType<typeof setup>['world'], x: number, y: number): number => y * world.state.map.w + x;

  it('a tap selects the piece and the card\'s Remove button takes exactly that piece away', () => {
    const { world, ia, run, core } = setup();
    const a = { x: core.x - 8, y: core.y - 8 };
    const b = { x: core.x + 8, y: core.y - 8 };
    withDeco(a, b);
    expect(ia.removeSelectedDeco()).toBe(false); // nothing selected yet
    ia.tap(a.x, a.y);
    expect(ia.getView().decoSelected).toEqual(a);
    expect(ia.removeSelectedDeco()).toBe(true);
    run(1);
    expect(world.state.deco.removed).toEqual([idx(world, a.x, a.y)]);
    expect(ia.getView().decoSelected).toBeNull();
    expect(ia.removeSelectedDeco()).toBe(false);
  });

  it('a long press (the sink\'s hold) removes the piece or boulder under the finger, nothing else', () => {
    const { world, run, core } = setup();
    const piece = { x: core.x - 8, y: core.y - 8 };
    const rock = { x: core.x - 9, y: core.y - 9 };
    withDeco(piece);
    world.state.map.boulder[idx(world, rock.x, rock.y)] = 1;
    const sink = secondarySink.current!;
    expect(sink.hold?.(piece.x + 2, piece.y)).toBe(false); // bare ground: nothing to take away
    expect(sink.hold?.(rock.x, rock.y)).toBe(true);
    run(1);
    expect(world.state.map.boulder[idx(world, rock.x, rock.y)]).toBe(0);
    expect(sink.hold?.(piece.x, piece.y)).toBe(true);
    run(1);
    expect(world.state.deco.removed).toEqual([idx(world, piece.x, piece.y)]);
  });

  it('a long press never demolishes a building (even with a piece under it) and does nothing with a tool in hand', () => {
    const { world, ia, run, core } = setup();
    const piece = { x: core.x - 8, y: core.y - 8 };
    withDeco(piece, { x: core.x, y: core.y });
    const sink = secondarySink.current!;
    const buildings = world.state.buildings.length;
    expect(sink.hold?.(core.x, core.y)).toBe(false);
    run(2);
    expect(world.state.buildings.length).toBe(buildings);
    expect(world.state.deco.removed).toEqual([]);
    ia.startPlacing('conveyor');
    expect(sink.hold?.(piece.x, piece.y)).toBe(false);
    run(1);
    expect(world.state.deco.removed).toEqual([]);
  });

  it('a long press also lets go of a selected piece or building', () => {
    const { ia, core } = setup();
    const piece = { x: core.x - 8, y: core.y - 8 };
    withDeco(piece);
    ia.tap(piece.x, piece.y);
    expect(ia.getView().decoSelected).toEqual(piece);
    secondarySink.current!.hold?.(piece.x, piece.y);
    expect(ia.getView().decoSelected).toBeNull();
  });
});

/** Screen-aligned drag areas (iso): the pointer sits at a tile's middle, in world px, next to its tile. */
const pt = (x: number, y: number) => gridToWorld(x + 0.5, y + 0.5);
const tilesOf = (x0: number, y0: number, n: number): { x: number; y: number }[] => Array.from({ length: n * n }, (_, i) => ({ x: x0 + (i % n), y: y0 + Math.floor(i / n) }));
const centreIn = (a: { x: number; y: number }, b: { x: number; y: number }, x: number, y: number, size = 1): boolean => {
  const c = gridToWorld(x + size / 2, y + size / 2);
  return c.x >= Math.min(a.x, b.x) && c.x <= Math.max(a.x, b.x) && c.y >= Math.min(a.y, b.y) && c.y <= Math.max(a.y, b.y);
};

describe('rectangles on the screen (iso)', () => {
  afterEach(() => setViewMode('iso'));

  /** A 9x9 field of batteries (1x1) near the core. */
  function field() {
    const s = setup();
    const x0 = s.core.x - 20;
    const y0 = s.core.y - 20;
    for (const t of tilesOf(x0, y0, 9)) placeNow(s.world, 'battery', t.x, t.y);
    return { ...s, x0, y0 };
  }

  const drag = (ia: Interaction, a: { x: number; y: number }, b: { x: number; y: number }): void => {
    ia.dragStart(a.x, a.y, pt(a.x, a.y));
    ia.hoverAt(b.x, b.y, pt(b.x, b.y));
    ia.dragEnd(b.x, b.y, pt(b.x, b.y));
  };

  it('X demolishes the buildings whose centre the screen rectangle holds, not a diamond of the grid; undo and redo follow', () => {
    const { world, ia, run, x0, y0 } = field();
    const a = { x: x0 + 1, y: y0 + 1 };
    const b = { x: x0 + 6, y: y0 + 3 };
    const inside = tilesOf(x0, y0, 9).filter((t) => centreIn(pt(a.x, a.y), pt(b.x, b.y), t.x, t.y));
    expect(inside.length).toBeGreaterThan(8);
    expect(inside.length).toBeLessThan(9 * 9);
    const box = tilesOf(x0, y0, 9).filter((t) => t.x >= a.x && t.x <= b.x && t.y >= a.y && t.y <= b.y);
    expect(inside.map((t) => `${t.x},${t.y}`).sort()).not.toEqual(box.map((t) => `${t.x},${t.y}`).sort());
    ia.startRemoving();
    ia.dragStart(a.x, a.y, pt(a.x, a.y));
    ia.hoverAt(b.x, b.y, pt(b.x, b.y));
    expect(ia.removeArea()?.rect).not.toBeNull();
    expect(ia.removeArea()?.count).toBe(inside.length);
    ia.dragEnd(b.x, b.y, pt(b.x, b.y));
    run(2);
    const marked = world.state.buildings.filter((q) => q.removing || q.build <= 0).length;
    expect(marked).toBeGreaterThan(0);
    run(600);
    const left = new Set(tilesOf(x0, y0, 9).filter((t) => world.at(t.x, t.y)).map((t) => `${t.x},${t.y}`));
    const gone = tilesOf(x0, y0, 9).filter((t) => !left.has(`${t.x},${t.y}`));
    expect(gone.map((t) => `${t.x},${t.y}`).sort()).toEqual(inside.map((t) => `${t.x},${t.y}`).sort());
    expect(ia.getView().undo).toBe(1);
    ia.undo();
    run(600);
    expect(tilesOf(x0, y0, 9).every((t) => world.at(t.x, t.y))).toBe(true);
    ia.redo();
    run(600);
    expect(tilesOf(x0, y0, 9).filter((t) => !world.at(t.x, t.y)).length).toBe(inside.length);
  }, 60_000);

  it('demolishing an irregular set returns the same materials as taking the same buildings one by one', () => {
    const one = field();
    const two = field();
    const a = { x: one.x0 + 1, y: one.y0 };
    const b = { x: one.x0 + 7, y: one.y0 + 4 };
    one.ia.startRemoving();
    drag(one.ia, a, b);
    two.ia.startRemoving();
    for (const t of tilesOf(two.x0, two.y0, 9).filter((q) => centreIn(pt(a.x, a.y), pt(b.x, b.y), q.x, q.y))) two.ia.tap(t.x, t.y);
    one.run(600);
    two.run(600);
    expect(one.world.state.stock).toEqual(two.world.state.stock);
    expect(one.world.state.buildings.length).toBe(two.world.state.buildings.length);
  }, 60_000);

  it('B copies the same irregular set as a blueprint (tight box, relative places) and pastes it as it was, undo takes it back', () => {
    const { world, ia, run, x0, y0 } = field();
    const a = { x: x0 + 2, y: y0 + 1 };
    const b = { x: x0 + 7, y: y0 + 5 };
    const inside = tilesOf(x0, y0, 9).filter((t) => centreIn(pt(a.x, a.y), pt(b.x, b.y), t.x, t.y));
    ia.startSelecting();
    drag(ia, a, b);
    expect(ia.getView().mode.kind).toBe('paste');
    const clip = ia.getView().clip!;
    const minX = Math.min(...inside.map((t) => t.x));
    const minY = Math.min(...inside.map((t) => t.y));
    expect(clip.count).toBe(inside.length);
    expect(clip.w).toBe(Math.max(...inside.map((t) => t.x)) - minX + 1);
    expect(clip.h).toBe(Math.max(...inside.map((t) => t.y)) - minY + 1);
    // paste it on free ground (the first spot around the core where every building fits): the same shape, the same count
    const spots = Array.from({ length: 80 }, (_, i) => ({ x: world.core!.x + 10 + (i % 8) * 6, y: world.core!.y - 40 + Math.floor(i / 8) * 8 }));
    const target = spots.find((p) => {
      ia.hoverAt(p.x, p.y);
      return ia.preview().every((g) => g.ok);
    })!;
    expect(target).toBeDefined();
    ia.hoverAt(target.x, target.y);
    const ghosts = ia.preview();
    expect(ghosts.length).toBe(inside.length);
    const shape = (list: { x: number; y: number }[]): string[] => {
      const mx = Math.min(...list.map((t) => t.x));
      const my = Math.min(...list.map((t) => t.y));
      return list.map((t) => `${t.x - mx},${t.y - my}`).sort();
    };
    expect(shape(ghosts)).toEqual(shape(inside));
    ia.tap(target.x, target.y);
    run(600);
    expect(world.state.buildings.filter((q) => world.def(q).id === 'battery').length).toBe(81 + inside.length);
    ia.undo();
    run(600);
    expect(world.state.buildings.filter((q) => world.def(q).id === 'battery').length).toBe(81);
  }, 60_000);

  it('turning and mirroring a blueprint of an irregular set keeps every building and fits the tight box', () => {
    const { ia, x0, y0 } = field();
    ia.startSelecting();
    drag(ia, { x: x0 + 1, y: y0 + 1 }, { x: x0 + 6, y: y0 + 3 });
    const before = ia.getView().clip!;
    ia.rotate(1);
    const turned = ia.getView().clip!;
    expect(turned.count).toBe(before.count);
    expect([turned.w, turned.h]).toEqual([before.h, before.w]);
    ia.flip();
    expect(ia.getView().clip!.count).toBe(before.count);
  });

  it('Shift fills the screen rectangle with copies whose centre it holds, and each costs as one placed', () => {
    const { world, ia, run, core } = setup();
    ia.startPlacing('container');
    ia.setModifiers(true, false);
    // the first stretch of ground around the core where at least four containers fit
    const starts = Array.from({ length: 120 }, (_, i) => ({ x: core.x + 8 + (i % 12) * 6, y: core.y - 46 + Math.floor(i / 12) * 6 }));
    const a = starts.find((p) => {
      ia.dragStart(p.x, p.y, pt(p.x, p.y));
      ia.hoverAt(p.x + 9, p.y + 7, pt(p.x + 9, p.y + 7));
      const ok = ia.preview().filter((g) => g.ok).length >= 4;
      ia.cancel();
      ia.startPlacing('container');
      ia.setModifiers(true, false);
      return ok;
    })!;
    expect(a).toBeDefined();
    const b = { x: a.x + 9, y: a.y + 7 };
    ia.dragStart(a.x, a.y, pt(a.x, a.y));
    ia.hoverAt(b.x, b.y, pt(b.x, b.y));
    const ghosts = ia.preview().filter((g) => g.ok);
    expect(ghosts.length).toBeGreaterThanOrEqual(4);
    for (const g of ghosts) expect(centreIn(pt(a.x, a.y), pt(b.x, b.y), g.x, g.y, 2)).toBe(true);
    expect(ia.fillArea()?.rect).not.toBeNull();
    const before = world.state.stock.slice();
    ia.dragEnd(b.x, b.y, pt(b.x, b.y));
    run(0.1);
    expect(world.state.plans.length + world.state.buildings.filter((q) => world.def(q).id === 'container').length).toBe(ghosts.length);
    run(900);
    expect(world.state.buildings.filter((q) => world.def(q).id === 'container').length).toBe(ghosts.length);
    const cost = world.defs[world.state.buildings.find((q) => world.def(q).id === 'container')!.kind]!.cost;
    for (const c of cost) {
      const i = world.content.materials.indexOf(c.item);
      expect(before[i]! - world.state.stock[i]!).toBe(c.n * ghosts.length);
    }
  }, 60_000);

  it('the right-drag sweep clears the boulders whose tile centre the rectangle holds', () => {
    const { world, run, core } = setup();
    const { map } = world.state;
    const x0 = core.x - 30;
    const y0 = core.y - 30;
    for (const t of tilesOf(x0, y0, 10)) map.boulder[t.y * map.w + t.x] = 1;
    const a = { x: x0 + 1, y: y0 + 1 };
    const b = { x: x0 + 7, y: y0 + 4 };
    const sink = secondarySink.current!;
    expect(sink.dragStart(a.x, a.y, pt(a.x, a.y))).toBe(true);
    sink.drag(b.x, b.y, pt(b.x, b.y));
    sink.dragEnd(b.x, b.y, pt(b.x, b.y));
    run(1);
    const cleared = tilesOf(x0, y0, 10).filter((t) => map.boulder[t.y * map.w + t.x] === 0).map((t) => `${t.x},${t.y}`).sort();
    expect(cleared).toEqual(tilesOf(x0, y0, 10).filter((t) => centreIn(pt(a.x, a.y), pt(b.x, b.y), t.x, t.y)).map((t) => `${t.x},${t.y}`).sort());
    expect(cleared.length).toBeGreaterThan(5);
  });

  it('in the top-down views the same drag is the box of tiles, as it was', () => {
    for (const view of ['steep', 'top'] as const) {
      setViewMode(view);
      const { ia, core } = setup();
      const a = { x: core.x - 12, y: core.y - 12 };
      const b = { x: core.x - 6, y: core.y - 9 };
      ia.startRemoving();
      ia.dragStart(a.x, a.y, pt(a.x, a.y));
      ia.hoverAt(b.x, b.y, pt(b.x, b.y));
      expect(ia.removeArea()?.rect).toBeNull();
      expect(ia.removeRect()).toEqual({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
      ia.cancel();
    }
  });
});

describe('right click with no tool in hand', () => {
  it('cancels the ghost and demolishes the building under the pointer (Ctrl+Z brings it back), never the core', () => {
    const { world, game, ia, run, core } = setup();
    const sink = secondarySink.current!;
    const spot = { x: core.x + 12, y: core.y - 14 };
    game.enqueue({ type: 'place', kind: 'battery', x: spot.x, y: spot.y, rot: 0 });
    game.enqueue({ type: 'place', kind: 'battery', x: spot.x + 2, y: spot.y, rot: 0 });
    run(0.1);
    expect(world.state.plans.length + world.state.buildings.filter((b) => world.def(b).id === 'battery').length).toBe(2);
    // a ghost goes with one right click
    const ghost = world.state.plans[0] ?? world.state.buildings.find((b) => world.def(b).id === 'battery' && b.build < 1)!;
    expect(sink.tap(ghost.x, ghost.y)).toBe(true);
    run(0.1);
    expect(world.state.plans.some((p) => p.x === ghost.x && p.y === ghost.y)).toBe(false);
    expect(world.at(ghost.x, ghost.y)?.removing ?? true).toBe(true);
    // a finished building is marked for removal, and the undo list has it
    run(60);
    const built = world.state.buildings.find((b) => world.def(b).id === 'battery' && b.build >= 1)!;
    expect(built).toBeDefined();
    expect(sink.tap(built.x, built.y)).toBe(true);
    run(60);
    expect(world.at(built.x, built.y)).toBeUndefined();
    ia.undo();
    run(60);
    expect(world.at(built.x, built.y)).toBeDefined();
    // the core stays, and an empty tile only returns "handled"
    expect(sink.tap(core.x + 1, core.y + 1)).toBe(true);
    run(10);
    expect(world.core).toBeDefined();
    // with a tool in hand a right click lets go of the tool instead
    ia.startPlacing('conveyor');
    expect(sink.tap(built.x, built.y)).toBe(false);
    expect(world.at(built.x, built.y)).toBeDefined();
  }, 30_000);
});
