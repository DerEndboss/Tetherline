import type { ObstacleSound } from './types';
import type { Buses } from './engine';

/**
 * Synthesized sounds, all from oscillators, filtered noise and envelopes. Every function schedules its
 * nodes at `at` (context time) and lets them stop and disconnect themselves.
 */

function env(b: Buses, peak: number, attack: number, decay: number, at: number): GainNode {
  const g = b.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

function tone(b: Buses, type: OscillatorType, from: number, to: number, glide: number, gain: GainNode, at: number, length: number): void {
  const o = b.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, at + glide);
  o.connect(gain);
  o.start(at);
  o.stop(at + length);
}

function noise(b: Buses, filter: BiquadFilterType, freq: number, q: number, gain: GainNode, at: number, length: number, sweepTo?: number): void {
  const src = b.ctx.createBufferSource();
  src.buffer = b.noise;
  const f = b.ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, at);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + length);
  f.Q.value = q;
  src.connect(f).connect(gain);
  src.start(at, Math.random() * 0.5);
  src.stop(at + length);
}

function out(b: Buses, g: GainNode): GainNode {
  g.connect(b.sfx);
  return g;
}

/** The plop of a hit, in the obstacle's timbre. `f` is a note of the world's key. */
export function plop(b: Buses, kind: ObstacleSound, f: number, vel: number, at: number): void {
  if (kind === 'crystal') {
    const g = out(b, env(b, 0.32 * vel, 0.003, 0.55, at));
    tone(b, 'sine', f * 2, f * 2, 0, g, at, 0.6);
    tone(b, 'sine', f * 5.52, f * 5.52, 0, out(b, env(b, 0.08 * vel, 0.002, 0.25, at)), at, 0.3);
    noise(b, 'highpass', 5000, 0.7, out(b, env(b, 0.05 * vel, 0.001, 0.03, at)), at, 0.05);
    return;
  }
  if (kind === 'metal') {
    tone(b, 'triangle', f * 1.4, f, 0.03, out(b, env(b, 0.3 * vel, 0.002, 0.22, at)), at, 0.3);
    tone(b, 'sine', f * 2.31, f * 2.31, 0, out(b, env(b, 0.1 * vel, 0.002, 0.3, at)), at, 0.35);
    noise(b, 'bandpass', 2600, 3, out(b, env(b, 0.12 * vel, 0.001, 0.06, at)), at, 0.08);
    return;
  }
  if (kind === 'plant') {
    tone(b, 'sine', f * 1.2, f * 0.85, 0.08, out(b, env(b, 0.36 * vel, 0.006, 0.14, at)), at, 0.2);
    noise(b, 'lowpass', 1400, 0.5, out(b, env(b, 0.07 * vel, 0.01, 0.1, at)), at, 0.12);
    return;
  }
  tone(b, 'sine', f * 2.1, f, 0.045, out(b, env(b, 0.42 * vel, 0.003, 0.17, at)), at, 0.22);
  tone(b, 'triangle', f * 0.5, f * 0.5, 0, out(b, env(b, 0.12 * vel, 0.003, 0.08, at)), at, 0.12);
  noise(b, 'bandpass', 1800, 0.9, out(b, env(b, 0.1 * vel, 0.001, 0.04, at)), at, 0.06);
}

/**
 * The bigger pop when something breaks apart: a low thump, the plop an octave down, a dust hiss. `level`
 * scales it (1 = the player's own break; drone work plays softer).
 */
export function breakApart(b: Buses, kind: ObstacleSound, f: number, at: number, level = 1): void {
  tone(b, 'sine', 140, 55, 0.12, out(b, env(b, 0.5 * level, 0.004, 0.22, at)), at, 0.3);
  plop(b, kind, f / 2, 1.1 * level, at);
  noise(b, 'lowpass', 2200, 0.6, out(b, env(b, 0.14 * level, 0.01, 0.3, at)), at, 0.36, 300);
}

/** Bell pings rising through the given notes: the loot pops out. */
export function sparkle(b: Buses, notes: readonly number[], at: number, gap = 0.055, level = 1): void {
  notes.forEach((f, i) => {
    const t = at + i * gap;
    tone(b, 'sine', f * 2, f * 2, 0, out(b, env(b, 0.12 * level, 0.002, 0.32, t)), t, 0.36);
    tone(b, 'sine', f * 4, f * 4, 0, out(b, env(b, 0.04 * level, 0.002, 0.18, t)), t, 0.2);
  });
}

/** One laser pulse: a falling, filtered buzz. */
export function laser(b: Buses, f: number, at: number, level = 1): void {
  const g = env(b, 0.07 * level, 0.004, 0.11, at);
  const bp = b.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 1.4;
  g.connect(bp).connect(b.sfx);
  tone(b, 'sawtooth', f * 3, f * 1.8, 0.1, g, at, 0.14);
  tone(b, 'sine', f * 6, f * 3, 0.1, out(b, env(b, 0.03 * level, 0.003, 0.08, at)), at, 0.12);
}

