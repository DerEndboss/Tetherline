/**
 * Reduced motion as the player chose it in Settings (or as the device says, by default). main.tsx writes the
 * choice to `html[data-motion]`; UI code reads it here instead of asking the browser's media query, so the
 * in-game switch wins over the system setting.
 */
export function reducedMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce';
}

/**
 * The motion tokens of tokens.css as numbers, for code that has to wait for an animation (keep them in step).
 * `exitMs` is --dur-exit: how long a panel takes to leave before it is removed from the DOM.
 */
export const MOTION = {
  microMs: 120,
  enterMs: 220,
  exitMs: 150,
  tipDelayMs: 420,
} as const;

export type FlashKind = 'up' | 'down';

/**
 * A short pop on any element (a number that changed, a slot that got filled): a quick scale with the kit's
 * overshoot, transform only. Sets `data-trend="up|down"` for ~600 ms so CSS can tint it (kit.css `.k-num`).
 * Does nothing with reduced motion. Inline elements need `display: inline-block` (`.k-num` has it).
 */
export function flash(el: HTMLElement, kind: FlashKind = 'up'): void {
  if (reducedMotion() || typeof el.animate !== 'function') return;
  el.dataset.trend = kind;
  const lift = kind === 'up' ? 'translateY(-2px) scale(1.14)' : 'translateY(1px) scale(0.92)';
  const anim = el.animate([{ transform: 'none' }, { transform: lift, offset: 0.35 }, { transform: 'none' }], {
    duration: 360,
    easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
  });
  anim.onfinish = () => {
    window.setTimeout(() => {
      if (el.dataset.trend === kind) delete el.dataset.trend;
    }, 260);
  };
}
