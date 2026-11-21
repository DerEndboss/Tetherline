import { describe, expect, it } from 'vitest';
import { SPEEDS } from '../../settings/preferences';
import { speedKey, speedLabel, stepSpeed } from './speed';

describe('stepSpeed', () => {
  it('walks through the speeds the settings offer', () => {
    let s: number = SPEEDS[0] ?? 1;
    const seen: number[] = [s];
    for (let i = 1; i < SPEEDS.length; i++) {
      s = stepSpeed(s, 1, false);
      seen.push(s);
    }
    expect(seen).toEqual([...SPEEDS]);
  });

  it('a click wraps from the fastest back to 1x and from 1x to the fastest when going down', () => {
    expect(stepSpeed(10, 1, true)).toBe(1);
    expect(stepSpeed(1, -1, true)).toBe(10);
  });

  it('the keys stop at the ends', () => {
    expect(stepSpeed(10, 1, false)).toBe(10);
    expect(stepSpeed(1, -1, false)).toBe(1);
  });

  it('a speed that is not in the list counts as the one below it', () => {
    expect(stepSpeed(4, 1, false)).toBe(5);
    expect(stepSpeed(4, -1, false)).toBe(2);
  });

  it('works on a custom list', () => {
    expect(stepSpeed(2, 1, false, [1, 2, 3, 5])).toBe(3);
  });
});

describe('speedKey', () => {
  const key = (code: string, mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it('period is faster, comma is slower', () => {
    expect(speedKey(key('Period'))).toBe(1);
    expect(speedKey(key('Comma'))).toBe(-1);
  });
  it('leaves the zoom keys and shortcuts alone', () => {
    expect(speedKey(key('Equal'))).toBeNull();
    expect(speedKey(key('Minus'))).toBeNull();
    expect(speedKey(key('Period', { ctrlKey: true }))).toBeNull();
    expect(speedKey(key('Comma', { metaKey: true }))).toBeNull();
  });
});

describe('speedLabel', () => {
  it('prints the speed', () => {
    expect(speedLabel(5)).toBe('5x');
  });
});
