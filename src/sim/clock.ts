import { TICK_MS } from './constants';

/**
 * Fixed-timestep accumulator. Feed it real frame time; it says how many simulation ticks to run and how far
 * the renderer is between two ticks (`alpha`). The result does not depend on the frame rate.
 */
export class FixedClock {
  /** 0 pauses, 1 is real time; the dev menu raises it. */
  timeScale = 1;
  private acc = 0;

  constructor(
    readonly tickMs = TICK_MS,
    /** A long frame (tab in background) counts as at most this much: no catch-up burst, no offline progress. */
    readonly maxFrameMs = 250,
    readonly maxTicksPerFrame = 400,
  ) {}

  advance(realMs: number): number {
    const frame = Math.min(Math.max(realMs, 0), this.maxFrameMs);
    this.acc += frame * this.timeScale;
    const ticks = Math.floor(this.acc / this.tickMs);
    if (ticks > this.maxTicksPerFrame) {
      this.acc = 0;
      return this.maxTicksPerFrame;
    }
    this.acc -= ticks * this.tickMs;
    return ticks;
  }

  /** Progress between the last tick and the next one, 0..1. */
  get alpha(): number {
    return Math.min(1, this.acc / this.tickMs);
  }

  reset(): void {
    this.acc = 0;
  }
}
