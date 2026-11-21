import { afterEach, describe, expect, it } from 'vitest';
import { depthOf, gridToWorld, mapBounds, setViewMode, tileCenter, tileInView, visibleTileRange, worldToGrid, worldToTile, worldX, worldY, type ViewMode } from './iso';

describe.each<ViewMode>(['iso', 'steep', 'top'])('%s projection', (view) => {
  afterEach(() => setViewMode('iso'));

  it('round-trips grid and world coordinates and agrees with the allocation-free helpers', () => {
    setViewMode(view);
    for (const [gx, gy] of [[0, 0], [3.5, 7.25], [-2, 9]] as const) {
      const w = gridToWorld(gx, gy);
      expect(worldX(gx, gy)).toBeCloseTo(w.x);
      expect(worldY(gx, gy)).toBeCloseTo(w.y);
      const g = worldToGrid(w.x, w.y);
      expect(g.x).toBeCloseTo(gx);
      expect(g.y).toBeCloseTo(gy);
    }
    expect(worldToTile(tileCenter(5, 9).x, tileCenter(5, 9).y)).toEqual({ x: 5, y: 9 });
  });

  it('culls to a range that covers every tile in view', () => {
    setViewMode(view);
    const b = mapBounds(40, 40);
    const view0 = { left: (b.left + b.right) / 2 - 300, top: (b.top + b.bottom) / 2 - 250, right: (b.left + b.right) / 2 + 300, bottom: (b.top + b.bottom) / 2 + 250 };
    const r = visibleTileRange(view0, 40, 40, 0);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (tileInView(x, y, view0, 0)) expect(x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1).toBe(true);
  });

  it('draws nearer tiles later: the tile below a tile is always in front', () => {
    setViewMode(view);
    expect(depthOf(4, 5)).toBeGreaterThan(depthOf(4, 4));
    expect(gridToWorld(4, 5).y).toBeGreaterThan(gridToWorld(4, 4).y);
  });
});
