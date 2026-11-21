import { useSyncExternalStore } from 'react';
import type { BuildingDef } from '../../content/types';
import { tipDelay } from './tip-logic';

/** Where the palette tooltip hangs: beside an entry (palette, to its left) or above it (quick bar). */
export type TipSide = 'left' | 'top';

export interface TipView {
  def: BuildingDef;
  rect: DOMRect;
  side: TipSide;
}

export interface TipState {
  /** The building the pointer rests on (at once; the info strip reads it). */
  hover: BuildingDef | null;
  /** The tooltip being shown (after the delay). */
  shown: TipView | null;
}

const NONE: TipState = { hover: null, shown: null };

/**
 * Where the tip hangs: beside the whole palette card at the entry's row (so it never covers the entries), or above the
 * whole quick bar at the slot's column. Without a card around the entry, on the entry itself.
 */
export function anchorRect(el: Element, side: TipSide): DOMRect {
  const r = el.getBoundingClientRect();
  const frame = el.closest(side === 'left' ? '.palette' : '.hotbar')?.getBoundingClientRect();
  if (!frame) return r;
  return side === 'left' ? new DOMRect(frame.left, r.top, 0, r.height) : new DOMRect(r.left, frame.top, r.width, 0);
}

/**
 * One tooltip for the palette and the quick bar. Entries tell it when the mouse comes, goes or presses; the layer
 * (BuildTipLayer) draws what `shown` says. A cold tip waits a beat, a warm one is at once, so sweeping over the grid
 * feels alive and a plain pass does not flash. A press hides it until the pointer has left and come back.
 */
class TipStore {
  private state: TipState = NONE;
  private readonly listeners = new Set<() => void>();
  private anchor: Element | null = null;
  private suppressed: Element | null = null;
  private timer = 0;
  private lastHide = -Infinity;

  get = (): TipState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(next: TipState): void {
    if (next.hover === this.state.hover && next.shown === this.state.shown) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** The pointer (or keyboard focus) came onto an entry. */
  enter(def: BuildingDef, el: HTMLElement, side: TipSide, delayed = true): void {
    window.clearTimeout(this.timer);
    this.anchor = el;
    this.set({ ...this.state, hover: def });
    if (this.suppressed === el) return;
    this.suppressed = null;
    const show = (): void => {
      if (this.anchor === el && el.isConnected) this.set({ hover: def, shown: { def, rect: anchorRect(el, side), side } });
    };
    const wait = this.state.shown || !delayed ? 0 : tipDelay(performance.now(), this.lastHide);
    if (wait === 0) show();
    else this.timer = window.setTimeout(show, wait);
  }

  /** Gone from the entry (if it is still the current one). */
  leave(el: Element): void {
    if (this.anchor !== el) return;
    this.anchor = null;
    this.suppressed = null;
    this.hideTip();
    this.set({ ...this.state, hover: null });
  }

  /** A press or a drag start: the tip goes and stays away until the pointer comes back. */
  press(el: Element): void {
    this.suppressed = el;
    this.hideTip();
  }

  /** Escape, a scroll or a press elsewhere: the tooltip goes, the hover (the cost strip) stays. */
  dismiss(): void {
    this.hideTip();
  }

  /** Forgets everything (the entry the tip hung on is gone). */
  reset(): void {
    window.clearTimeout(this.timer);
    this.anchor = null;
    this.suppressed = null;
    this.set(NONE);
  }

  private hideTip(): void {
    window.clearTimeout(this.timer);
    if (this.state.shown) this.lastHide = performance.now();
    this.set({ ...this.state, shown: null });
  }
}

export const tipStore = new TipStore();

export function useTip(): TipState {
  return useSyncExternalStore(tipStore.subscribe, tipStore.get, () => NONE);
}