/** Drone lift-off: a rising air sweep and a rising tone. */
export function whoosh(b: Buses, at: number, level = 1): void {
  noise(b, 'bandpass', 300, 1.2, out(b, env(b, 0.2 * level, 0.35, 0.6, at)), at, 1, 2600);
  tone(b, 'sine', 140, 460, 0.8, out(b, env(b, 0.1 * level, 0.2, 0.7, at)), at, 1);
}

/** A ship settling or engines spooling down: a falling air sweep with a low hum. */
export function descend(b: Buses, at: number, level = 1): void {
  noise(b, 'bandpass', 2200, 1, out(b, env(b, 0.16 * level, 0.25, 0.9, at)), at, 1.2, 260);
  tone(b, 'sine', 220, 70, 1, out(b, env(b, 0.12 * level, 0.2, 0.9, at)), at, 1.2);
}

/** The hatch: a short mechanical clunk. */
export function clunk(b: Buses, at: number, level = 1): void {
  tone(b, 'square', 110, 70, 0.06, out(b, env(b, 0.08 * level, 0.002, 0.07, at)), at, 0.1);
  noise(b, 'lowpass', 900, 0.8, out(b, env(b, 0.16 * level, 0.002, 0.06, at)), at, 0.08);
}

/** Purchase: two warm notes, a fifth apart. */
export function chime(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'triangle', f * 2, f * 2, 0, out(b, env(b, 0.2 * level, 0.004, 0.5, at)), at, 0.55);
  tone(b, 'triangle', f * 3, f * 3, 0, out(b, env(b, 0.18 * level, 0.004, 0.6, at + 0.09)), at + 0.09, 0.7);
}

/** A tiny high ping: a loot icon arrives at the base. */
export function tick(b: Buses, f: number, at: number): void {
  tone(b, 'sine', f * 4, f * 4, 0, out(b, env(b, 0.06, 0.002, 0.07, at)), at, 0.1);
}

/** Tapping bare ground: a soft dull tap. */
export function thud(b: Buses, at: number): void {
  tone(b, 'sine', 180, 90, 0.05, out(b, env(b, 0.12, 0.002, 0.07, at)), at, 0.1);
}

/**
 * Slag: a mixer burps. A fat low "blorp" that sags in pitch, two bubbles popping after it and a little
 * hiss. Comic, soft, never harsh.
 */
export function blorp(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'sine', f * 0.75, f * 0.32, 0.28, out(b, env(b, 0.3 * level, 0.01, 0.32, at)), at, 0.4);
  tone(b, 'triangle', f * 0.5, f * 0.25, 0.25, out(b, env(b, 0.1 * level, 0.01, 0.28, at)), at, 0.35);
  for (const [dt, k] of [[0.2, 1.6], [0.3, 2.1]] as const) {
    tone(b, 'sine', f * k, f * k * 1.5, 0.04, out(b, env(b, 0.07 * level, 0.002, 0.06, at + dt)), at + dt, 0.08);
  }
  noise(b, 'bandpass', 1400, 1.5, out(b, env(b, 0.04 * level, 0.05, 0.25, at + 0.05)), at + 0.05, 0.32, 500);
}

/** A slow bright swell: a chord fades in and rings out (the Skyforge wakes, a new expedition lands). */
export function swell(b: Buses, notes: readonly number[], at: number, level = 1): void {
  notes.forEach((f, i) => {
    tone(b, 'triangle', f, f, 0, out(b, env(b, 0.08 * level, 0.55 + i * 0.12, 2, at)), at, 2.8);
    tone(b, 'sine', f * 2, f * 2, 0, out(b, env(b, 0.035 * level, 0.8, 1.6, at + 0.15)), at + 0.15, 2.6);
  });
}

/* ---------- Interface sounds: soft, short, in the key; the world stays the loud part ---------- */

/** A soft tick: a sine blip with a tiny click on its front (buttons, tabs, slider steps). */
export function uiTick(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'sine', f * 1.02, f, 0.02, out(b, env(b, 0.07 * level, 0.002, 0.06, at)), at, 0.09);
  noise(b, 'bandpass', 3800, 2, out(b, env(b, 0.025 * level, 0.001, 0.015, at)), at, 0.025);
}

/** Two notes gliding from one to the next: up for opening, down for closing. */
export function uiBlip(b: Buses, from: number, to: number, at: number, level = 1): void {
  tone(b, 'triangle', from, from, 0, out(b, env(b, 0.06 * level, 0.003, 0.08, at)), at, 0.12);
  tone(b, 'triangle', to, to, 0, out(b, env(b, 0.07 * level, 0.003, 0.14, at + 0.055)), at + 0.055, 0.2);
  noise(b, 'bandpass', from * 6, 1.4, out(b, env(b, 0.012 * level, 0.02, 0.08, at)), at, 0.12, to * 6);
}

/** A disabled control: a dull, low knock (never a buzzer). */
export function uiKnock(b: Buses, f: number, at: number): void {
  tone(b, 'sine', f, f * 0.8, 0.05, out(b, env(b, 0.08, 0.002, 0.07, at)), at, 0.1);
}

