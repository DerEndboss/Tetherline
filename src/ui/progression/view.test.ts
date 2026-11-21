import { describe, expect, it } from 'vitest';
import { clock, currencyName, plural, savedWhen, stamp } from './view';

describe('progression view helpers', () => {
  it('counts nouns with the right plural', () => {
    expect(plural(0, 'order')).toBe('0 orders');
    expect(plural(1, 'building')).toBe('1 building');
    expect(plural(12, 'building')).toBe('12 buildings');
    expect(plural(2, 'story', 'stories')).toBe('2 stories');
  });

  it('prints sim time as minutes and seconds', () => {
    expect(stamp(0, 20)).toBe('0:00');
    expect(stamp(20 * 67, 20)).toBe('1:07');
    expect(stamp(20 * 600 + 19, 20)).toBe('10:00');
    expect(stamp(-5, 20)).toBe('0:00');
  });

  it('prints play time in hours and minutes', () => {
    expect(clock(42 * 60)).toBe('42 min');
    expect(clock(65 * 60)).toBe('1 h 05 min');
  });

  it('names the currency in the singular for one', () => {
    expect(currencyName(0, 'Blueprints')).toBe('Blueprints');
    expect(currencyName(1, 'Blueprints')).toBe('Blueprint');
    expect(currencyName(2, 'Blueprints')).toBe('Blueprints');
  });

  it('prints no time for a save that never happened', () => {
    expect(savedWhen(0)).toBe('');
    expect(savedWhen(Date.UTC(2026, 10, 20, 12, 0))).toMatch(/Nov/);
  });
});
