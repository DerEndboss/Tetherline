import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { beltLine, paint, placeNow, testWorld } from '../../sim/dev';
import { run, step } from '../../sim/tick';
import type { World } from '../../sim/world';
import { activeRecipe, configKind, configKindOf, describe as describeOption, itemOptions, leftovers, moveCursor, optionsFor, placePanel, recipeNote, recipeOptions } from './logic';

const M = (id: string) => content.materials.indexOf(id);
const stock = (w: World, id: string) => w.state.stock[M(id)] ?? 0;

/** A 3x3 core at (20, 20) on a flat map; its 4 power units run what touches it. */
function withCore(): World {
  const w = testWorld(content);
  placeNow(w, 'core-shard', 20, 20);
  return w;
}

describe('which buildings can be set', () => {
  const kind = (id: string) => configKind(content.buildings.get(id));
  it('factories with several recipes, sorters and unloaders', () => {
    expect(kind('smelter')).toBe('recipe');
    expect(kind('steel-foundry')).toBe('recipe');
    expect(kind('alloy-furnace')).toBe('recipe');
    expect(kind('sorter')).toBe('sorter');
    expect(kind('unloader')).toBe('unloader');
  });
  it('not buildings with one recipe, staged mega buildings, drills, belts or the core', () => {
    expect(kind('graphite-press')).toBeNull();
    expect(kind('space-elevator')).toBeNull();
    expect(kind('mechanical-drill')).toBeNull();
    expect(kind('conveyor')).toBeNull();
    expect(kind('core-shard')).toBeNull();
  });
  it('every crafter the content lists with several recipes is settable (unless staged)', () => {
    for (const d of content.buildings.list) {
      const settable = d.behaviour === 'crafter' && !d.stages && (d.recipes?.length ?? 0) > 1;
      expect(configKind(d) === 'recipe', d.id).toBe(settable);
    }
  });
  it('only finished buildings count', () => {
    const w = withCore();
    const s = placeNow(w, 'smelter', 10, 10);
    expect(configKindOf(w, s.id)).toBe('recipe');
    s.build = 0.5;
    expect(configKindOf(w, s.id)).toBeNull();
    expect(configKindOf(w, 9999)).toBeNull();
  });
});

describe('the options', () => {
  it('an unset factory shows its first recipe as the current one', () => {
    const w = withCore();
    const s = placeNow(w, 'smelter', 10, 10);
    expect(s.config).toBe(-1);
    expect(activeRecipe(w, s)).toBe(0);
    const options = recipeOptions(w, s);
    expect(options.map((o) => o.key)).toEqual(['smelt-iron', 'smelt-lead', 'smelt-tin']);
    expect(options.map((o) => o.active)).toEqual([true, false, false]);
  });

  it('a recipe tile carries the amounts and the time from the data', () => {
    const w = withCore();
    const f = placeNow(w, 'steel-foundry', 10, 10);
    const ti = recipeOptions(w, f)[1]!;
    expect(ti.label).toBe('Titanium Plate');
    expect(ti.inputs.map((a) => [a.id, a.n])).toEqual([['titanium-ore', 2], ['graphite', 1]]);
    expect(ti.outputs.map((a) => [a.id, a.n])).toEqual([['titanium-plate', 1]]);
    expect(ti.seconds).toBe(3);
    expect(describeOption(ti)).toBe('Titanium Plate: 2 Titanium Ore + 1 Graphite to 1 Titanium Plate, 3 s');
  });

  it('a recipe is dim, with the reason, while an input has never been seen; once it is in the core it is not', () => {
    const w = withCore();
    const f = placeNow(w, 'steel-foundry', 10, 10);
    expect(recipeOptions(w, f)[1]!.reason).toBe('Not had yet: Titanium Ore, Graphite');
    w.state.stock[M('titanium-ore')] = 1;
    expect(recipeOptions(w, f)[1]!.reason).toBe('Not had yet: Graphite');
    w.state.stats.made[M('graphite')] = 1;
    expect(recipeOptions(w, f)[1]!.reason).toBeNull();
  });

  it('the vented by-product is not listed as a product', () => {
    const w = withCore();
    const s = placeNow(w, 'smelter', 10, 10);
    expect(recipeOptions(w, s)[0]!.outputs.map((a) => a.id)).toEqual(['iron-bar']);
  });

  it('sorter and unloader: the empty choice first (current at -1), then every material, the current one marked', () => {
    const w = withCore();
    const sorter = placeNow(w, 'sorter', 10, 10, 0, M('lead-ore'));
    const unloader = placeNow(w, 'unloader', 12, 10);
    const s = itemOptions(w, sorter, 'sorter');
    expect(s).toHaveLength(content.materials.list.length + 1);
    expect(s[0]).toMatchObject({ label: 'None', value: -1, active: false });
    expect(s.filter((o) => o.active).map((o) => o.key)).toEqual(['lead-ore']);
    const u = optionsFor(w, unloader, 'unloader');
    expect(u[0]).toMatchObject({ label: 'Any', value: -1, active: true });
    expect(u.filter((o) => o.active)).toHaveLength(1);
  });

  it('an item nobody has had is dim ("Not found yet")', () => {
    const w = withCore();
    const sorter = placeNow(w, 'sorter', 10, 10);
    const o = itemOptions(w, sorter, 'sorter');
    expect(o.find((x) => x.key === 'tungsten-ore')!.reason).toBe('Not found yet');
    w.state.stats.made[M('tungsten-ore')] = 3;
    expect(itemOptions(w, sorter, 'sorter').find((x) => x.key === 'tungsten-ore')!.reason).toBeNull();
  });
});

