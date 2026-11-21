import { useEffect } from 'react';
import { MOTION } from '../motion';
import { placeTip, type TipSide } from './tip-place';

/**
 * The kit tooltip (kit.css "Tooltip"): ONE shared element for the whole UI instead of the browser's title=.
 * Any element with `data-tip="Text"` gets it on mouse hover (after a short delay; at once while another tip was
 * just open) and on keyboard focus. Optional: `data-tip-keys="Ctrl+Z"` (key caps), `data-tip-side="bottom"`
 * (preferred side; it flips and stays inside the screen). Icon buttons (`.icon-button[aria-label]`) show their label.
 * A plain `title=` anywhere is converted into `data-tip` on the fly, so old code gets the kit look too.
 * Disabled buttons show their tip too, unless a stylesheet gives them `pointer-events: none`.
 * Mounted once by App (<TipLayer />). Touch shows nothing (there is no hover); the text stays readable to screen
 * readers through aria-describedby while it shows, and aria-description for converted titles.
 */
export function tip(text: string, opts: { keys?: string; side?: TipSide } = {}): Record<string, string> {
  const attrs: Record<string, string> = { 'data-tip': text };
  if (opts.keys) attrs['data-tip-keys'] = opts.keys;
  if (opts.side) attrs['data-tip-side'] = opts.side;
  return attrs;
}

const ANCHOR = '[data-tip], .icon-button[aria-label]';
const TIP_ID = 'k-tip';
const WARM_MS = 450;
const FOCUS_DELAY_MS = 120;
const SIDES: readonly TipSide[] = ['top', 'bottom', 'left', 'right'];

function anchorOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(ANCHOR) : null;
}

function textOf(a: HTMLElement): string {
  return (a.dataset.tip ?? a.getAttribute('aria-label') ?? '').trim();
}

function sideOf(a: HTMLElement): TipSide {
  const s = a.dataset.tipSide as TipSide | undefined;
  return s && SIDES.includes(s) ? s : 'top';
}

/** title= -> data-tip (and aria-description), so the browser's own tooltip never shows. */
function convertTitle(el: Element): void {
  const t = el.getAttribute('title');
  if (t === null || !(el instanceof HTMLElement)) return;
  el.removeAttribute('title');
  if (!t) return;
  el.dataset.tip = t;
  el.setAttribute('aria-description', t);
}

function buildTip(): { root: HTMLDivElement; text: HTMLSpanElement; keys: HTMLSpanElement } {
  const root = document.createElement('div');
  root.className = 'k-tip';
  root.id = TIP_ID;
  root.setAttribute('role', 'tooltip');
  root.dataset.state = 'hidden';
  const text = document.createElement('span');
  text.className = 'k-tip-text';
  const keys = document.createElement('span');
  keys.className = 'k-tip-keys';
  root.append(text, keys);
  return { root, text, keys };
}

function fillKeys(box: HTMLElement, keys: string | undefined): void {
  box.replaceChildren();
  box.hidden = !keys;
  if (!keys) return;
  keys.split('+').forEach((k, i) => {
    if (i > 0) box.append('+');
    const cap = document.createElement('kbd');
    cap.textContent = k.trim();
    box.append(cap);
  });
}

class Tips {
  private ui = buildTip();
  private anchor: HTMLElement | null = null;
  private shown = false;
  private suppressed: HTMLElement | null = null;
  private timer = 0;
  private watch = 0;
  private lastHide = -Infinity;
  private describedBy = false;

  install(): () => void {
    document.body.append(this.ui.root);
    document.querySelectorAll('[title]').forEach(convertTitle);
    const obs = new MutationObserver((list) => this.onMutations(list));
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['title'] });
    const on: [string, EventListener, AddEventListenerOptions?][] = [
      ['pointerover', this.onOver as EventListener],
      ['pointerout', this.onOut as EventListener],
      ['pointerdown', this.onDown, { capture: true }],
      ['focusin', this.onFocus],
      ['focusout', this.onBlur],
      ['keydown', this.onKey as EventListener],
      ['scroll', this.onDown, { capture: true, passive: true }],
    ];
    for (const [type, fn, opts] of on) document.addEventListener(type, fn, opts);
    window.addEventListener('blur', this.onDown);
    return () => {
      for (const [type, fn, opts] of on) document.removeEventListener(type, fn, opts);
      window.removeEventListener('blur', this.onDown);
      obs.disconnect();
      this.hide();
      this.ui.root.remove();
    };
  }

  private onMutations(list: MutationRecord[]): void {
    let mine = false;
    for (const m of list) {
      convertTitle(m.target as Element);
      mine ||= m.target === this.anchor;
    }
    if (mine && this.shown && this.anchor) this.place(this.anchor);
  }

  private onOver = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') this.over(anchorOf(e.target));
  };

  private over(a: HTMLElement | null): void {
    if (a === this.anchor) return;
    if (a !== this.suppressed) this.suppressed = null;
    if (!a || a === this.suppressed) return this.hide();
    this.schedule(a, performance.now() - this.lastHide < WARM_MS ? 0 : MOTION.tipDelayMs);
  }

  private onOut = (e: PointerEvent): void => {
    if (!e.relatedTarget) this.hide();
  };

  private onDown = (): void => {
    this.suppressed = this.anchor;
    this.hide();
  };

  private onFocus = (e: Event): void => {
    const a = anchorOf(e.target);
    if (a && a === e.target && a.matches(':focus-visible')) this.schedule(a, FOCUS_DELAY_MS);
  };

  private onBlur = (): void => this.hide();

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.hide();
  };

  private schedule(a: HTMLElement, delay: number): void {
    this.hide();
    this.anchor = a;
    this.timer = window.setTimeout(() => this.show(a), delay);
  }

  private show(a: HTMLElement): void {
    if (!a.isConnected || !textOf(a)) return;
    this.place(a);
    this.shown = true;
    this.ui.root.dataset.state = 'open';
    if (!a.hasAttribute('aria-describedby')) {
      a.setAttribute('aria-describedby', TIP_ID);
      this.describedBy = true;
    }
    this.watch = window.setInterval(() => {
      if (!a.isConnected) this.hide();
    }, 300);
  }

  /** Text, keys and position: one layout read of the anchor and the tip per call (on show, or a changed title). */
  private place(a: HTMLElement): void {
    const { root, text, keys } = this.ui;
    text.textContent = textOf(a);
    fillKeys(keys, a.dataset.tipKeys);
    const r = a.getBoundingClientRect();
    const p = placeTip(sideOf(a), r, root.offsetWidth, root.offsetHeight, window.innerWidth, window.innerHeight);
    root.dataset.side = p.side;
    root.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
    root.style.setProperty('--tip-arrow', `${Math.round(p.arrow)}px`);
  }

  private hide(): void {
    window.clearTimeout(this.timer);
    window.clearInterval(this.watch);
    if (this.shown) this.lastHide = performance.now();
    if (this.describedBy && this.anchor) this.anchor.removeAttribute('aria-describedby');
    this.describedBy = false;
    this.shown = false;
    this.anchor = null;
    this.ui.root.dataset.state = 'hidden';
  }
}

/** Mount once near the root (App does): installs the shared tooltip for the whole page. */
export function TipLayer() {
  useEffect(() => new Tips().install(), []);
  return null;
}
