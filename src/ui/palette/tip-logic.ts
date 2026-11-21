/** Pure timing rules of the palette tooltip (tip-store.ts): a cold tip waits a beat, a warm one (another just left) is at once. */

/** How long the pointer rests on an entry before its tooltip shows. */
export const TIP_DELAY_MS = 260;
/** Within this long after a tooltip closed, the next one shows at once (sweeping over a row of entries). */
export const TIP_WARM_MS = 500;

/** Milliseconds to wait before showing a tooltip, given when the last one closed. */
export function tipDelay(now: number, lastHideAt: number): number {
  return now - lastHideAt < TIP_WARM_MS ? 0 : TIP_DELAY_MS;
}
