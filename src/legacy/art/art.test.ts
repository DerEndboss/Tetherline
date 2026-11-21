import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { buildingId, droneId, iconId, obstacleId, OBSTACLE_VARIANTS, resourceIcons, worldSprites } from './index';
import { hull, lit } from './solid';

const world = content.worlds.get(content.rules.startWorld);
const sprites = worldSprites(content, world);
const byId = new Map(sprites.map((s) => [s.id, s]));

describe('world sprites from content', () => {
  it('have unique ids and well-formed SVG documents with sane sizes and anchors', () => {
    expect(byId.size).toBe(sprites.length);
    for (const s of sprites) {
      expect(s.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(s.svg.endsWith('</svg>')).toBe(true);
      expect(s.svg).not.toContain('NaN');
      expect(s.w).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
      expect(s.ax).toBeGreaterThanOrEqual(0);
      expect(s.ax).toBeLessThanOrEqual(1);
      expect(s.ay).toBeGreaterThanOrEqual(0);
      expect(s.ay).toBeLessThanOrEqual(1);
    }
  });

  it('cover every obstacle variant, building, drone and resource', () => {
    for (const o of content.obstacles.list) {
      for (let v = 0; v < OBSTACLE_VARIANTS; v++) expect(byId.has(obstacleId(o.id, v))).toBe(true);
    }
    for (const b of content.buildings.list) expect(byId.has(buildingId(b.id, 1))).toBe(true);
    for (const d of content.drones.list) expect(byId.has(droneId(d.id, 0))).toBe(true);
    const icons = new Set(resourceIcons(content).map((s) => s.id));
    for (const m of content.materials.list) expect(icons.has(iconId(m.id))).toBe(true);
    for (const c of content.currencies.list) expect(icons.has(iconId(c.id))).toBe(true);
  });

  it('give the base a hatch, lights and a height for drones and loot', () => {
    const base = byId.get(buildingId(content.rules.baseBuilding, 1))!;
    expect(base.meta?.hatch).toBeDefined();
    expect(base.meta?.lights?.length).toBeGreaterThan(4);
    expect(base.meta?.hatch?.y).toBeLessThan(-60);
  });

  it('are the same every time (art is generated deterministically)', () => {
    const again = worldSprites(content, world);
    expect(again.map((s) => s.svg)).toEqual(sprites.map((s) => s.svg));
  });
});

describe('solid renderer', () => {
  it('builds a counter-clockwise convex hull', () => {
    const h = hull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }]);
    expect(h).toHaveLength(4);
    expect(h).not.toContainEqual({ x: 5, y: 5 });
  });

  it('lights faces towards the key light brighter than faces away from it', () => {
    const rig = { origin: { x: 0, y: 0 }, light: world.palette.light, shadow: world.palette.shadow, sky: world.palette.sky.mid };
    const mat = { main: '#c08060', dark: '#402030' };
    const lum = (hex: string): number => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const top = lit(mat, [0, 0, 1], rig);
    const left = lit(mat, [0, 1, 0], rig);
    const right = lit(mat, [1, 0, 0], rig);
    expect(lum(top)).toBeGreaterThan(lum(right));
    expect(lum(left)).toBeGreaterThan(lum(right));
  });
});
