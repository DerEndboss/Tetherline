import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { formatShort } from '../format';
import { flash, reducedMotion } from '../motion';

type Format = (n: number) => string;
export type PopMode = 'up' | 'down' | 'both' | 'none';

const TWEEN_MS = 420;
const POP_GAP_MS = 700;

/** Whether a change from `from` to `to` earns a pop: in the wanted direction and big enough (`popAt` of the old value, at least 1). */
export function shouldPop(from: number, to: number, mode: PopMode, popAt: number): boolean {
  const d = to - from;
  if (d === 0 || mode === 'none') return false;
  if (mode === 'up' && d < 0) return false;
  if (mode === 'down' && d > 0) return false;
  return Math.abs(d) >= Math.max(1, Math.abs(from) * popAt);
}

/** Counts the text of one element towards a target on requestAnimationFrame; only while it moves. */
export class Counter {
  shown: number;
  private from = 0;
  private to = 0;
  private start = 0;
  private raf = 0;
  private lastPop = -Infinity;
  private lastText = '';

  constructor(
    private el: HTMLElement,
    value: number,
    private format: Format,
  ) {
    this.shown = value;
    this.write(value);
  }

  setFormat(format: Format): void {
    this.format = format;
  }

  set(value: number, tween: boolean): void {
    if (value === this.to && this.raf) return;
    this.from = this.shown;
    this.to = value;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.from === value || !tween || reducedMotion() || !Number.isFinite(this.from)) return this.jump(value);
    this.start = performance.now();
    this.raf = requestAnimationFrame(this.step);
  }

  pop(from: number, to: number, mode: PopMode, popAt: number): void {
    const now = performance.now();
    if (now - this.lastPop < POP_GAP_MS || !shouldPop(from, to, mode, popAt)) return;
    this.lastPop = now;
    flash(this.el, to > from ? 'up' : 'down');
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private jump(value: number): void {
    this.shown = value;
    this.write(value);
  }

  private step = (now: number): void => {
    const t = Math.min(1, (now - this.start) / TWEEN_MS);
    const eased = 1 - (1 - t) ** 3;
    this.shown = this.from + (this.to - this.from) * eased;
    this.write(t === 1 ? this.to : this.shown);
    this.raf = t === 1 ? 0 : requestAnimationFrame(this.step);
  };

  private write(n: number): void {
    const text = this.format(n);
    if (text === this.lastText) return;
    this.lastText = text;
    this.el.textContent = text;
  }
}

export interface AnimatedNumberProps {
  value: number;
  /** How to print it (default formatShort: 950, 1.3k, 4.5M). Keep it stable or not, both work. */
  format?: Format;
  /** Count from the old value to the new one (default true). */
  tween?: boolean;
  /** Pop on a change in this direction (default 'up'); at most every 0.7 s. */
  pop?: PopMode;
  /** Only changes of at least this share of the old value pop (default 0.04 = 4 %), so a steady trickle stays calm. */
  popAt?: number;
  className?: string;
}

/**
 * A number that counts to its new value and pops when it jumps. It writes its own text (no React render per
 * frame, requestAnimationFrame only while counting). Reduced motion: the new value at once, no pop.
 *   <AnimatedNumber value={credits} pop="both" className="resource-amount" />
 */
export function AnimatedNumber({ value, format = formatShort, tween = true, pop = 'up', popAt = 0.04, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const counter = useRef<Counter | null>(null);
  const formatRef = useRef(format);
  useLayoutEffect(() => {
    formatRef.current = format;
    counter.current?.setFormat(format);
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = counter.current ?? new Counter(el, value, formatRef.current);
    counter.current = c;
    const from = c.shown;
    c.set(value, tween);
    c.pop(from, value, pop, popAt);
  }, [value, tween, pop, popAt]);
  useEffect(
    () => () => {
      counter.current?.dispose();
      counter.current = null;
    },
    [],
  );
  return <span ref={ref} className={className ? `k-num num ${className}` : 'k-num num'} />;
}

/**
 * The same pop for an element that prints its own number (or anything countable): flashes `ref` when `value` jumps.
 *   const ref = useRef<HTMLSpanElement>(null); useFlashOnChange(ref, stored);   <span ref={ref} className="k-num">…</span>
 */
export function useFlashOnChange(ref: RefObject<HTMLElement | null>, value: number, pop: PopMode = 'up', popAt = 0.04): void {
  const last = useRef(value);
  useEffect(() => {
    const from = last.current;
    last.current = value;
    if (ref.current && shouldPop(from, value, pop, popAt)) flash(ref.current, value > from ? 'up' : 'down');
  }, [ref, value, pop, popAt]);
}
