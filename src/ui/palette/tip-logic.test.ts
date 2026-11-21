import { describe, expect, it } from 'vitest';
import { TIP_DELAY_MS, TIP_WARM_MS, tipDelay } from './tip-logic';

describe('tipDelay', () => {
  it('waits for a cold tip', () => {
    expect(tipDelay(10_000, -Infinity)).toBe(TIP_DELAY_MS);
    expect(tipDelay(10_000, 10_000 - TIP_WARM_MS)).toBe(TIP_DELAY_MS);
  });
  it('shows at once while another tip just closed', () => {
    expect(tipDelay(10_000, 9_900)).toBe(0);
    expect(tipDelay(10_000, 10_000 - TIP_WARM_MS + 1)).toBe(0);
  });
});
