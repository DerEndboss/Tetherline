import { describe, expect, it, vi } from 'vitest';
import { Counter, shouldPop } from './AnimatedNumber';
import { mergeLeaving, nextLeaving } from './presence-list';

describe('presence list', () => {
  const key = (t: { k: number }) => t.k;
  it('keeps a removed item at its old place until it has left', () => {
    const a = { k: 1 };
    const b = { k: 2 };
    const c = { k: 3 };
    const leaving = nextLeaving([a, b, c], [a, c], [], key);
    expect(leaving).toEqual([{ key: 2, item: b, at: 1 }]);
    const drawn = mergeLeaving([a, c], leaving, key);
    expect(drawn.map((e) => [e.key, e.leaving])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ]);
  });

  it('drops a leaving item that comes back', () => {
    const a = { k: 1 };
    const leaving = nextLeaving([a], [], [], key);
    expect(nextLeaving([], [a], leaving, key)).toEqual([]);
  });
});

describe('shouldPop', () => {
  it('pops a jump, not a trickle', () => {
    expect(shouldPop(300, 400, 'up', 0.04)).toBe(true);
    expect(shouldPop(3000, 3010, 'up', 0.04)).toBe(false);
    expect(shouldPop(0, 1, 'up', 0.04)).toBe(true);
  });
  it('respects the direction', () => {
    expect(shouldPop(400, 300, 'up', 0.04)).toBe(false);
    expect(shouldPop(400, 300, 'down', 0.04)).toBe(true);
    expect(shouldPop(400, 300, 'both', 0.04)).toBe(true);
    expect(shouldPop(400, 300, 'none', 0.04)).toBe(false);
  });
});

describe('Counter', () => {
  it('counts to the new value on animation frames and lands exactly', () => {
    const frames: ((t: number) => void)[] = [];
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (fn: (t: number) => void) => frames.push(fn));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const el = { textContent: '', dataset: {} } as unknown as HTMLElement;
    const c = new Counter(el, 100, (n) => String(Math.floor(n)));
    expect(el.textContent).toBe('100');
    c.set(200, true);
    const seen: string[] = [];
    while (frames.length) {
      now += 50;
      frames.shift()!(now);
      seen.push(el.textContent ?? '');
    }
    expect(seen.at(-1)).toBe('200');
    expect(seen.length).toBeGreaterThan(3);
    expect(Number(seen[1])).toBeGreaterThan(100);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
