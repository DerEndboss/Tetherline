import { describe, expect, it } from 'vitest';
import { spacedNodes, type Tile } from './geometry';

const row = (from: number, to: number): Tile[] => Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, y: 0 }));
const xs = (nodes: Tile[]) => nodes.map((t) => t.x);
const any = () => true;

describe('spacedNodes (bridges along a drag)', () => {
  it('takes the start, then the furthest tile in reach each time, then the end', () => {
    expect(xs(spacedNodes(row(0, 12), 4, any))).toEqual([0, 4, 8, 12]);
    expect(xs(spacedNodes(row(0, 10), 4, any))).toEqual([0, 4, 8, 10]);
  });

  it('is the start alone for one tile and both ends for a short run', () => {
    expect(xs(spacedNodes(row(3, 3), 4, any))).toEqual([3]);
    expect(xs(spacedNodes(row(0, 2), 4, any))).toEqual([0, 2]);
  });

  it('skips tiles where nothing fits, but always keeps both ends', () => {
    expect(xs(spacedNodes(row(0, 12), 4, (t) => t.x !== 4 && t.x !== 12))).toEqual([0, 3, 7, 11, 12]);
  });

  it('lists the first valid tile beyond a gap wider than the range as not linked, and stops there', () => {
    const nodes = spacedNodes(row(0, 10), 2, (t) => t.x === 0 || t.x === 6 || t.x === 7 || t.x === 10);
    expect(xs(nodes)).toEqual([0, 6]);
    expect(nodes.map((n) => n.linked)).toEqual([true, false]);
  });

  it('links every node to the one before it when the gaps fit the range', () => {
    const nodes = spacedNodes(row(0, 12), 4, (t) => t.x !== 4 && t.x !== 12);
    expect(nodes.every((n) => n.linked)).toBe(true);
    expect(spacedNodes(row(0, 10), 4, (t) => t.x < 4 || t.x > 5).every((n) => n.linked)).toBe(true);
  });
});
