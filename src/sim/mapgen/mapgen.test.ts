import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { distanceToZero } from './edt';
import { generateMap, type GeneratedMap } from './index';
import { flood } from './land';
import { deepFloors, walkable } from './reach';

const SIZES = content.sizes.list.map((s) => s.id);
const THEMES = content.themes.list.map((t) => t.id);
const floorIndex = (id: string): number => content.floors.indexOf(id) + 1;
const deep = deepFloors(content.floors.list);

/** A spread of runs: every size and theme, many seeds (more for the cheap small maps). */
function runs(): { seed: number; size: string; theme: string }[] {
  const out: { seed: number; size: string; theme: string }[] = [];
  const count: Record<string, number> = { small: 40, medium: 14, large: 6 };
  for (const size of SIZES) for (let i = 0; i < (count[size] ?? 6); i++) out.push({ seed: 1000 + i * 7919, size, theme: THEMES[i % THEMES.length]! });
  return out;
}

const cache = new Map<string, GeneratedMap>();
function gen(r: { seed: number; size: string; theme: string }): GeneratedMap {
  const key = `${r.seed}/${r.size}/${r.theme}`;
  let m = cache.get(key);
  if (!m) cache.set(key, (m = generateMap(content, r)));
  return m;
}

const all = runs();
const label = (r: { seed: number; size: string; theme: string }): string => `${r.size}/${r.theme}/${r.seed}`;

