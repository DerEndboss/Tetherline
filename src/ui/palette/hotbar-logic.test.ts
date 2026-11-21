import { describe, expect, it } from 'vitest';
import { assignSlot, slotCap, slotForPick, slotLabel, slotOfKey, swapSlots, visibleSlots } from './hotbar-logic';
import { DEFAULT_PALETTE, parsePalette } from './store';

describe('hotbar slots', () => {
  it('fits the slot count to the width and never above the setting', () => {
    expect(slotCap(390)).toBe(5);
    expect(slotCap(1024)).toBe(8);
    expect(slotCap(1920)).toBe(10);
    expect(visibleSlots(8, 1920)).toBe(8);
    expect(visibleSlots(10, 390)).toBe(5);
    expect(visibleSlots(99, 1920)).toBe(10);
    expect(visibleSlots(1, 1920)).toBe(5);
  });

  it('maps keys 1-9 and 0 to slots', () => {
    expect(slotOfKey('Digit1')).toBe(0);
    expect(slotOfKey('Digit9')).toBe(8);
    expect(slotOfKey('Digit0')).toBe(9);
    expect(slotOfKey('KeyQ')).toBeNull();
    expect([0, 8, 9].map(slotLabel)).toEqual(['1', '9', '0']);
  });

  it('keeps a building in one slot and swaps slots', () => {
    const a = assignSlot(['x', 'y', null], 2, 'x');
    expect(a.slice(0, 3)).toEqual([null, 'y', 'x']);
    expect(swapSlots(a, 1, 2).slice(0, 3)).toEqual([null, 'x', 'y']);
    expect(assignSlot(a, 1, null)[1]).toBeNull();
  });

  it('picks the own slot, then the first empty one, then the active one', () => {
    expect(slotForPick(['a', 'b'], 'b', 5, 0)).toBe(1);
    expect(slotForPick(['a', null, 'c'], 'z', 5, 0)).toBe(1);
    expect(slotForPick(['a', 'b', 'c', 'd', 'e'], 'z', 5, 3)).toBe(3);
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
});
