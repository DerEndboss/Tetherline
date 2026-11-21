import { useEffect, useRef } from 'react';
import type { Spot } from './spots';
import { boxOf, hudCovers, place, type Placement, type ScreenBox, type TutorialView } from './view';

/** How far from the screen edge an off-screen marker sits; the HUD pieces in the way are stepped around (view.ts `clearOf`). */
const INSET = { left: 48, top: 56, right: 48, bottom: 48 };
const MIN_RING = 40;

/** Rounds to half a pixel, so a steady camera writes nothing and a slow one does not write sub-pixel noise. */
const half = (n: number): number => Math.round(n * 2) / 2;

/** The styles of one marker, as strings, so a frame can tell by comparing whether anything needs writing. */
export interface MarkerStyles {
  pos: string;
  off: 'true' | 'false';
  w: string;
  h: string;
  tutH: string;
  pin: string;
}

/** Pure: where the marker goes for a projected spot box (half-pixel rounded). */
export function markerStyles(box: ScreenBox, at: Placement): MarkerStyles {
  const w = half(Math.max(MIN_RING, box.w * 1.05));
  const h = half(Math.max(MIN_RING * 0.6, box.h * 1.05));
  const lift = Math.max(MIN_RING * 0.3, h / 2);
  return {
    pos: `${half(at.x)}px ${half(at.y)}px`,
    off: at.off ? 'true' : 'false',
    w: `${w}px`,
    h: `${h}px`,
    tutH: `${h / 2}px`,
    pin: at.off ? `rotate(${Math.round(at.angle) - 90}deg) translateY(-6px)` : `translateY(${-lift - 6}px)`,
  };
}

/** Writes a style only when its value is not the last one written. */
class Writes {
  private readonly last = new Map<string, string>();
  put(key: string, value: string, apply: () => void): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    apply();
  }
}

/**
 * A ring on the ground around a spot with a bobbing arrow above it and a caption. It follows the camera by
 * writing styles straight to the elements (no React render per frame), and only when a value changed: with a
 * steady camera a frame is a little arithmetic and no style write, no layout. The camera maths is pure
 * (view.screenOfTile), the DOM is never read. When the spot is off screen the marker sits on the screen edge
 * instead, with an arrow turned toward it.
 */
export function SpotMarker({ view, spot, arrow }: { view: TutorialView; spot: Spot; arrow: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const writes = new Writes();
    let frame = 0;
    // on screen a marker needs no layout at all; off screen it asks where the HUD leaves room (at most twice a second)
    const placeAt = (box: ScreenBox): Placement => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const first = place(box, w, h, INSET);
      return first.off ? place(box, w, h, INSET, hudCovers()) : first;
    };
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const el = root.current;
      const r = ring.current;
      const p = pin.current;
      if (!el || !r || !p) return;
      const box = boxOf(view, spot);
      const st = markerStyles(box, placeAt(box));
      writes.put('pos', st.pos, () => (el.style.translate = st.pos));
      writes.put('off', st.off, () => (el.dataset.off = st.off));
      writes.put('w', st.w, () => (r.style.width = st.w));
      writes.put('h', st.h, () => (r.style.height = st.h));
      writes.put('tutH', st.tutH, () => el.style.setProperty('--tut-h', st.tutH));
      writes.put('pin', st.pin, () => (p.style.transform = st.pin));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view, spot]);
  return (
    <div ref={root} className="tut-marker" data-off="false" data-arrow={arrow}>
      <div className="tut-pop k-enter" data-from="pop">
        <div ref={ring} className="tut-ring" />
        <div ref={pin} className="tut-pin">
          <span className="tut-arrow" />
        </div>
        {spot.label && <span className="tut-label">{spot.label}</span>}
      </div>
    </div>
  );
}

interface RingBox {
  l: number;
  t: number;
  w: number;
  h: number;
  side: string;
  show: boolean;
}

const HIDDEN: RingBox = { l: 0, t: 0, w: 0, h: 0, side: 'top', show: false };

