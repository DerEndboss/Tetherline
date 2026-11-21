import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { beltLine, placeNow, testWorld } from '../../sim/dev';
import { BlueprintLibrary } from './blueprint-store';
import { blueprintPlans, captureBlueprint, flipBlueprint, parseBlueprint, pasteCorner, rotateBlueprint } from './blueprint';

const sizeOf = (id: string) => content.buildings.find(id)?.size ?? 0;

function sample() {
  const w = testWorld(content);
  beltLine(w, 5, 5, 0, 4);
  placeNow(w, 'smelter', 9, 5, 0);
  return { w, bp: captureBlueprint(w, { x0: 4, y0: 4, x1: 14, y1: 9 }, 'x')! };
}

describe('blueprints', () => {
  it('copies the buildings in a box with relative positions', () => {
    const { bp } = sample();
    expect(bp.items).toHaveLength(5);
    expect(bp.items.every((i) => i.x >= 0 && i.y >= 0)).toBe(true);
    expect(bp.w).toBe(4 + content.buildings.get('smelter').size);
    expect(captureBlueprint(testWorld(content), { x0: 0, y0: 0, x1: 9, y1: 9 })).toBeNull();
  });

  it('copies an irregular set (not a full rectangle): the tight box holds it, turns and mirrors keep every building', () => {
    const w = testWorld(content);
    // a diagonal band of 1x1 batteries and one 2x2 smelter, as a screen rectangle captures them
    const spots = [[6, 6], [7, 6], [7, 7], [8, 7], [8, 8], [9, 8], [9, 9]] as const;
    for (const [x, y] of spots) placeNow(w, 'battery', x, y, 0);
    placeNow(w, 'smelter', 11, 8, 0);
    const inBand = { hasFootprint: (x: number, y: number, size: number): boolean => Math.abs(x - y) <= 1 || size === 2 };
    const bp = captureBlueprint(w, inBand, 'band')!;
    expect(bp.items).toHaveLength(spots.length + 1);
    expect([bp.w, bp.h]).toEqual([13 - 6, 10 - 6]);
    expect(bp.items.every((i) => i.x >= 0 && i.y >= 0 && i.x + i.size <= bp.w && i.y + i.size <= bp.h)).toBe(true);
    // the box is not full: it has fewer buildings than tiles
    expect(bp.items.reduce((n, i) => n + i.size * i.size, 0)).toBeLessThan(bp.w * bp.h);
    const turned = rotateBlueprint(bp, 1);
    expect(turned.items).toHaveLength(bp.items.length);
    expect(turned.items.every((i) => i.x >= 0 && i.y >= 0 && i.x + i.size <= turned.w && i.y + i.size <= turned.h)).toBe(true);
    expect(rotateBlueprint(bp, 4)).toEqual(bp);
    expect(flipBlueprint(flipBlueprint(bp))).toEqual(bp);
    // pasting it elsewhere puts every building where the pattern says
    const plans = blueprintPlans(bp, 20, 30);
    expect(plans.map((p) => `${p.kind}@${p.x - 20},${p.y - 30}`).sort()).toEqual(bp.items.map((i) => `${i.kind}@${i.x},${i.y}`).sort());
  });

  it('never copies the core', () => {
    const w = testWorld(content);
    placeNow(w, 'core-shard', 10, 10);
    expect(captureBlueprint(w, { x0: 0, y0: 0, x1: 30, y1: 30 })).toBeNull();
  });

  it('four turns come back to the start, and a turn keeps every building inside the box', () => {
    const { bp } = sample();
    expect(rotateBlueprint(bp, 4)).toEqual(bp);
    const r = rotateBlueprint(bp, 1);
    expect(r.w).toBe(bp.h);
    expect(r.h).toBe(bp.w);
    for (const it of r.items) expect(it.x >= 0 && it.y >= 0 && it.x + it.size <= r.w && it.y + it.size <= r.h).toBe(true);
    expect(r.items[0]!.rot).toBe(1);
  });

  it('flipping twice is the identity and swaps east and west', () => {
    const { bp } = sample();
    expect(flipBlueprint(flipBlueprint(bp))).toEqual(bp);
    expect(flipBlueprint(bp).items[0]!.rot).toBe(2);
  });

  it('pastes as ghosts at the chosen corner, and the paste lands on a free spot as the original', () => {
    const { bp } = sample();
    const plans = blueprintPlans(bp, 20, 20);
    expect(plans.map((p) => [p.x, p.y])).toContainEqual([20, 20]);
    expect(pasteCorner(bp, 10, 10)).toEqual({ x: 10 - Math.floor(bp.w / 2), y: 10 - Math.floor(bp.h / 2) });
  });

  it('parses saved data and rejects unknown buildings', () => {
    const { bp } = sample();
    expect(parseBlueprint(JSON.parse(JSON.stringify(bp)), sizeOf)).toEqual(bp);
    expect(parseBlueprint({ name: 'x', items: [{ kind: 'nope', x: 0, y: 0, rot: 0 }] }, sizeOf)).toBeNull();
    expect(parseBlueprint(null, sizeOf)).toBeNull();
  });

  it('the library saves, replaces by name, renames and removes, and reloads from storage', () => {
    const { bp } = sample();
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const lib = new BlueprintLibrary(sizeOf, storage);
    lib.save(bp, 'Line');
    lib.save(bp, 'Line');
    expect(lib.list()).toHaveLength(1);
    lib.rename('Line', 'Smelting');
    expect(lib.list()[0]!.name).toBe('Smelting');
    expect(new BlueprintLibrary(sizeOf, storage).list()).toHaveLength(1);
    expect(lib.suggestName()).toBe('Blueprint 1');
    lib.remove('Smelting');
    expect(lib.list()).toHaveLength(0);
  });
});
