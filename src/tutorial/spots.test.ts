import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { paint, placeNow, testWorld } from '../sim/dev';
import { touches } from '../sim/grid';
import { nextTo, oreSpot, around } from './spots';

const drill = content.buildings.get('mechanical-drill');
const smelter = content.buildings.get('smelter');

/** A 60x60 flat map, the core at (28, 28), a copper field to the east and an iron one to the south. */
function field() {
  const w = testWorld(content, 60, 60);
  placeNow(w, 'core-shard', 28, 28);
  paint(w, 'ore-copper', 40, 26, 6, 6);
  paint(w, 'ore-iron', 26, 40, 5, 5);
  return w;
}

describe('oreSpot', () => {
  it('finds a free spot with all four tiles on the ore, nearest the core', () => {
    const w = field();
    const s = oreSpot(w, drill, 'copper-ore')!;
    expect(s.w).toBe(2);
    expect(s.x).toBeGreaterThanOrEqual(40);
    expect(s.x).toBeLessThanOrEqual(44);
    expect(s.x).toBe(40); // the field's west edge is the nearest to the core
  });

  it('skips ore that a building or a ghost already covers', () => {
    const w = field();
    placeNow(w, 'mechanical-drill', 40, 26);
    const s = oreSpot(w, drill, 'copper-ore')!;
    expect(s.x === 40 && s.y === 26).toBe(false);
    expect(w.at(s.x, s.y)).toBeUndefined();
    w.state.plans.push({ kind: w.content.buildings.indexOf('mechanical-drill'), x: s.x, y: s.y, rot: 0, config: -1 });
    const t = oreSpot(w, drill, 'copper-ore')!;
    expect(t.x === s.x && t.y === s.y).toBe(false);
  });

  it('answers null when the map has none of that ore', () => {
    const w = field();
    expect(oreSpot(w, drill, 'coal')).toBeNull();
  });

  it('never recommends a drill that would mine another ore than the asked one', () => {
    const w = field();
    paint(w, 'ore-iron', 46, 26, 1, 6); // a strip of iron on the copper field's east edge
    const s = oreSpot(w, drill, 'iron-ore')!;
    expect(s.y).toBeGreaterThanOrEqual(26);
  });
});

describe('nextTo', () => {
  it('returns a free footprint that touches the anchor, leaning toward the target', () => {
    const w = field();
    const core = w.rect(w.core!);
    const s = nextTo(w, smelter, core, { x: 50, y: 29 })!;
    expect(touches({ x: s.x, y: s.y, size: 2 }, core)).toBe(true);
    expect(s.x).toBe(core.x + core.size); // the east side faces the target
  });

  it('is null when the anchor is walled in', () => {
    const w = testWorld(content, 12, 12);
    w.state.map.ridge.fill(1);
    placeNow(w, 'core-shard', 5, 5);
    expect(nextTo(w, smelter, w.rect(w.core!), { x: 0, y: 0 })).toBeNull();
  });
});

describe('around', () => {
  it('is the box around some buildings', () => {
    const w = field();
    const a = placeNow(w, 'mechanical-drill', 40, 26);
    const b = placeNow(w, 'smelter', 42, 26);
    expect(around(w, [a, b], 'x')).toEqual({ x: 40, y: 26, w: 4, h: 2, label: 'x' });
    expect(around(w, [])).toBeNull();
  });
});
