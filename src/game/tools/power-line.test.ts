import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { testWorld } from '../../sim/dev';
import { gapBetween } from '../../sim/grid';
import { linePoints, nodeLine } from './power-line';

const node = content.buildings.get('power-node');
const range = node.power!.laserRange!;

describe('power node lines', () => {
  it('the line points include both ends and move one tile at a time', () => {
    const pts = linePoints({ x: 0, y: 0 }, { x: 7, y: 3 });
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 7, y: 3 });
    for (let i = 1; i < pts.length; i++) expect(Math.max(Math.abs(pts[i]!.x - pts[i - 1]!.x), Math.abs(pts[i]!.y - pts[i - 1]!.y))).toBe(1);
  });

  it('places nodes in laser reach of each other all the way along an open line', () => {
    const w = testWorld(content, 80, 40);
    const nodes = nodeLine(w, node, { x: 2, y: 5 }, { x: 60, y: 5 });
    expect(nodes.length).toBeGreaterThan(8);
    expect(nodes[0]).toEqual({ x: 2, y: 5 });
    expect(nodes[nodes.length - 1]!.x).toBeGreaterThanOrEqual(60 - range);
    for (let i = 1; i < nodes.length; i++) expect(gapBetween({ ...nodes[i - 1]!, size: 1 }, { ...nodes[i]!, size: 1 })).toBeLessThanOrEqual(range);
  });

  it('slides a node off rock and still reaches the other side', () => {
    const w = testWorld(content, 60, 30);
    const { map } = w.state;
    for (let y = 0; y < 30; y++) for (let x = 20; x < 24; x++) map.ridge[y * map.w + x] = 1;
    const nodes = nodeLine(w, node, { x: 2, y: 10 }, { x: 45, y: 10 });
    expect(nodes.every((n) => map.ridge[n.y * map.w + n.x] === 0)).toBe(true);
    expect(nodes[nodes.length - 1]!.x).toBeGreaterThan(24);
  });

  it('stops where a gap wider than the laser cannot be crossed', () => {
    const w = testWorld(content, 60, 30);
    const { map } = w.state;
    for (let y = 0; y < 30; y++) for (let x = 20; x < 40; x++) map.ridge[y * map.w + x] = 1;
    const nodes = nodeLine(w, node, { x: 2, y: 10 }, { x: 55, y: 10 });
    expect(nodes[nodes.length - 1]!.x).toBeLessThan(20);
  });
});
