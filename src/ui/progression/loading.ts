/**
 * The loading screen: a minimal bar that keeps moving while the page works.
 * It is plain DOM, not React, so it can appear before the work starts and survive a reload (`persist`): the
 * moving parts are CSS transform animations, which the compositor keeps smooth while the main thread is busy.
 */
const FLAG = 'groundbreak.loading';
const MIN_MS = 450;
const GIVE_UP_MS = 20_000;

let el: HTMLElement | null = null;
let shownAt = 0;

function store(label: string | null): void {
  try {
    if (label === null) window.sessionStorage.removeItem(FLAG);
    else window.sessionStorage.setItem(FLAG, label);
  } catch {
    // no storage: the screen simply does not survive the reload
  }
}

/** The game's mark, as plain markup (this screen is not React): a hex plaque with the drill arrow (see icons.tsx Emblem). */
const EMBLEM =
  '<svg class="emblem" width="64" height="64" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path class="emblem-hex" d="M24 3.5 41.5 13.5v21L24 44.5 6.5 34.5v-21L24 3.5Z"/><path class="emblem-rim" d="M24 3.5 41.5 13.5v21L24 44.5 6.5 34.5v-21L24 3.5Z"/><path class="emblem-mark" d="M24 13v14.5m-6.5-6.5 6.5 6.5 6.5-6.5M15 34h18"/></svg>';

function build(label: string, instant: boolean): HTMLElement {
  const root = document.createElement('div');
  root.className = instant ? 'loading loading-instant' : 'loading';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `<div class="loading-box"><div class="loading-mark-wrap"><span class="loading-ring" aria-hidden="true"></span>${EMBLEM}</div><p class="loading-mark">Tetherline</p><div class="loading-bar"><span class="loading-fill"></span><span class="loading-shine"></span></div><p class="loading-label"></p></div>`;
  root.querySelector('.loading-label')!.textContent = label;
  return root;
}

/**
 * Shows the screen with a label; `fraction` (0..1) sets how full the bar is (it eases there). It fades in, unless
 * `instant` (a page that just reloaded for it: the screen must look like the one that was there before).
 */
export function showLoading(label: string, fraction = 0.12, persist = false, instant = false): void {
  if (persist) store(label);
  if (!el) {
    el = build(label, instant);
    document.body.append(el);
    shownAt = performance.now();
  }
  setLoading(label, fraction);
}

export function setLoading(label: string, fraction: number): void {
  if (!el) return;
  el.querySelector('.loading-label')!.textContent = label;
  (el.querySelector('.loading-fill') as HTMLElement).style.transform = `scaleX(${Math.min(1, Math.max(0.04, fraction))})`;
}

/** Fades the screen out (it stays at least a moment so it never flickers). */
export function hideLoading(): void {
  store(null);
  const node = el;
  if (!node) return;
  el = null;
  node.querySelector<HTMLElement>('.loading-fill')!.style.transform = 'scaleX(1)';
  const wait = Math.max(0, MIN_MS - (performance.now() - shownAt));
  window.setTimeout(() => {
    node.classList.add('loading-out');
    window.setTimeout(() => node.remove(), 380);
  }, wait);
}

/** Waits two frames so the browser paints the screen before heavy work blocks the thread. */
export function paintFirst(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function storedLabel(): string | null {
  try {
    return window.sessionStorage.getItem(FLAG);
  } catch {
    return null;
  }
}

/** At page start: when a reload came from "new world" or "switch view", show the screen at once until the game is ready. */
export function bootLoading(): void {
  const label = storedLabel();
  if (!label) return;
  showLoading(label, 0.55, false, true);
  const root = document.documentElement;
  const done = (): boolean => root.dataset.ready === 'true' || root.dataset.ready === 'error';
  if (done()) return hideLoading();
  const observer = new MutationObserver(() => {
    if (!done()) return;
    observer.disconnect();
    setLoading('Ready', 1);
    hideLoading();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-ready'] });
  window.setTimeout(() => {
    observer.disconnect();
    hideLoading();
  }, GIVE_UP_MS);
}

/** Runs heavy work behind the screen: paint first, then work, then fade out (unless the page is about to reload). */
export async function withLoading<T>(label: string, work: () => Promise<T>, opts: { reloads?: boolean } = {}): Promise<T> {
  showLoading(label, 0.15, opts.reloads);
  await paintFirst();
  setLoading(label, 0.5);
  try {
    return await work();
  } finally {
    if (!opts.reloads) {
      setLoading(label, 1);
      hideLoading();
    }
  }
}