/** A crate set down or lifted: a small hollow wooden knock. */
export function knock(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'triangle', f * 1.3, f, 0.03, out(b, env(b, 0.09 * level, 0.002, 0.07, at)), at, 0.1);
  noise(b, 'bandpass', 1100, 3, out(b, env(b, 0.06 * level, 0.001, 0.04, at)), at, 0.05);
}

/** Something taken down: a falling crumble of noise over a low thump. */
export function crumble(b: Buses, at: number, level = 1): void {
  tone(b, 'sine', 120, 50, 0.18, out(b, env(b, 0.3 * level, 0.004, 0.25, at)), at, 0.32);
  noise(b, 'lowpass', 1800, 0.7, out(b, env(b, 0.12 * level, 0.01, 0.45, at)), at, 0.5, 220);
}

/* ---------- Building sounds: ghosts, construction, belts ---------- */

/** A ghost is placed: a light holographic "bwip", two glassy notes gliding up with a shimmer. */
export function ghostPlaced(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'triangle', f * 2, f * 3, 0.07, out(b, env(b, 0.07 * level, 0.004, 0.1, at)), at, 0.14);
  tone(b, 'sine', f * 4, f * 6, 0.07, out(b, env(b, 0.045 * level, 0.004, 0.2, at + 0.045)), at + 0.045, 0.26);
  noise(b, 'highpass', 5200, 0.7, out(b, env(b, 0.02 * level, 0.01, 0.12, at)), at, 0.16);
}

/** A ghost is taken back: the same two notes, falling and dimmer. */
export function ghostCancel(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'triangle', f * 3, f * 2, 0.07, out(b, env(b, 0.05 * level, 0.004, 0.09, at)), at, 0.12);
  tone(b, 'sine', f * 2, f * 1.4, 0.08, out(b, env(b, 0.03 * level, 0.004, 0.12, at + 0.04)), at + 0.04, 0.16);
}

/** A drone starts work on a site: a short servo whirr and two tiny clicks. */
export function siteStart(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'sawtooth', f * 0.8, f * 1.6, 0.14, out(b, env(b, 0.025 * level, 0.01, 0.14, at)), at, 0.2);
  noise(b, 'bandpass', 2800, 2.5, out(b, env(b, 0.05 * level, 0.001, 0.02, at)), at, 0.03);
  noise(b, 'bandpass', 3400, 2.5, out(b, env(b, 0.04 * level, 0.001, 0.02, at + 0.09)), at + 0.09, 0.03);
}

/**
 * Construction finished: the satisfying part. A body thump (deeper and longer the bigger the building), a metal
 * clank on a note of the key, then a rising two-note confirmation and, for big buildings, a sparkle and a swell.
 * `size` is the footprint edge (1..6); `notes` are the key's notes to ring (low to high).
 */
export function buildDone(b: Buses, notes: readonly number[], size: number, at: number, level = 1): void {
  const big = Math.min(1, (size - 1) / 5);
  const body = 190 / (1 + big * 1.2);
  tone(b, 'sine', body * 1.8, body * 0.55, 0.12 + big * 0.1, out(b, env(b, (0.3 + big * 0.2) * level, 0.003, 0.2 + big * 0.2, at)), at, 0.5 + big * 0.3);
  noise(b, 'lowpass', 1500, 0.7, out(b, env(b, (0.08 + big * 0.06) * level, 0.004, 0.12 + big * 0.2, at)), at, 0.4, 260);
  plop(b, 'metal', notes[0]!, 0.55 * level, at + 0.015);
  const [a, c, d] = [notes[1] ?? notes[0]!, notes[2] ?? notes[0]!, notes[3] ?? notes[0]!];
  tone(b, 'triangle', a * 2, a * 2, 0, out(b, env(b, 0.12 * level, 0.004, 0.4, at + 0.07)), at + 0.07, 0.5);
  tone(b, 'triangle', c * 2, c * 2, 0, out(b, env(b, 0.12 * level, 0.004, 0.5, at + 0.14)), at + 0.14, 0.6);
  if (size >= 3) sparkle(b, [c, d, d * 1.5], at + 0.2, 0.06, 0.8 * level);
  if (size >= 5) swell(b, [notes[0]!, a, d], at + 0.1, 0.8 * level);
}

/** One tile of a belt drag: a crisp tick; the pitch climbs with the length of the line. */
export function beltTick(b: Buses, f: number, at: number, level = 1): void {
  tone(b, 'sine', f * 2, f * 2, 0, out(b, env(b, 0.07 * level, 0.002, 0.05, at)), at, 0.08);
  noise(b, 'bandpass', 3200, 2.2, out(b, env(b, 0.04 * level, 0.001, 0.015, at)), at, 0.03);
}

/** The belt line is laid: three quick rising notes that land on the last one. */
export function beltDone(b: Buses, notes: readonly number[], at: number, level = 1): void {
  notes.forEach((f, i) => {
    const t = at + i * 0.065;
    tone(b, 'triangle', f * 2, f * 2, 0, out(b, env(b, (0.09 + i * 0.02) * level, 0.003, 0.18 + i * 0.12, t)), t, 0.4);
  });
}
