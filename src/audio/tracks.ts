import type { SectionKind, Voice } from './composer';

/**
 * The three build tracks as data. Each has its own key, tempo, groove, chords and instruments; composer.ts turns a
 * track into bars and music.ts plays them. A bar is 16 steps (sixteenth notes); every pattern below is one bar.
 *
 * - Cranes at Dawn: D dorian, 82 BPM, lo-fi boom-bap with a lazy swing, soft Rhodes and vibes.
 * - Copper Loop: G mixolydian, 100 BPM, light funk with plucked stabs and a busy bass.
 * - Warm Furnace: F major, 90 BPM, a shuffle with brushed backbeat and a singing Rhodes.
 *
 * Every chord and melody note lives in the track's own scale, so nothing clashes with the sound effects that
 * follow the world's key, and the first and last four bars of a track are a bare drone on root and fifth that
 * blends into any other track without a clash.
 */

/** A chord voicing in semitones above the track's root; `bass` is the bass note (also in semitones, usually negative). */
export interface Chord {
  bass: number;
  notes: readonly number[];
}

export interface BassHit {
  step: number;
  /** Semitones above the chord's bass note: 0, 7 (fifth) or 12 (octave) keep it safe. */
  interval: number;
  /** Length in steps. */
  len: number;
  vel: number;
}

export interface CompHit {
  step: number;
  len: number;
  vel: number;
}

/** One bar of 16 velocities per drum voice (0 = silent). */
export interface DrumKit {
  kick: readonly number[];
  snare: readonly number[];
  hat: readonly number[];
  shaker: readonly number[];
  rim: readonly number[];
}

export interface TrackDef {
  id: string;
  name: string;
  bpm: number;
  /** Frequency of the key's root note in Hz (around octave 3). */
  rootHz: number;
  /** Swing: `16` delays the off-beat sixteenths, `8` the off-beat eighths; amount 1 is a full triplet feel. */
  swing: { grid: 16 | 8; amount: number };
  /** Pentatonic scale of the melody, semitones above the root. */
  scale: readonly number[];
  /** One chord per bar; the loop repeats (all tracks use eight). */
  chords: readonly Chord[];
  comp: { voice: Extract<Voice, 'keys' | 'pluck'>; hits: readonly CompHit[] };
  lead: Extract<Voice, 'vibes' | 'keys' | 'pluck'>;
  bass: readonly BassHit[];
  drums: DrumKit;
  /** Low-pass of the whole track in Hz: lower is warmer and more lo-fi. */
  warmth: number;
  /** Sections in order with their length in bars; starts with an intro and ends with an outro. */
  form: readonly (readonly [SectionKind, number])[];
}

const ROW = (hits: Record<number, number>): number[] => Array.from({ length: 16 }, (_, s) => hits[s] ?? 0);

const CRANES: TrackDef = {
  id: 'cranes-at-dawn',
  name: 'Cranes at Dawn',
  bpm: 82,
  rootHz: 146.83,
  swing: { grid: 16, amount: 0.8 },
  scale: [0, 3, 5, 7, 10],
  chords: [
    { bass: -12, notes: [3, 7, 10, 14] },
    { bass: -10, notes: [5, 9, 12, 14] },
    { bass: -9, notes: [7, 10, 14, 17] },
    { bass: -10, notes: [5, 9, 12, 14] },
    { bass: -12, notes: [3, 7, 10, 14] },
    { bass: -7, notes: [9, 12, 15, 19] },
    { bass: -2, notes: [2, 5, 9, 12] },
    { bass: -5, notes: [5, 10, 14, 17] },
  ],
  comp: { voice: 'keys', hits: [{ step: 0, len: 6, vel: 0.85 }, { step: 6, len: 2, vel: 0.5 }, { step: 10, len: 4, vel: 0.65 }] },
  lead: 'vibes',
  bass: [
    { step: 0, interval: 0, len: 5, vel: 0.95 },
    { step: 7, interval: 0, len: 2, vel: 0.55 },
    { step: 10, interval: 7, len: 3, vel: 0.7 },
    { step: 14, interval: 0, len: 2, vel: 0.5 },
  ],
  drums: {
    kick: ROW({ 0: 1, 7: 0.55, 10: 0.8 }),
    snare: ROW({ 4: 1, 12: 1, 15: 0.25 }),
    hat: ROW({ 0: 0.6, 2: 0.4, 4: 0.6, 6: 0.4, 8: 0.6, 10: 0.4, 12: 0.6, 14: 0.45 }),
    shaker: ROW({ 1: 0.3, 3: 0.35, 5: 0.3, 7: 0.4, 9: 0.3, 11: 0.35, 13: 0.3, 15: 0.4 }),
    rim: ROW({ 11: 0.35 }),
  },
  warmth: 6200,
  form: [['intro', 4], ['verse', 8], ['groove', 8], ['lift', 8], ['breakdown', 4], ['groove', 8], ['lift', 8], ['verse', 8], ['groove', 8], ['breakdown', 4], ['lift', 8], ['outro', 4]],
};

