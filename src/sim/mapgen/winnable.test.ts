import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { generateMap } from './index';
import { flood } from './land';
import { deepFloors, walkable } from './reach';
import { createRng } from '../rng';
import { OPEN_RADIUS, openingShort } from './opening';
import { openingPatch } from './resources';
import { missingForWin } from './winnable';

/**
 * Every map can be won (before, only 9 of 30 small, 21 of 30 medium and 16 of 30 large maps had the
 * tungsten, titanium and lead or tin the chain needs). 30 seeds per size, the worlds taking turns.
 */

const THEMES = content.themes.list.map((t) => t.id);
const deep = deepFloors(content.floors.list);
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

/** Floor bytes of each `needed` group of the spawn table. */
function neededGroups(theme: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const s of content.spawns) {
    if (!s.needed || (s.themes && !s.themes.includes(theme))) continue;
    const set = out.get(s.needed) ?? new Set<number>();
    set.add(content.floors.indexOf(s.floor) + 1);
    out.set(s.needed, set);
  }
  return out;
}

describe('every map can be won', () => {
  for (const size of content.sizes.list.map((s) => s.id)) {
    it(`${size}: 30 seeds, all worlds: the chain's ores are there and reachable`, () => {
      for (const seed of SEEDS) {
        const theme = THEMES[seed % THEMES.length]!;
        const { map, core } = generateMap(content, { seed, size, theme });
        const label = `${size}/${theme}/${seed}`;
        expect(missingForWin(content, map), label).toEqual([]);
        // the opening: copper and iron near the core with room for a first line of drills and its belt
        expect(openingShort(content, map, { x: core.x + 1.5, y: core.y + 1.5 }), label).toEqual([]);
        const reached = flood(map.w, map.h, (core.y + 1) * map.w + core.x + 1, walkable(map, deep));
        for (const s of content.spawns.filter((x) => x.nearStart && content.floors.get(x.floor).ore)) {
          const f = content.floors.indexOf(s.floor) + 1;
          let tiles = 0;
          map.floor.forEach((v, i) => {
            if (v === f && reached[i]) tiles++;
          });
          // a small map had 11 coal tiles: one patch under three drills, and silicon never got going
          expect(tiles, `${label}: ${s.floor} tiles in reach`).toBeGreaterThanOrEqual(24);
        }
        for (const [group, floors] of neededGroups(theme)) {
          let tiles = 0;
          map.floor.forEach((f, i) => {
            if (floors.has(f) && reached[i]) tiles++;
          });
          expect(tiles, `${label}: ${group} tiles in reach`).toBeGreaterThanOrEqual(12);
        }
      }
    }, 60_000);
  }

  it('a start ore without room near the core is found and gets a new patch', () => {
    const { map, core } = generateMap(content, { seed: 4, size: 'small', theme: 'green-meadow' });
    const centre = { x: core.x + 1.5, y: core.y + 1.5 };
    const copper = content.floors.indexOf('ore-copper') + 1;
    map.floor.forEach((f, i) => {
      const x = i % map.w;
      const y = Math.floor(i / map.w);
      if (f === copper && Math.hypot(x - centre.x, y - centre.y) < OPEN_RADIUS + 2) map.floor[i] = 0;
    });
    expect(openingShort(content, map, centre)).toEqual(['ore-copper']);
    const ctx = { content, map, rng: createRng(4), seed: 4, centre, props: [], reach: map.w / 2 };
    openingPatch(ctx, 'ore-copper', OPEN_RADIUS);
    expect(openingShort(content, map, centre)).toEqual([]);
  });

  it('the check itself finds a missing ore', () => {
    const { map } = generateMap(content, { seed: 4, size: 'medium', theme: 'rust-desert' });
    const tungsten = content.floors.indexOf('ore-tungsten') + 1;
    map.floor.forEach((f, i) => {
      if (f === tungsten) map.floor[i] = 0;
    });
    expect(missingForWin(content, map)).toContain('tungsten-carbide');
  });
});