describe('what happens on a change', () => {
  it('lists what the old recipe left inside and says it waits', () => {
    const w = withCore();
    const s = placeNow(w, 'smelter', 10, 10, 0, 1); // lead
    s.items[M('iron-ore')] = 4;
    s.items[M('iron-bar')] = 2;
    s.items[M('lead-ore')] = 1;
    expect(leftovers(w, s)).toEqual(['4 Iron Ore', '2 Iron Bar']);
    expect(recipeNote(w, s)).toContain('Waiting now: 4 Iron Ore, 2 Iron Bar.');
    expect(recipeNote(w, placeNow(w, 'smelter', 14, 10))).not.toContain('Waiting now');
  });

  it('is what the sim does: leftovers of the old recipe stay and come back into use when it is chosen again', () => {
    const w = withCore();
    const s = placeNow(w, 'smelter', 18, 20); // touches the core
    s.items[M('iron-ore')] = 6;
    run(w, 40);
    expect(stock(w, 'iron-bar')).toBeGreaterThan(0);
    step(w, [{ type: 'configure', id: s.id, value: 1 }]);
    const held = s.items[M('iron-ore')] ?? 0;
    run(w, 100);
    expect(s.items[M('iron-ore')]).toBe(held); // not used, not thrown away
    step(w, [{ type: 'configure', id: s.id, value: 0 }]);
    run(w, 200);
    expect(s.items[M('iron-ore')] ?? 0).toBeLessThan(held);
  });
});

describe('configure through the commands the panel sends', () => {
  it('a smelter set to lead makes lead ingots (before: stuck on iron, lead ore sits unused)', () => {
    const w = withCore();
    const s = placeNow(w, 'smelter', 18, 20);
    s.items[M('lead-ore')] = 8;
    run(w, 100);
    expect(stock(w, 'lead-ingot')).toBe(0);
    expect(s.items[M('lead-ore')]).toBe(8);
    step(w, [{ type: 'configure', id: s.id, value: 1 }]);
    run(w, 140);
    expect(stock(w, 'lead-ingot')).toBeGreaterThanOrEqual(3);
    expect(stock(w, 'iron-bar')).toBe(0);
  });

  it('a smelter set to tin makes tin ingots', () => {
    const w = withCore();
    const s = placeNow(w, 'smelter', 18, 20);
    s.items[M('tin-ore')] = 4;
    step(w, [{ type: 'configure', id: s.id, value: 2 }]);
    run(w, 100);
    expect(stock(w, 'tin-ingot')).toBeGreaterThanOrEqual(2);
  });

  it('a steel foundry set to titanium plate makes it (default: steel only)', () => {
    const w = withCore();
    const f = placeNow(w, 'steel-foundry', 17, 20); // touches the core: its 4 units power it
    f.items[M('titanium-ore')] = 6;
    f.items[M('graphite')] = 3;
    run(w, 200);
    expect(stock(w, 'titanium-plate')).toBe(0);
    step(w, [{ type: 'configure', id: f.id, value: 1 }]);
    run(w, 200);
    expect(stock(w, 'titanium-plate')).toBeGreaterThanOrEqual(2);
    expect(stock(w, 'steel')).toBe(0);
  });

  it('a sorter set to an item sends it straight on, the rest to the side; unset, nothing goes straight on', () => {
    const w = withCore();
    paint(w, 'ore-copper', 4, 21, 2, 2);
    paint(w, 'sand', 6, 22, 2, 2);
    placeNow(w, 'mechanical-drill', 4, 21);
    placeNow(w, 'mechanical-drill', 6, 22);
    beltLine(w, 6, 21, 0, 4);
    const sorter = placeNow(w, 'sorter', 10, 21);
    beltLine(w, 11, 21, 0, 9);
    placeNow(w, 'container', 10, 22);
    run(w, 600);
    expect(stock(w, 'sand')).toBe(0);
    step(w, [{ type: 'configure', id: sorter.id, value: M('sand') }]);
    run(w, 600);
    expect(stock(w, 'sand')).toBeGreaterThan(2);
  });

  it('an unloader set to an item takes only that one out of the core', () => {
    const w = withCore();
    w.state.stock[M('coal')] = 50;
    w.state.stock[M('sand')] = 50;
    const u = placeNow(w, 'unloader', 19, 21);
    const box = placeNow(w, 'container', 17, 21);
    step(w, [{ type: 'configure', id: u.id, value: M('coal') }]);
    run(w, 60);
    expect(box.items[M('coal')]).toBeGreaterThan(10);
    expect(box.items[M('sand')] ?? 0).toBe(0);
  });
});