/** Nearest tile (by distance) of a floor to the core centre, or Infinity. */
function nearest(g: GeneratedMap, floor: string): number {
  const f = floorIndex(floor);
  const cx = g.core.x + 1.5;
  const cy = g.core.y + 1.5;
  let best = Infinity;
  for (let y = 0; y < g.map.h; y++) for (let x = 0; x < g.map.w; x++) if (g.map.floor[y * g.map.w + x] === f) best = Math.min(best, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
  return best;
}

describe('map generator: playable', () => {
  for (const r of all) {
    it(`start, reach and resources: ${label(r)}`, () => {
      const g = gen(r);
      const { map, core } = g;
      const coreSize = content.buildings.get(content.rules.startCore).size;
      // the core and its ring: plain, buildable land
      for (let y = core.y - 1; y <= core.y + coreSize; y++) {
        for (let x = core.x - 1; x <= core.x + coreSize; x++) {
          const i = y * map.w + x;
          expect(map.ground[i], `land at ${x},${y}`).toBeGreaterThan(0);
          expect(map.ridge[i]).toBe(0);
          expect(map.floor[i]).toBe(0);
        }
      }
      // every buildable tile is reachable from the core
      const ok = walkable(map, deep);
      const reached = flood(map.w, map.h, (core.y + 1) * map.w + core.x + 1, ok);
      let lost = 0;
      for (let i = 0; i < reached.length; i++) if (ok(i) && !reached[i]) lost++;
      expect(lost).toBe(0);
      // the start set is within reach
      for (const [floor, within] of [['ore-copper', 24], ['ore-iron', 26], ['sand', 28], ['ore-coal', 30], ['shallow-water', 32]] as const) {
        expect(nearest(g, floor), `${floor} near the start`).toBeLessThanOrEqual(within);
      }
    });
  }

  it('land is one piece and never narrower than the minimum width', () => {
    for (const r of all) {
      const { map } = gen(r);
      const size = content.sizes.get(r.size);
      const start = Math.floor(map.w / 2) * map.w + Math.floor(map.w / 2);
      const land = flood(map.w, map.h, start, (i) => map.ground[i]! > 0);
      let stray = 0;
      for (let i = 0; i < land.length; i++) if (map.ground[i] && !land[i]) stray++;
      expect(stray, `${label(r)} stray land`).toBe(0);
      // width: shrink the land by the minimum width less one tile; it must stay one connected piece (up to a few tip specks)
      // (a bridge narrower than that would split off its piece), and no piece may vanish
      const mask = map.ground.map((g) => (g ? 1 : 0)) as Uint8Array;
      const toVoid = distanceToZero(mask, map.w, map.h);
      const core = mask.map((m, i) => (m && toVoid[i]! >= size.minWidth / 2 - 0.5 ? 1 : 0)) as Uint8Array;
      const first = core.indexOf(1);
      const joined = flood(map.w, map.h, first, (i) => core[i] === 1);
      let split = 0;
      for (let i = 0; i < core.length; i++) if (core[i] && !joined[i]) split++;
      expect(split, `${label(r)} land cut by narrow bridges`).toBeLessThan(12);
    }
  });

  it('the landmass is organic, not a rectangle, and mostly empty', () => {
    for (const r of all) {
      const { map } = gen(r);
      let land = 0;
      let ore = 0;
      let ridge = 0;
      let minX = map.w;
      let maxX = 0;
      let minY = map.h;
      let maxY = 0;
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const i = y * map.w + x;
          if (!map.ground[i]) continue;
          land++;
          if (map.floor[i]) ore++;
          if (map.ridge[i]) ridge++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      const box = (maxX - minX + 1) * (maxY - minY + 1);
      expect(land / box, `${label(r)} fills its box`).toBeLessThan(0.78);
      expect(land / (map.w * map.h), `${label(r)} land share`).toBeGreaterThan(0.15);
      // small maps carry the ores every round needs (winnable.test.ts) in less land: a little more floor there
      expect(ore / land, `${label(r)} floor share`).toBeLessThan(r.size === 'small' ? 0.23 : 0.2);
      expect(ridge / land, `${label(r)} ridge share`).toBeLessThan(0.14);
    }
  });
});

describe('map generator: per seed', () => {
  it('is deterministic', () => {
    const r = all[0]!;
    const a = generateMap(content, r).map;
    const b = generateMap(content, r).map;
    for (const key of ['ground', 'floor', 'ridge', 'boulder'] as const) expect(a[key]).toEqual(b[key]);
    expect(a.props).toEqual(b.props);
    expect(a.wrecks).toEqual(b.wrecks);
  });

  it('differs between seeds: shapes, ore sets and properties', () => {
    const med = all.filter((r) => r.size === 'medium');
    const shapes = new Set(med.map((r) => gen(r).map.ground.reduce((s, g) => s + (g ? 1 : 0), 0)));
    expect(shapes.size).toBeGreaterThan(med.length * 0.8);
    const sets = new Set(
      all.map((r) => {
        const seen = new Set<number>();
        for (const f of gen(r).map.floor) if (f) seen.add(f);
        return [...seen].sort().join(',');
      }),
    );
    expect(sets.size).toBeGreaterThan(4);
    const props = new Set(all.map((r) => gen(r).map.props.join('+')));
    expect(props.size).toBeGreaterThan(2);
  });

  it('keeps ores that mark the world only on their world, and always rolls enough standard ores', () => {
    for (const s of content.spawns) {
      if (!s.themes) continue;
      for (const r of all.filter((x) => !s.themes!.includes(x.theme))) {
        const f = floorIndex(s.floor);
        expect(gen(r).map.floor.includes(f), `${s.floor} on ${label(r)}`).toBe(false);
      }
    }
    const start = new Set(['sand', 'ore-coal', 'ore-copper', 'ore-iron']);
    const standard = content.spawns.filter((s) => !s.nearStart && !s.themes && content.floors.get(s.floor).ore).length;
    for (const r of all) {
      const ores = new Set<string>();
      for (const f of gen(r).map.floor) {
        const def = content.floors.list[f - 1];
        if (def?.ore && !start.has(def.id)) ores.add(def.id);
      }
      expect(ores.size, `${label(r)} extra ores`).toBeGreaterThanOrEqual(Math.min(4, standard));
    }
  });

  it('map properties never share an effect, and stay within the rules', () => {
    const [lo, hi] = content.rules.mapProperties;
    for (const r of all) {
      const props = gen(r).map.props;
      expect(props.length).toBeGreaterThanOrEqual(Math.min(lo, 1));
      expect(props.length).toBeLessThanOrEqual(hi);
      const keys = props.flatMap((p) => Object.keys(content.mapProperties.get(p).effects));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('geothermal maps have more slag than the rest', () => {
    const slag = floorIndex('slag-field');
    const count = (r: (typeof all)[number]) => gen(r).map.floor.filter((f) => f === slag).length;
    const hot: number[] = [];
    const cool: number[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const r = { seed, size: 'small', theme: 'rust-desert' };
      const g = gen(r);
      (g.map.props.includes('geothermal') ? hot : cool).push(count(r));
    }
    expect(hot.length).toBeGreaterThan(3);
    const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
    expect(avg(hot)).toBeGreaterThan(avg(cool));
  });
});

describe('map generator: wrecks, boulders, ridges', () => {
  it('has wrecks with a blueprint each, on reachable plain land, spread apart', () => {
    for (const r of all) {
      const { map } = gen(r);
      const pool = content.buildings.list.filter((b) => b.unlock === 'wreck' || b.unlock === 'meta');
      if (!pool.length) continue;
      expect(map.wrecks.length, `${label(r)} wrecks`).toBeGreaterThanOrEqual(1);
      const ids = map.wrecks.map((w) => w.building);
      expect(new Set(ids).size).toBe(ids.length);
      for (const w of map.wrecks) {
        const i = w.y * map.w + w.x;
        expect(map.ground[i]).toBeGreaterThan(0);
        expect(map.ridge[i]).toBe(0);
        expect(map.floor[i]).toBe(0);
        expect(w.taken).toBe(false);
        expect(content.buildings.has(w.building)).toBe(true);
      }
    }
  });

  it('has dust boulders in every world and ridges, none on ore or on the start ring', () => {
    for (const r of all) {
      const { map } = gen(r);
      expect(map.boulder.some((b) => b > 0), `${label(r)} boulders`).toBe(true);
      expect(map.ridge.some((b) => b > 0), `${label(r)} ridges`).toBe(true);
      const variants = content.themes.get(r.theme).boulders.length;
      for (let i = 0; i < map.boulder.length; i++) {
        if (map.boulder[i]) {
          expect(map.boulder[i]).toBeLessThanOrEqual(variants);
          expect(map.floor[i]).toBe(0);
          expect(map.ridge[i]).toBe(0);
        }
        if (map.ridge[i]) expect(map.floor[i], 'ridge on a floor tile').toBe(0);
      }
    }
  });

  it('every ore and liquid floor of the content can be generated', () => {
    const wanted = content.floors.list.filter((f) => f.ore || f.liquid).map((f) => f.id);
    const listed = new Set(content.spawns.map((s) => s.floor));
    for (const id of wanted) expect(listed.has(id), `no spawn for floor ${id}`).toBe(true);
  });
});

describe('map generator: themes', () => {
  it('each world has its own terrain style and palettes', () => {
    for (const t of content.themes.list) {
      expect(t.terrain, t.id).toBeDefined();
      expect(t.terrain!.speckle.colors.length).toBeGreaterThan(1);
      expect(t.palette.ground.length).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(content.themes.list.map((t) => t.palette.ground[0])).size).toBe(content.themes.list.length);
  });

  it('timing: a large map generates quickly', () => {
    const t = performance.now();
    generateMap(content, { seed: 99, size: 'large', theme: 'ice-snow' });
    expect(performance.now() - t).toBeLessThan(2500);
  });
});
