import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../../content';
import { Camera } from '../../render/camera';
import { gridToWorld, setViewMode, VIEW_MODES, type ViewMode } from '../../render/iso';
import { fillRegion } from './geometry';
import { Region, rowRuns, tilesInRect, type WorldPt } from './region';

const W = 80;
const H = 80;

/** The world point of a tile's centre: where a pointer sits when it points at that tile's middle. */
const at = (x: number, y: number): WorldPt => gridToWorld(x + 0.5, y + 0.5);

const key = (t: { x: number; y: number }): string => `${t.x},${t.y}`;

/** Every tile of the map whose centre lies in the rectangle between two world points (brute force). */
function brute(a: WorldPt, b: WorldPt): string[] {
  const out: string[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = at(x, y);
      if (c.x >= Math.min(a.x, b.x) && c.x <= Math.max(a.x, b.x) && c.y >= Math.min(a.y, b.y) && c.y <= Math.max(a.y, b.y)) out.push(`${x},${y}`);
    }
  }
  return out.sort();
}

afterEach(() => setViewMode('iso'));

describe('a drag area on the screen, in the iso view', () => {
  const from = { x: 20, y: 20 };
  const to = { x: 29, y: 26 };

  it('is a rectangle on the screen: exactly the tiles whose centre it holds, not a diamond of the grid', () => {
    setViewMode('iso');
    const a = at(from.x, from.y);
    const b = at(to.x, to.y);
    const region = Region.ofDrag(from, a, to, b, W, H);
    expect(region.rect).toEqual({ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) });
    expect(region.tiles().map(key).sort()).toEqual(brute(a, b));
    expect(region.count).toBe(brute(a, b).length);
    // the grid box between the two tiles would have 10 x 7 = 70 tiles; the screen rectangle holds a different set
    const gridBox = new Set(Region.ofBox({ x0: from.x, y0: from.y, x1: to.x, y1: to.y }).tiles().map(key));
    expect(region.tiles().some((t) => !gridBox.has(key(t)))).toBe(true);
    expect(region.tiles().length).not.toBe(gridBox.size);
    // every captured tile projects inside the rectangle, every tile just outside it does not
    for (const t of region.tiles()) expect(region.has(t.x, t.y)).toBe(true);
    for (const t of [{ x: 19, y: 19 }, { x: 40, y: 40 }, { x: 0, y: 0 }]) expect(region.has(t.x, t.y)).toBe(false);
  });

  it('is the same whichever corner it is dragged from', () => {
    setViewMode('iso');
    const a = at(from.x, from.y);
    const b = at(to.x, to.y);
    const forward = Region.ofDrag(from, a, to, b, W, H);
    const backward = Region.ofDrag(to, b, from, a, W, H);
    const crossed = Region.ofDrag({ x: to.x, y: from.y }, at(to.x, from.y), { x: from.x, y: to.y }, at(from.x, to.y), W, H);
    expect(backward.tiles().map(key).sort()).toEqual(forward.tiles().map(key).sort());
    expect(crossed.rect).not.toBeNull();
    expect(crossed.count).toBeGreaterThan(0);
  });

  it('takes a building when its footprint centre is inside, wherever its corners are', () => {
    setViewMode('iso');
    const region = Region.ofDrag(from, at(from.x, from.y), to, at(to.x, to.y), W, H);
    const rect = region.rect!;
    for (const [x, y, size] of [[22, 22, 2], [24, 20, 3], [20, 24, 1], [45, 45, 2], [10, 10, 4], [27, 26, 5]] as const) {
      const c = gridToWorld(x + size / 2, y + size / 2);
      expect(region.hasFootprint(x, y, size), `${size}x${size} at ${x},${y}`).toBe(c.x >= rect.left && c.x <= rect.right && c.y >= rect.top && c.y <= rect.bottom);
    }
  });

  it('a drag too small to hold a tile centre takes the tile it began on, and a building that stands on it', () => {
    setViewMode('iso');
    const p = at(30, 30);
    const q = { x: p.x + 10, y: p.y + 6 };
    const region = Region.ofDrag({ x: 30, y: 30 }, { x: p.x + 3, y: p.y + 20 }, { x: 30, y: 30 }, q, W, H);
    expect(region.tiles()).toEqual([{ x: 30, y: 30 }]);
    expect(region.has(30, 30)).toBe(true);
    expect(region.has(31, 30)).toBe(false);
    expect(region.hasFootprint(29, 29, 2)).toBe(true);
    expect(region.hasFootprint(31, 31, 2)).toBe(false);
  });

  it('stays on the map and refuses an area bigger than a drag may cover', () => {
    setViewMode('iso');
    const clipped = Region.ofDrag({ x: 0, y: 0 }, { x: -9000, y: -9000 }, { x: 5, y: 5 }, at(5, 5), W, H);
    expect(clipped.tiles().every((t) => t.x >= 0 && t.y >= 0 && t.x < W && t.y < H)).toBe(true);
    const huge = Region.ofDrag({ x: 0, y: 0 }, { x: -40000, y: -1000 }, { x: 70, y: 70 }, { x: 40000, y: 40000 }, 400, 400);
    expect(huge.tooBig).toBe(true);
    expect(huge.tiles()).toEqual([]);
    expect(tilesInRect({ left: -40000, top: -1000, right: 40000, bottom: 40000 }, 400, 400)).toBeNull();
  });

  it('works through the camera, with a panel covering part of the screen (its view offset)', () => {
    setViewMode('iso');
    const cam = new Camera();
    cam.resize(1440, 900);
    cam.setZoom(1.3);
    cam.lookAt(at(24, 24).x, at(24, 24).y);
    cam.setOffset(-260, 90);
    const a = cam.worldToScreen(at(from.x, from.y).x, at(from.x, from.y).y);
    const b = cam.worldToScreen(at(to.x, to.y).x, at(to.x, to.y).y);
    // what the renderer does: screen point -> camera.screenToWorld -> the drag
    const viaCamera = Region.ofDrag(from, cam.screenToWorld(a.x, a.y), to, cam.screenToWorld(b.x, b.y), W, H);
    expect(viaCamera.tiles().map(key).sort()).toEqual(Region.ofDrag(from, at(from.x, from.y), to, at(to.x, to.y), W, H).tiles().map(key).sort());
    // rebuilding the point by hand from the camera centre and half the view drifts by the offset, which the real path must not
    const byHand = (sx: number, sy: number): WorldPt => ({ x: cam.x + (sx - cam.viewW / 2) / cam.zoom, y: cam.y + (sy - cam.viewH / 2) / cam.zoom });
    const drifted = Region.ofDrag(from, byHand(a.x, a.y), to, byHand(b.x, b.y), W, H);
    expect(drifted.tiles().map(key).sort()).not.toEqual(viaCamera.tiles().map(key).sort());
  });
});

