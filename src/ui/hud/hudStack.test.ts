import { describe, expect, it } from 'vitest';
import { STACK_QUERIES, STACK_SLOTS, pickMode, slotValue } from './hudStack';

const query = (mode: string) => STACK_QUERIES.find(([m]) => m === mode)?.[1] ?? '';

describe('hud stack', () => {
  it('writes whole, non-negative px', () => {
    expect(slotValue(51.6)).toBe('52px');
    expect(slotValue(-3)).toBe('0px');
    expect(slotValue(0)).toBe('0px');
  });

  it('picks the first matching mode, none on a wide screen', () => {
    expect(pickMode(() => false)).toBeNull();
    expect(pickMode(() => true)).toBe('phone');
    expect(pickMode((q) => q === query('landscape') || q === query('narrow'))).toBe('landscape');
    expect(pickMode((q) => q === query('narrow'))).toBe('narrow');
  });

  it('gives every card its own property', () => {
    const props = STACK_SLOTS.flatMap((s) => (s.w ? [s.h, s.w] : [s.h]));
    expect(new Set(props).size).toBe(props.length);
    expect(props.every((p) => p.startsWith('--ph-'))).toBe(true);
  });
});
