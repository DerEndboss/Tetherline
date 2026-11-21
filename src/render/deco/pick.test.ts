import { afterEach, describe, expect, it } from 'vitest';
import type { ArtEntry } from '../art-manifest';
import { depthOf, gridToWorld, setViewMode, VIEW_MODES, worldToTile, type ViewMode } from '../iso';
import { decoAt, decoAtPoint, FALLBACK_BODY, onDecoTap, pickBox, pickDeco, registerDecoPicking, tapDeco, type BodyBox, type DecoHit, type PickItem } from './pick';

/** The sprite layer's sort key (render/sprite-pool.ts `depthKey`), without importing Pixi. */
const depth = (x: number, y: number): number => depthOf(x, y) * 8 + x * 0.001;

/** A tall rack's body as the iso manifest has it (world px around the anchor). */
const RACK: BodyBox = { x: -33.2, y: -59.6, w: 66.4, h: 75.6 };
const BOARD: BodyBox = { x: -31, y: -19.6, w: 62, h: 33.6 };

function item(x: number, y: number, body: BodyBox = RACK, kind: PickItem['kind'] = 'rack'): PickItem {
  return { x, y, kind, variant: 0, box: pickBox(x, y, body) };
}

const top = (it: PickItem, dy = 3): { x: number; y: number } => ({ x: (it.box.left + it.box.right) / 2, y: it.box.top + dy });

afterEach(() => setViewMode('iso'));

describe.each(VIEW_MODES)('picking decoration in the %s view', (view: ViewMode) => {
  it('hits a piece on its whole body, and nothing beside it', () => {
    setViewMode(view);
    const rack = item(20, 20);
    const at = (p: { x: number; y: number }): PickItem | null => pickDeco([rack], p.x, p.y, depth);
    const mid = { x: (rack.box.left + rack.box.right) / 2, y: (rack.box.top + rack.box.bottom) / 2 };
    expect(at(mid)).toBe(rack);
    expect(at(top(rack))).toBe(rack);
    expect(at({ x: rack.box.left + 1, y: rack.box.bottom - 1 })).toBe(rack);
    expect(at({ x: rack.box.left - 6, y: mid.y })).toBeNull();
    expect(at({ x: mid.x, y: rack.box.top - 6 })).toBeNull();
    expect(at({ x: mid.x, y: rack.box.bottom + 6 })).toBeNull();
  });

  it('every tile of the world resolves to the piece standing on it (the ground tile under its anchor)', () => {
    setViewMode(view);
    const pieces = [item(12, 9, BOARD, 'board'), item(30, 31), item(31, 8, BOARD, 'chip')];
    for (const p of pieces) {
      const c = gridToWorld(p.x + 0.5, p.y + 0.5);
      expect(pickDeco(pieces, c.x, c.y, depth)).toBe(p);
      expect(worldToTile(c.x, c.y)).toEqual({ x: p.x, y: p.y });
    }
  });

  it('a tall piece is also hit where its ground tile is not the one under the pointer', () => {
    setViewMode(view);
    const rack = item(20, 20);
    const high = top(rack, 4);
    const under = worldToTile(high.x, high.y);
    expect(pickDeco([rack], high.x, high.y, depth)).toBe(rack);
    // the old way (the ground tile under the pointer) misses the rack in the views that look at it from the side
    if (view !== 'top') expect(under).not.toEqual({ x: 20, y: 20 });
  });

  it('of two overlapping pieces the one nearer the viewer wins', () => {
    setViewMode(view);
    const tall: BodyBox = { x: -33, y: -120, w: 66, h: 140 };
    const back = item(20, 20, tall);
    // one tile nearer: straight down the screen in the top-down views, a diagonal step down in iso
    const front = view === 'iso' ? item(21, 21, tall) : item(20, 21, tall);
    expect(depth(front.x, front.y)).toBeGreaterThan(depth(back.x, back.y));
    const both = { x: (back.box.left + back.box.right) / 2, y: (front.box.top + back.box.bottom) / 2 };
    expect(back.box.bottom).toBeGreaterThan(front.box.top);
    expect(pickDeco([back, front], both.x, both.y, depth)).toBe(front);
    expect(pickDeco([front, back], both.x, both.y, depth)).toBe(front);
    // the point only the back one covers
    const only = top(back);
    expect(pickDeco([front, back], only.x, only.y, depth)).toBe(back);
  });

  it('a solid object in front keeps the click, one behind does not', () => {
    setViewMode(view);
    const rack = item(20, 20);
    const p = top(rack);
    const d = depth(20, 20);
    expect(pickDeco([rack], p.x, p.y, depth, 0, undefined, (at) => at < d + 1)).toBeNull();
    expect(pickDeco([rack], p.x, p.y, depth, 0, undefined, (at) => at > d + 1)).toBe(rack);
  });

  it('skips pieces that shrink out, and a pad makes a small piece easier to catch', () => {
    setViewMode(view);
    const board = item(20, 20, BOARD, 'board');
    const edge = { x: board.box.right + 4, y: (board.box.top + board.box.bottom) / 2 };
    expect(pickDeco([board], edge.x, edge.y, depth)).toBeNull();
    expect(pickDeco([board], edge.x, edge.y, depth, 5)).toBe(board);
    const mid = { x: (board.box.left + board.box.right) / 2, y: (board.box.top + board.box.bottom) / 2 };
    expect(pickDeco([board], mid.x, mid.y, depth, 0, () => true)).toBeNull();
  });

  it('puts the box where the sprite is drawn: at the tile centre, shifted by the body', () => {
    setViewMode(view);
    const c = gridToWorld(5.5, 8.5);
    const b = pickBox(5, 8, RACK);
    expect(b.left).toBeCloseTo(c.x + RACK.x);
    expect(b.right).toBeCloseTo(c.x + RACK.x + RACK.w);
    expect(b.top).toBeCloseTo(c.y + RACK.y);
    expect(b.bottom).toBeCloseTo(c.y + RACK.y + RACK.h);
  });
});