describe.each<ViewMode>(['steep', 'top'])('a drag area in the %s view', (view) => {
  it('is the box of tiles between the first and the last tile, as before (the grid is axis-aligned on the screen)', () => {
    setViewMode(view);
    const from = { x: 20, y: 20 };
    const to = { x: 29, y: 26 };
    const region = Region.ofDrag(from, at(from.x, from.y), to, at(to.x, to.y), W, H);
    expect(region.rect).toBeNull();
    expect(region.box).toEqual({ x0: 20, y0: 20, x1: 29, y1: 26 });
    expect(region.count).toBe(70);
    expect(region.tiles().length).toBe(70);
    expect(region.tiles().map(key).sort()).toEqual(Region.ofBox({ x0: 20, y0: 20, x1: 29, y1: 26 }).tiles().map(key).sort());
    // dragging up and to the left gives the same box
    expect(Region.ofDrag(to, at(to.x, to.y), from, at(from.x, from.y), W, H).box).toEqual(region.box);
    // a screen rectangle between the two tile centres is exactly that box on screen
    const a = at(from.x, from.y);
    const b = at(to.x, to.y);
    for (const t of region.tiles()) {
      const c = at(t.x, t.y);
      expect(c.x >= Math.min(a.x, b.x) - 1e-9 && c.x <= Math.max(a.x, b.x) + 1e-9 && c.y >= Math.min(a.y, b.y) - 1e-9 && c.y <= Math.max(a.y, b.y) + 1e-9).toBe(true);
    }
  });

  it('covers a footprint it overlaps, like the old box', () => {
    setViewMode(view);
    const region = Region.ofDrag({ x: 20, y: 20 }, at(20, 20), { x: 24, y: 24 }, at(24, 24), W, H);
    expect(region.hasFootprint(24, 24, 3)).toBe(true);
    expect(region.hasFootprint(18, 18, 2)).toBe(false);
    expect(region.hasFootprint(18, 18, 3)).toBe(true);
  });
});

describe.each(VIEW_MODES)('a drag with tiles only (%s)', (view) => {
  it('is the box of tiles in every view', () => {
    setViewMode(view);
    const region = Region.ofDrag({ x: 5, y: 9 }, null, { x: 2, y: 4 }, null, W, H);
    expect(region.rect).toBeNull();
    expect(region.box).toEqual({ x0: 2, y0: 4, x1: 5, y1: 9 });
  });
});

describe('fillRegion and rowRuns', () => {
  it('fills a screen rectangle with copies whose footprint centres it holds, touching and never overlapping', () => {
    setViewMode('iso');
    const drill = content.buildings.get('mechanical-drill');
    expect(drill.size).toBe(2);
    const region = Region.ofDrag({ x: 20, y: 20 }, at(20, 20), { x: 33, y: 28 }, at(33, 28), W, H);
    const spots = fillRegion(drill, region);
    expect(spots.length).toBeGreaterThan(6);
    const rect = region.rect!;
    const taken = new Set<string>();
    for (const s of spots) {
      const c = gridToWorld(s.x + 1, s.y + 1);
      expect(c.x >= rect.left && c.x <= rect.right && c.y >= rect.top && c.y <= rect.bottom).toBe(true);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        expect(taken.has(`${s.x + dx},${s.y + dy}`)).toBe(false);
        taken.add(`${s.x + dx},${s.y + dy}`);
      }
    }
    // 1x1 copies fill every captured tile
    const belt = content.buildings.get('battery');
    expect(fillRegion(belt, region).map(key).sort()).toEqual(region.tiles().map(key).sort());
  });

  it('keeps the old fill for a box of tiles, and takes one copy for a sliver', () => {
    setViewMode('top');
    const drill = content.buildings.get('mechanical-drill');
    const box = Region.ofBox({ x0: 10, y0: 10, x1: 15, y1: 13 });
    expect(fillRegion(drill, box).length).toBe(6);
    const sliver = Region.ofBox({ x0: 10, y0: 10, x1: 10, y1: 10 });
    expect(fillRegion(drill, sliver).length).toBe(1);
  });

  it('joins row neighbours into runs', () => {
    expect(rowRuns([{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 9, y: 1 }, { x: 3, y: 2 }])).toEqual([
      { x0: 3, y0: 1, x1: 5, y1: 1 },
      { x0: 9, y0: 1, x1: 9, y1: 1 },
      { x0: 3, y0: 2, x1: 3, y1: 2 },
    ]);
    expect(rowRuns([])).toEqual([]);
  });
});
