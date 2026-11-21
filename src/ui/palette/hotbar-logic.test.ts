import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { MAX_SLOTS, NO_SETTING, assignSlot, padConfigs, slotCap, slotForPick, slotLabel, slotOf, slotOfKey, swapSlots, visibleSlots, type Slots } from './hotbar-logic';
import { keptSetting, settingMark } from './setting';
import { DEFAULT_PALETTE, parsePalette, paletteStore } from './store';

const slots = (ids: (string | null)[], configs: number[] = []): Slots => ({ ids, configs: padConfigs(configs) });
const ids = (s: Slots, n = 3) => s.ids.slice(0, n);
const cfg = (s: Slots, n = 3) => s.configs.slice(0, n);

describe('hotbar slots', () => {
  it('fits the slot count to the screen and never above the setting', () => {
    expect(slotCap(390)).toBe(5);
    expect(slotCap(1024)).toBe(8);
    expect(slotCap(1920)).toBe(10);
    expect(slotCap(844, 390)).toBe(6);
    expect(slotCap(844, 800)).toBe(8);
    expect(visibleSlots(8, 1920)).toBe(8);
    expect(visibleSlots(10, 390)).toBe(5);
    expect(visibleSlots(99, 1920)).toBe(10);
    expect(visibleSlots(1, 1920)).toBe(5);
    expect(visibleSlots(8, 844, 390)).toBe(6);
  });

  it('maps keys 1-9 and 0 to slots', () => {
    expect(slotOfKey('Digit1')).toBe(0);
    expect(slotOfKey('Digit9')).toBe(8);
    expect(slotOfKey('Digit0')).toBe(9);
    expect(slotOfKey('KeyQ')).toBeNull();
    expect([0, 8, 9].map(slotLabel)).toEqual(['1', '9', '0']);
  });

  it('keeps a plain building in one slot and swaps slots', () => {
    const a = assignSlot(slots(['x', 'y', null]), 2, 'x');
    expect(ids(a)).toEqual([null, 'y', 'x']);
    expect(ids(swapSlots(a, 1, 2))).toEqual([null, 'x', 'y']);
    expect(assignSlot(a, 1, null).ids[1]).toBeNull();
  });

  it('pads every list to ten slots', () => {
    expect(assignSlot(slots(['x']), 4, 'y').ids).toHaveLength(MAX_SLOTS);
    expect(padConfigs([2, 'a', -3, 1.5, 0])).toEqual([2, -1, -1, -1, 0, -1, -1, -1, -1, -1]);
  });

  it('picks the own slot, then the first empty one, then the active one', () => {
    expect(slotForPick(slots(['a', 'b']), 'b', NO_SETTING, 5, 0)).toBe(1);
    expect(slotForPick(slots(['a', null, 'c']), 'z', NO_SETTING, 5, 0)).toBe(1);
    expect(slotForPick(slots(['a', 'b', 'c', 'd', 'e']), 'z', NO_SETTING, 5, 3)).toBe(3);
  });
});

describe('a slot remembers the setting', () => {
  it('stores it with the building and gives it back', () => {
    const a = assignSlot(slots(['smelter', null]), 1, 'smelter', 2);
    expect(ids(a, 2)).toEqual(['smelter', 'smelter']);
    expect(cfg(a, 2)).toEqual([-1, 2]);
    expect(slotOf(a, 'smelter', 2)).toBe(1);
    expect(slotOf(a, 'smelter')).toBe(0);
    expect(slotOf(a, 'smelter', 5)).toBe(-1);
  });

  it('a Smelter on Steel and a Smelter on Lead may stand side by side, the same pair has one slot', () => {
    let a = assignSlot(slots([]), 0, 'smelter', 1);
    a = assignSlot(a, 1, 'smelter', 2);
    expect(ids(a, 2)).toEqual(['smelter', 'smelter']);
    a = assignSlot(a, 3, 'smelter', 1);
    expect(ids(a, 4)).toEqual([null, 'smelter', null, 'smelter']);
    expect(cfg(a, 4)).toEqual([-1, 2, -1, 1]);
  });

  it('swapping and emptying take the setting along', () => {
    const a = assignSlot(slots(['x', null]), 1, 'sorter', 4);
    const b = swapSlots(a, 0, 1);
    expect(ids(b, 2)).toEqual(['sorter', 'x']);
    expect(cfg(b, 2)).toEqual([4, -1]);
    expect(cfg(assignSlot(b, 0, null), 1)).toEqual([-1]);
  });

  it('Q puts a configured pick into its own slot, else the first empty one', () => {
    const a = slots(['smelter', null, 'smelter'], [-1, -1, 3]);
    expect(slotForPick(a, 'smelter', 3, 5, 0)).toBe(2);
    expect(slotForPick(a, 'smelter', 1, 5, 0)).toBe(1);
    expect(slotForPick(a, 'smelter', -1, 5, 2)).toBe(0);
  });
});

describe('palette store parsing', () => {
  it('falls back to defaults on broken data and clamps values', () => {
    expect(parsePalette(null)).toEqual(DEFAULT_PALETTE);
    expect(parsePalette('{nope')).toEqual(DEFAULT_PALETTE);
    const p = parsePalette(JSON.stringify({ hotbar: false, slots: 99, assigned: ['a', 3] }));
    expect(p.hotbar).toBe(false);
    expect(p.slots).toBe(10);
    expect(p.assigned.slice(0, 3)).toEqual(['a', null, null]);
  });

  it('reads old data without settings as plain buildings, and keeps the settings of new data', () => {
    expect(parsePalette(JSON.stringify({ assigned: ['smelter', 'sorter'] })).configs.every((c) => c === -1)).toBe(true);
    const p = parsePalette(JSON.stringify({ assigned: ['smelter', null, 'sorter'], configs: [2, 5, 7, 'x'] }));
    expect(p.configs.slice(0, 4)).toEqual([2, -1, 7, -1]);
  });

  it('the store saves a slot with its setting', () => {
    paletteStore.assign(8, 'smelter', 2);
    expect(paletteStore.get().assigned[8]).toBe('smelter');
    expect(paletteStore.get().configs[8]).toBe(2);
    paletteStore.assign(8, null);
    expect(paletteStore.get().configs[8]).toBe(-1);
  });
});

describe('what a setting looks like', () => {
  const smelter = content.buildings.get('smelter');
  const sorter = content.buildings.get('sorter');
  const drill = content.buildings.get('mechanical-drill');

  it('a recipe shows its main product', () => {
    const m = settingMark(content, smelter, 1);
    const recipe = content.recipes.get(smelter.recipes![1]!);
    expect(m?.name).toBe(recipe.name);
    expect(m?.item?.id).toBe(recipe.outputs[0]!.item);
  });

  it('a sorter shows its item, none shows nothing', () => {
    const lead = content.materials.indexOf('lead-ore');
    expect(settingMark(content, sorter, lead)?.item?.id).toBe('lead-ore');
    expect(settingMark(content, sorter, -1)).toBeNull();
    expect(settingMark(content, sorter, 9999)).toBeNull();
  });

  it('only recipes, sorter and unloader items are kept; a drill keeps nothing', () => {
    expect(keptSetting(smelter, 1)).toBe(1);
    expect(keptSetting(sorter, 3)).toBe(3);
    expect(keptSetting(drill, 3)).toBe(-1);
    expect(keptSetting(smelter, -1)).toBe(-1);
    expect(settingMark(content, drill, 3)).toBeNull();
  });
});
