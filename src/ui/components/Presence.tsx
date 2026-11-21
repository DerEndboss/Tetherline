import { createElement, useCallback, useEffect, useState, type AnimationEvent, type HTMLAttributes, type ReactNode } from 'react';
import { MOTION, reducedMotion } from '../motion';
import { mergeLeaving, nextLeaving, type Entry, type Key, type Leaving } from './presence-list';

/**
 * Panels that slide in AND out (kit.css "Motion"). While `open` turns false the element stays in the DOM with
 * `data-presence="closing"`, plays its exit animation (shorter than the entry, clicks already pass through) and is
 * removed on `animationend`, or after a fallback timeout. With reduced motion it goes at once.
 */
export type PresenceFrom = 'left' | 'right' | 'up' | 'down' | 'pop' | 'fade';
export type PresenceState = 'open' | 'closing';

export interface PresenceAttrs {
  'data-presence': PresenceState;
  'data-from': PresenceFrom;
  onAnimationEnd: (e: AnimationEvent<HTMLElement>) => void;
}

/** Only the kit's own exit animation on the element itself ends a presence (not a child's, not the entry). */
function isExitEnd(e: AnimationEvent<HTMLElement>): boolean {
  return e.target === e.currentTarget && e.animationName.startsWith('k-out');
}

const FALLBACK_MS = MOTION.exitMs + 90;

/**
 * The hook behind <Presence>: spread `attrs` on the element that should animate, render it while `mounted`.
 *
 *   const { mounted, attrs } = usePresence(open, 'left');
 *   return mounted ? <div className="hud-card dr-panel" {...attrs}>…</div> : null;
 */
export function usePresence(open: boolean, from: PresenceFrom = 'pop'): { mounted: boolean; closing: boolean; attrs: PresenceAttrs } {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!open && mounted && reducedMotion()) setMounted(false);
  const closing = mounted && !open;
  const done = useCallback(() => setMounted(false), []);
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(done, FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [closing, done]);
  const onAnimationEnd = useCallback(
    (e: AnimationEvent<HTMLElement>) => {
      if (isExitEnd(e)) done();
    },
    [done],
  );
  return { mounted: open || mounted, closing, attrs: { 'data-presence': closing ? 'closing' : 'open', 'data-from': from, onAnimationEnd } };
}

type PresenceTag = 'div' | 'section' | 'aside' | 'header' | 'nav' | 'ul' | 'ol' | 'li' | 'p' | 'span';

export interface PresenceProps extends HTMLAttributes<HTMLElement> {
  open: boolean;
  /** Where it comes from: 'left' | 'right' | 'up' (rises from below) | 'down' (drops from above) | 'pop' (dialogs) | 'fade'. */
  from?: PresenceFrom;
  /** The element to render (default 'div'). */
  as?: PresenceTag;
  children?: ReactNode;
}

/**
 * <Presence open={open} from="right" className="hud-card my-panel" role="dialog">…</Presence>
 * Renders the element itself (all other props pass through); nothing once it has left.
 */
export function Presence({ open, from = 'pop', as = 'div', children, onAnimationEnd, ...rest }: PresenceProps) {
  const { mounted, attrs } = usePresence(open, from);
  if (!mounted) return null;
  const end = (e: AnimationEvent<HTMLElement>): void => {
    onAnimationEnd?.(e);
    attrs.onAnimationEnd(e);
  };
  return createElement(as, { ...rest, ...attrs, onAnimationEnd: end }, children);
}

/**
 * The last value that was not null/undefined: keeps a closing panel's content while `selected` is already gone.
 *   const shown = useLastDefined(selected);   <Presence open={!!selected}>{shown && <Details of={shown} />}</Presence>
 */
export function useLastDefined<T>(value: T | null | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value ?? undefined);
  if (value != null && value !== last) setLast(value);
  return value ?? last;
}

export interface PresenceEntry<T> {
  key: Key;
  item: T;
  /** Spread on the item's element: data-presence/data-from and the end handler. */
  attrs: PresenceAttrs;
}

/** Drops leaving keys whose exit is over (animationend or the fallback timer). */
function useLeaving<T>(items: readonly T[], keyOf: (t: T) => Key) {
  const [prev, setPrev] = useState(items);
  const [leaving, setLeaving] = useState<Leaving<T>[]>([]);
  if (prev !== items) {
    setPrev(items);
    setLeaving(reducedMotion() ? [] : nextLeaving(prev, items, leaving, keyOf));
  }
  const finish = useCallback((key: Key) => setLeaving((l) => l.filter((x) => x.key !== key)), []);
  useEffect(() => {
    if (!leaving.length) return;
    const keys = leaving.map((l) => l.key);
    const t = window.setTimeout(() => setLeaving((l) => l.filter((x) => !keys.includes(x.key))), FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);
  return { leaving, finish };
}

/**
 * Lists whose items come and go (toasts, orders): every removed item stays until its exit animation has played.
 *   const entries = usePresenceList(toasts, (t) => t.key, 'down');
 *   entries.map(({ key, item, attrs }) => <p key={key} className="k-toast" {...attrs}>{item.text}</p>)
 */
export function usePresenceList<T>(items: readonly T[], keyOf: (t: T) => Key, from: PresenceFrom = 'pop'): PresenceEntry<T>[] {
  const { leaving, finish } = useLeaving(items, keyOf);
  return mergeLeaving(items, leaving, keyOf).map((e: Entry<T>) => ({
    key: e.key,
    item: e.item,
    attrs: {
      'data-presence': e.leaving ? 'closing' : 'open',
      'data-from': from,
      onAnimationEnd: (ev: AnimationEvent<HTMLElement>) => {
        if (e.leaving && isExitEnd(ev)) finish(e.key);
      },
    },
  }));
}
