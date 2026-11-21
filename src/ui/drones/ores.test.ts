import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { paint, testWorld } from '../../sim/dev';
import { oresOnMap } from './ores';

describe('oresOnMap', () => {
  it('a bare map has no ore', () => {
    expect(oresOnMap(testWorld(content)).size).toBe(0);
  });

  it('lists the materials of the ore floors that are painted on the map, and only those', () => {
    const w = testWorld(content);
    paint(w, 'ore-copper', 2, 2, 3, 3);
    paint(w, 'ore-lead', 10, 10, 2, 2);
    const ores = oresOnMap(w);
    expect([...ores].sort()).toEqual(['copper-ore', 'lead-ore']);
    expect(ores.has('lithium-salt')).toBe(false);
  });

  it('water and other floors without ore add nothing', () => {
    const w = testWorld(content);
    const water = content.floors.list.find((f) => !f.ore);
    if (water) paint(w, water.id, 1, 1, 4, 4);
    expect(oresOnMap(w).size).toBe(0);
  });

  it('a generated run only offers ores that really lie on its map', () => {
    const w = testWorld(content);
    paint(w, 'sand', 0, 0, 5, 5);
    const first = oresOnMap(w);
    expect(oresOnMap(w)).toBe(first); // one scan per map
    expect(first.has('sand')).toBe(true);
  });
});
