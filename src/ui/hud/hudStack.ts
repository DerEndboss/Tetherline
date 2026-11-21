import { useEffect } from 'react';

/**
 * The HUD stack on small screens Each HUD module draws its own cards, but on a phone or a narrow tablet they
 * must share one layout instead of every module guessing a fixed top: orders, core, tutorial card and radio flow from
 * the top, the palette and the quick bar row sit at the bottom, notices float in the open map between (hud-stack.css).
 *
 * CSS cannot know how tall another module's card is, so this hook watches the cards with a ResizeObserver (it fires on a
 * size change only, never per frame, and hands over the border box without a layout read) and writes their sizes as
 * custom properties on <html>. A MutationObserver notices cards that come and go and looks them up again at most once
 * per frame. <html data-hud-stack="phone|landscape|narrow"> switches the layout rules on.
 */
export type StackMode = 'phone' | 'landscape' | 'narrow';

/** First match wins. Phone: portrait up to the palette's phone width (palette/phone.ts). Landscape: a phone on its side. */
export const STACK_QUERIES: ReadonlyArray<readonly [StackMode, string]> = [
  ['phone', '(max-width: 640px) and (min-height: 521px)'],
  ['landscape', '(max-height: 520px) and (max-width: 960px)'],
  ['narrow', '(max-width: 900px)'],
];

interface Slot {
  selector: string;
  /** Custom property for the border-box height. */
  h: string;
  /** Custom property for the border-box width, where a layout needs it. */
  w?: string;
}

/** The cards of the stack; a property reads 0px while its card is not there. */
export const STACK_SLOTS: readonly Slot[] = [
  { selector: '.hud .orders', h: '--ph-orders-h' },
  { selector: '.hud .resources', h: '--ph-core-h' },
  { selector: '.tut-card', h: '--ph-tut-h' },
  { selector: '.hud .radio-stack', h: '--ph-radio-h' },
  { selector: '.hud .hotbar', h: '--ph-hot-h' },
  { selector: '.hud .palette', h: '--ph-pal-h', w: '--ph-pal-w' },
];

/** The value written for one size: whole px, so sub-pixel jitter never rewrites the property. */
export function slotValue(size: number): string {
  return `${Math.max(0, Math.round(size))}px`;
}

/** The stack mode for a set of media matches (pure, for tests): the first query that matches. */
export function pickMode(matches: (query: string) => boolean): StackMode | null {
  for (const [mode, query] of STACK_QUERIES) if (matches(query)) return mode;
  return null;
}

function borderBox(entry: ResizeObserverEntry): { w: number; h: number } {
  const box = entry.borderBoxSize[0];
  return box ? { w: box.inlineSize, h: box.blockSize } : { w: entry.contentRect.width, h: entry.contentRect.height };
}

class StackMeter {
  private readonly root = document.documentElement;
  private readonly bound = new Map<string, Element | null>();
  private readonly slotOf = new WeakMap<Element, Slot>();
  private readonly written = new Map<string, string>();
  private readonly sizes = new ResizeObserver((entries) => this.onResize(entries));
  private readonly dom = new MutationObserver(() => this.schedule());
  private frame = 0;

  start(): void {
    this.dom.observe(document.body, { childList: true, subtree: true });
    this.rebind();
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.dom.disconnect();
    this.sizes.disconnect();
    for (const prop of this.written.keys()) this.root.style.removeProperty(prop);
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.rebind();
    });
  }

  /** Looks the cards up again; only a card that changed identity is (un)observed. */
  private rebind(): void {
    for (const slot of STACK_SLOTS) {
      const el = document.querySelector(slot.selector);
      if (this.bound.has(slot.selector) && el === this.bound.get(slot.selector)) continue;
      const old = this.bound.get(slot.selector);
      if (old) this.sizes.unobserve(old);
      this.bound.set(slot.selector, el);
      if (el) {
        this.slotOf.set(el, slot);
        this.sizes.observe(el, { box: 'border-box' });
      } else this.writeSlot(slot, { w: 0, h: 0 });
    }
  }

  private onResize(entries: ResizeObserverEntry[]): void {
    for (const entry of entries) {
      const slot = this.slotOf.get(entry.target);
      if (slot && entry.target.isConnected) this.writeSlot(slot, borderBox(entry));
    }
  }

  private writeSlot(slot: Slot, size: { w: number; h: number }): void {
    this.write(slot.h, size.h);
    if (slot.w) this.write(slot.w, size.w);
  }

  private write(prop: string, size: number): void {
    const value = slotValue(size);
    if (this.written.get(prop) === value) return;
    this.written.set(prop, value);
    this.root.style.setProperty(prop, value);
  }
}

/** Switches the stack on while the screen is small (see STACK_QUERIES) and keeps <html data-hud-stack> current. */
export function useHudStack(): void {
  useEffect(() => {
    const root = document.documentElement;
    const lists = new Map(STACK_QUERIES.map(([, query]) => [query, window.matchMedia(query)]));
    let meter: StackMeter | null = null;
    const sync = () => {
      const mode = pickMode((query) => lists.get(query)?.matches ?? false);
      if (mode) root.dataset.hudStack = mode;
      else delete root.dataset.hudStack;
      if (mode && !meter) {
        meter = new StackMeter();
        meter.start();
      } else if (!mode && meter) {
        meter.stop();
        meter = null;
      }
    };
    sync();
    for (const l of lists.values()) l.addEventListener('change', sync);
    return () => {
      for (const l of lists.values()) l.removeEventListener('change', sync);
      meter?.stop();
      delete root.dataset.hudStack;
    };
  }, []);
}