/** The HUD piece the ring is on (the entry, else its fallback) and where it is: the one place this file reads layout. */
function measureTarget(primary: string, fallback: string | undefined): { box: RingBox; el: Element | null } {
  const entry = document.querySelector(primary);
  const target = entry ?? (fallback ? document.querySelector(fallback) : null);
  const r = target?.getBoundingClientRect();
  if (!target || !r || r.width === 0) return { box: HIDDEN, el: target };
  const side = entry ? 'top' : r.left < 80 ? 'right' : 'left';
  return { box: { l: half(r.left - 4), t: half(r.top - 4), w: half(r.width + 8), h: half(r.height + 8), side, show: true }, el: target };
}

/** The slow safety net: events and the size watcher below catch the moves, this only the ones nothing announces. */
const SAFETY_MS = 1000;

/** What can move a HUD piece: the window changing, a panel sliding or fading, a click (a tab, a tool), a key (hotkeys switch tabs). */
const movers = (): [Window | Document, string, boolean][] => [
  [window, 'resize', false],
  [document, 'animationend', true],
  [document, 'transitionend', true],
  [document, 'pointerup', true],
  [document, 'keyup', true],
  [document, 'scroll', true],
];

/** Writes the box to the ring element, each value only when it changed. */
function writeRing(ring: HTMLElement, last: RingBox, b: RingBox): void {
  if (b.show !== last.show) {
    ring.dataset.show = String(b.show);
    last.show = b.show;
  }
  if (!b.show) return;
  if (b.l !== last.l || b.t !== last.t) {
    ring.style.translate = `${b.l}px ${b.t}px`;
    last.l = b.l;
    last.t = b.t;
  }
  if (b.w !== last.w || b.h !== last.h) {
    ring.style.width = `${b.w}px`;
    ring.style.height = `${b.h}px`;
    last.w = b.w;
    last.h = b.h;
  }
  if (b.side !== last.side) {
    ring.dataset.side = b.side;
    last.side = b.side;
  }
}

/**
 * A ring around a piece of the HUD (a palette entry, else its tab; a toolbar button), found by selector. Layout is
 * read only when something can have moved it: a window resize, a finished animation, a click or key, a size change
 * of the piece itself (ResizeObserver), and once a second as a net. While the player holds the tool the ring is off
 * and nothing is read at all. A changed value is written once and the ring glides there (a CSS transition).
 * The arrow is left out where the HUD has no free side for it (the tool bar: it would sit on the key hints).
 */
export function UiRing({ primary, fallback, active = true, arrow = true }: { primary: string; fallback?: string; active?: boolean; arrow?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const last: RingBox = { l: NaN, t: NaN, w: NaN, h: NaN, side: '', show: false };
    let queued = 0;
    let watched: Element | null = null;
    const sizes = new ResizeObserver(() => soon());
    const measure = (): void => {
      queued = 0;
      const ring = el.current;
      if (!ring) return;
      const found = active ? measureTarget(primary, fallback) : { box: HIDDEN, el: null };
      if (found.el !== watched) {
        if (watched) sizes.unobserve(watched);
        watched = found.el;
        if (watched) sizes.observe(watched);
      }
      writeRing(ring, last, found.box);
    };
    function soon(): void {
      if (!queued) queued = requestAnimationFrame(measure);
    }
    measure();
    const timer = window.setInterval(measure, SAFETY_MS);
    const events = movers();
    for (const [target, type, capture] of events) target.addEventListener(type, soon, capture);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(queued);
      sizes.disconnect();
      for (const [target, type, capture] of events) target.removeEventListener(type, soon, capture);
    };
  }, [primary, fallback, active]);
  return (
    <div ref={el} className="tut-ui-ring" data-show="false" data-side="top" data-arrow={arrow}>
      <div className="tut-pop tut-ui-pop k-enter" data-from="pop">
        <span className="tut-arrow tut-arrow-ui" />
      </div>
    </div>
  );
}
