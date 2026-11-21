import type { Id } from '../../content/types';

/**
 * Fields the progression module adds to shared types (module augmentation, so the shared files stay untouched).
 * Everything here is optional: old saves and test worlds work without it, and it is created lazily.
 */

/** One radio message of the story (the HUD shows the newest; the log keeps the last ones). */
export interface RadioLine {
  /** The order that triggered it, or 'won' / 'welcome'. */
  id: Id;
  tick: number;
  text: string;
}

/** Rate goals: cumulative output sampled once a second, and how long the rate has been held. */
export interface RateTrack {
  hist: number[];
  /** Seconds the goal rate has been held without a break. */
  held: number;
  /** Items per minute over the last (up to) 60 seconds. */
  rate: number;
}

declare module '../../content/types' {
  interface OrderDef {
    /** Chapter name shown over the orders ("Touchdown"). */
    chapter?: string;
    /** Space Elevator stage this order belongs to (1..n); the HUD shows the megastructure's progress. */
    stage?: number;
    /** Meta currency this order pays when done (default 0). */
    reward?: number;
  }
}

declare module '../state' {
  interface ProgressState {
    rates?: Record<Id, RateTrack>;
    radio?: RadioLine[];
    /** Meta currency earned in this run so far, and how much of it the meta store has been paid. */
    earned?: number;
    claimed?: number;
    /** The meta tree was applied to this run (once, at the start). */
    metaApplied?: boolean;
    /** The player has seen the victory screen. */
    celebrated?: boolean;
    /** Tick of the win (for the time bonus and the victory stats). */
    wonAt?: number;
  }
}