const COPPER: TrackDef = {
  id: 'copper-loop',
  name: 'Copper Loop',
  bpm: 100,
  rootHz: 196,
  swing: { grid: 16, amount: 0.45 },
  scale: [0, 2, 4, 7, 9],
  chords: [
    { bass: -12, notes: [4, 7, 10, 14] },
    { bass: -10, notes: [5, 9, 12, 16] },
    { bass: -7, notes: [9, 12, 16, 19] },
    { bass: -5, notes: [10, 14, 17, 21] },
    { bass: -12, notes: [4, 7, 10, 14] },
    { bass: -10, notes: [5, 9, 12, 16] },
    { bass: -7, notes: [9, 12, 16, 19] },
    { bass: -5, notes: [10, 14, 17, 19] },
  ],
  comp: {
    voice: 'pluck',
    hits: [{ step: 2, len: 1, vel: 0.7 }, { step: 5, len: 1, vel: 0.5 }, { step: 7, len: 1, vel: 0.6 }, { step: 10, len: 1, vel: 0.7 }, { step: 14, len: 1, vel: 0.5 }],
  },
  lead: 'keys',
  bass: [
    { step: 0, interval: 0, len: 2, vel: 1 },
    { step: 3, interval: 0, len: 1, vel: 0.6 },
    { step: 6, interval: 12, len: 1, vel: 0.7 },
    { step: 8, interval: 0, len: 2, vel: 0.85 },
    { step: 10, interval: 7, len: 1, vel: 0.6 },
    { step: 12, interval: 0, len: 1, vel: 0.7 },
    { step: 14, interval: 7, len: 2, vel: 0.6 },
  ],
  drums: {
    kick: ROW({ 0: 1, 6: 0.7, 9: 0.8 }),
    snare: ROW({ 4: 1, 7: 0.22, 12: 1, 14: 0.3 }),
    hat: ROW({ 0: 0.7, 1: 0.25, 2: 0.5, 3: 0.25, 4: 0.7, 5: 0.25, 6: 0.5, 7: 0.3, 8: 0.7, 9: 0.25, 10: 0.5, 11: 0.25, 12: 0.7, 13: 0.25, 14: 0.5, 15: 0.3 }),
    shaker: ROW({ 2: 0.3, 6: 0.3, 10: 0.3, 14: 0.35 }),
    rim: ROW({ 3: 0.3, 11: 0.3 }),
  },
  warmth: 8800,
  form: [['intro', 4], ['verse', 8], ['groove', 8], ['groove', 8], ['breakdown', 4], ['lift', 8], ['verse', 8], ['groove', 8], ['lift', 8], ['breakdown', 4], ['groove', 8], ['lift', 8], ['verse', 8], ['outro', 4]],
};

const FURNACE: TrackDef = {
  id: 'warm-furnace',
  name: 'Warm Furnace',
  bpm: 90,
  rootHz: 174.61,
  swing: { grid: 8, amount: 0.7 },
  scale: [0, 2, 4, 7, 9],
  chords: [
    { bass: -12, notes: [4, 7, 11, 14] },
    { bass: -15, notes: [0, 4, 7, 11] },
    { bass: -10, notes: [5, 9, 12, 16] },
    { bass: -5, notes: [-1, 2, 5, 9] },
    { bass: -12, notes: [4, 7, 11, 14] },
    { bass: -8, notes: [7, 11, 14, 16] },
    { bass: -7, notes: [9, 12, 16, 17] },
    { bass: -5, notes: [-1, 2, 5, 9] },
  ],
  comp: { voice: 'keys', hits: [{ step: 0, len: 3, vel: 0.75 }, { step: 6, len: 2, vel: 0.55 }, { step: 8, len: 3, vel: 0.65 }, { step: 14, len: 2, vel: 0.5 }] },
  lead: 'vibes',
  bass: [
    { step: 0, interval: 0, len: 3, vel: 0.95 },
    { step: 4, interval: 7, len: 2, vel: 0.6 },
    { step: 8, interval: 0, len: 3, vel: 0.8 },
    { step: 12, interval: 12, len: 2, vel: 0.6 },
    { step: 14, interval: 7, len: 2, vel: 0.5 },
  ],
  drums: {
    kick: ROW({ 0: 1, 10: 0.8, 11: 0.35 }),
    snare: ROW({ 4: 0.9, 12: 0.95 }),
    hat: ROW({ 0: 0.55, 2: 0.4, 4: 0.55, 6: 0.4, 8: 0.55, 10: 0.4, 12: 0.55, 14: 0.4 }),
    shaker: ROW({ 1: 0.25, 5: 0.25, 9: 0.25, 13: 0.3 }),
    rim: ROW({ 3: 0.3, 6: 0.3, 9: 0.3, 14: 0.3 }),
  },
  warmth: 7400,
  form: [['intro', 4], ['verse', 8], ['groove', 8], ['lift', 8], ['breakdown', 4], ['groove', 8], ['verse', 8], ['lift', 8], ['breakdown', 4], ['groove', 8], ['lift', 8], ['verse', 8], ['outro', 4]],
};

export const TRACKS: readonly TrackDef[] = [CRANES, COPPER, FURNACE];

/** Total bars of a track. */
export function trackBars(def: TrackDef): number {
  return def.form.reduce((n, [, bars]) => n + bars, 0);
}

/** Bars of the drone intro and outro: the crossfade lasts as long as one of them. */
export const DRONE_BARS = 4;