/** The deco art's body boxes (iso, steep and top sets) lie inside their sprite images, so a hit is a hit on what is drawn. */
describe('the hit boxes match the art', () => {
  const sets = import.meta.glob<{ sprites: Record<string, ArtEntry> }>('../../../public/art/deco/{,steep/,top/}manifest.json', { eager: true, import: 'default' });

  it('finds the three manifests', () => {
    expect(Object.keys(sets).length).toBe(3);
  });

  it('every sprite has a body box inside its image and no bigger than a tile and a half across', () => {
    for (const [file, m] of Object.entries(sets)) {
      for (const [id, e] of Object.entries(m.sprites)) {
        const where = `${file} ${id}`;
        const b = e.body ?? FALLBACK_BODY;
        expect(e.body, `${where} has a body`).toBeDefined();
        expect(b.x, where).toBeGreaterThanOrEqual(-e.w * e.ax - 1);
        expect(b.y, where).toBeGreaterThanOrEqual(-e.h * e.ay - 1);
        expect(b.x + b.w, where).toBeLessThanOrEqual(e.w * (1 - e.ax) + 1);
        expect(b.y + b.h, where).toBeLessThanOrEqual(e.h * (1 - e.ay) + 1);
        expect(b.w, where).toBeLessThan(96 * 1.5);
        expect(b.w * b.h, where).toBeGreaterThan(100);
      }
    }
  });
});

describe('the registry', () => {
  const rack: DecoHit = { x: 4, y: 5, kind: 'rack', variant: 0, name: 'Server rack' };

  it('answers tiles and points through the registered layer, and tells the easter-egg handlers on a tap', () => {
    registerDecoPicking({ at: (x, y) => (x === 4 && y === 5 ? rack : null), atPoint: (wx) => (wx > 0 ? rack : null) });
    expect(decoAt(4, 5)).toBe(rack);
    expect(decoAt(5, 5)).toBeNull();
    expect(decoAtPoint(1, 0)).toBe(rack);
    expect(decoAtPoint(-1, 0)).toBeNull();
    const seen: DecoHit[] = [];
    const off = onDecoTap((h) => seen.push(h));
    expect(tapDeco(4, 5)).toBe(rack);
    expect(tapDeco(0, 0)).toBeNull();
    expect(seen).toEqual([rack]);
    off();
    tapDeco(4, 5);
    expect(seen.length).toBe(1);
    registerDecoPicking({ at: () => null, atPoint: () => null });
  });
});
