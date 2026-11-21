import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdToasts, pushToast, toastStore } from './toasts';

describe('notices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => {
    holdToasts(false);
    vi.runAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a notice leaves by itself', () => {
    pushToast({ kind: 'order', text: 'Order done: Drill for copper' });
    expect(toastStore.get()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(toastStore.get()).toHaveLength(0);
  });

  it('one payout notice at a time, but several order notices', () => {
    pushToast({ kind: 'points', text: '+1 Blueprint' });
    pushToast({ kind: 'points', text: '+2 Blueprints' });
    pushToast({ kind: 'order', text: 'a' });
    pushToast({ kind: 'order', text: 'b' });
    expect(toastStore.get().map((t) => t.text)).toEqual(['+2 Blueprints', 'a', 'b']);
  });

  it('while held, a notice stays past its time, and shows again for a moment once let go', () => {
    pushToast({ kind: 'order', text: 'Order done' });
    holdToasts(true);
    vi.advanceTimersByTime(20_000);
    expect(toastStore.get()).toHaveLength(1);
    holdToasts(false);
    vi.advanceTimersByTime(1000);
    expect(toastStore.get()).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(toastStore.get()).toHaveLength(0);
  });
});