describe('keyboard', () => {
  it('sideways keys wrap along the list, up and down keep to the grid and stop at the edge', () => {
    expect(moveCursor(0, 'ArrowRight', 6, 10)).toBe(1);
    expect(moveCursor(9, 'ArrowRight', 6, 10)).toBe(0);
    expect(moveCursor(0, 'ArrowLeft', 6, 10)).toBe(9);
    expect(moveCursor(1, 'ArrowDown', 6, 10)).toBe(7);
    expect(moveCursor(5, 'ArrowDown', 6, 10)).toBe(5);
    expect(moveCursor(7, 'ArrowUp', 6, 10)).toBe(1);
    expect(moveCursor(2, 'ArrowUp', 6, 10)).toBe(2);
    expect(moveCursor(2, 'ArrowDown', 1, 3)).toBe(0);
    expect(moveCursor(4, 'Home', 6, 10)).toBe(0);
    expect(moveCursor(4, 'End', 6, 10)).toBe(9);
    expect(moveCursor(4, 'x', 6, 10)).toBe(4);
  });
});

describe('where the panel sits', () => {
  const vp = { w: 1000, h: 700 };
  const size = { w: 300, h: 200 };
  it('right of the building, centred on it', () => {
    const at = placePanel({ x0: 100, y0: 300, x1: 160, y1: 360 }, size, vp);
    expect(at).toEqual({ x: 184, y: 230 });
  });
  it('left when the right does not fit', () => {
    const at = placePanel({ x0: 800, y0: 300, x1: 860, y1: 360 }, size, vp);
    expect(at.x).toBe(800 - 24 - 300);
  });
  it('below when neither side fits, and always inside the window', () => {
    const at = placePanel({ x0: 300, y0: 100, x1: 700, y1: 160 }, size, { w: 1000, h: 700 });
    expect(at.y).toBeGreaterThanOrEqual(8);
    expect(at.x + size.w).toBeLessThanOrEqual(vp.w - 8);
    expect(at.y + size.h).toBeLessThanOrEqual(vp.h - 8);
  });
  it('keeps clear of a HUD panel when another side is free', () => {
    const hud = { x0: 170, y0: 250, x1: 700, y1: 350 };
    const at = placePanel({ x0: 100, y0: 300, x1: 160, y1: 360 }, size, vp, [hud]);
    expect(at.x).toBe(160 + 24); // still on the right, slid up past the HUD panel
    expect(at.y + size.h).toBeLessThanOrEqual(hud.y0);
  });
  it('slides a side up past a HUD panel that would cover it', () => {
    const hud = { x0: 600, y0: 600, x1: 1000, y1: 700 };
    const at = placePanel({ x0: 700, y0: 360, x1: 960, y1: 440 }, { w: 300, h: 300 }, vp, [hud]);
    expect(at.x + 300).toBeLessThanOrEqual(1000 - 8);
    expect(at.y + 300).toBeLessThanOrEqual(hud.y0);
  });
  it('clamps into the window for a building far off screen', () => {
    const at = placePanel({ x0: -900, y0: -900, x1: -840, y1: -840 }, size, vp);
    expect(at.x).toBeGreaterThanOrEqual(8);
    expect(at.y).toBeGreaterThanOrEqual(8);
  });
});
