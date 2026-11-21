import type { Game } from '../game/game';
import { toSaveRecord } from './serialize';
import { writeSlot } from './slots';

/** A calm rhythm, so autosaves never feel too frequent: closing or hiding the tab still saves at once. */
const EVERY_MS = 90_000;
/** A save a moment after an order is done or the run is won, but never more often than this. */
const SOON_MS = 1500;
const SOON_MIN_GAP_MS = 30_000;
/** How long an autosave may wait for an idle moment (so it never lands in the middle of a drag). */
const IDLE_WAIT_MS = 3000;

/** Fired on `window` after every successful autosave (the HUD flashes a small "Saved"); detail = the slot. */
export const SAVED_EVENT = 'groundbreak:saved';

/** Runs `fn` when the browser is idle (or after `IDLE_WAIT_MS` at the latest). */
function whenIdle(fn: () => void): void {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: IDLE_WAIT_MS });
  else window.setTimeout(fn, 0);
}

/**
 * Saves the running game into its slot every 90 s (only when the run moved on since the last save), shortly after
 * an order or the win (at most every 30 s), when the tab hides and when the page goes away. Timed saves wait for
 * an idle moment. Returns `saveNow` for the menu (new run, view switch).
 */
export function startAutosave(game: Game, enabled: () => boolean): { saveNow: () => Promise<void> } {
  let savedTick = -1;
  let savedAt = 0;
  const saveNow = async (): Promise<void> => {
    if (!enabled()) return;
    const slot = game.slot;
    try {
      const tick = game.world.state.tick;
      await writeSlot(slot, toSaveRecord(game.world, Date.now()));
      savedTick = tick;
      savedAt = performance.now();
      window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: slot }));
    } catch (e) {
      console.warn('Autosave failed', e);
    }
  };
  const saveIfMoved = (): void => {
    if (game.world.state.tick !== savedTick) whenIdle(() => void saveNow());
  };
  window.setInterval(saveIfMoved, EVERY_MS);
  let soon = 0;
  game.onEvents((events) => {
    if (soon || !events.some((e) => e.type === 'order-done' || e.type === 'won')) return;
    const wait = Math.max(SOON_MS, SOON_MIN_GAP_MS - (performance.now() - savedAt));
    soon = window.setTimeout(() => {
      soon = 0;
      saveIfMoved();
    }, wait);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveNow();
  });
  window.addEventListener('pagehide', () => void saveNow());
  return { saveNow };
}
