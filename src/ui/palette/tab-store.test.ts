import { describe, expect, it } from 'vitest';
import { getPaletteTab, setPaletteTab } from './tab-store';

describe('the palette tab', () => {
  it('starts on Mining and keeps what was chosen, whoever draws the palette', () => {
    expect(getPaletteTab()).toBe('mining');
    setPaletteTab('logistics');
    expect(getPaletteTab()).toBe('logistics');
    setPaletteTab('mining');
  });
});
