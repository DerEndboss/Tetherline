import type { MusicNote, Voice } from './composer';
import type { Buses } from './engine';

/**
 * The band, all synthesized: a warm pad, a round bass, a soft electric piano, a plucked synth, vibes, and a quiet
 * drum kit (kick, snare, hats, shaker, rim). Every instrument writes into an `Out` (one track's dry and wet
 * buses), so a whole track can be faded in or out with one gain.
 */
export interface Out {
  dry: AudioNode;
  wet: AudioNode;
}

type Instrument = (b: Buses, out: Out, f: number, at: number, seconds: number, vel: number) => void;

/** Plays one note of a bar at audio time `at` (seconds per beat `spb`). */
export function playNote(b: Buses, out: Out, rootHz: number, n: MusicNote, at: number, spb: number): void {
  const f = rootHz * 2 ** (n.semi / 12);
  INSTRUMENTS[n.voice](b, out, f, at + n.beat * spb, Math.max(0.05, n.len * spb), n.vel);
}

/** An envelope gain: attack to `peak`, hold, then release to silence; connected to dry and (a part of it) wet. */
function voiceGain(b: Buses, out: Out, peak: number, attack: number, hold: number, release: number, at: number, wet: number): GainNode {
  const g = b.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  g.connect(out.dry);
  if (wet > 0) {
    const send = b.ctx.createGain();
    send.gain.value = wet;
    g.connect(send).connect(out.wet);
  }
  return g;
}

function osc(b: Buses, type: OscillatorType, f: number, detune: number, to: AudioNode, at: number, stop: number): OscillatorNode {
  const o = b.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(to);
  o.start(at);
  o.stop(stop);
  return o;
}

function level(b: Buses, gain: number, to: AudioNode): GainNode {
  const g = b.ctx.createGain();
  g.gain.value = gain;
  g.connect(to);
  return g;
}

function filter(b: Buses, type: BiquadFilterType, freq: number, q: number, to: AudioNode): BiquadFilterNode {
  const f = b.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(to);
  return f;
}

/** Warm pad: a triangle and a detuned saw under a slowly opening low-pass. */
const pad: Instrument = (b, out, f, at, seconds, vel) => {
  const release = 1.8;
  const g = voiceGain(b, out, 0.06 * vel, 1.5, Math.max(0.1, seconds - 1.3), release, at, 0.75);
  const lp = filter(b, 'lowpass', 380, 0.4, g);
  lp.frequency.setValueAtTime(380, at);
  lp.frequency.linearRampToValueAtTime(1000, at + seconds * 0.6);
  lp.frequency.linearRampToValueAtTime(560, at + seconds + release);
  const end = at + seconds + release + 0.2;
  osc(b, 'triangle', f, -5, lp, at, end);
  osc(b, 'sawtooth', f, 6, level(b, 0.4, lp), at, end);
};

/** Round bass: a sine with a quiet octave triangle and a trace of low-passed saw so it carries on small speakers. */
const bass: Instrument = (b, out, f, at, seconds, vel) => {
  const g = voiceGain(b, out, 0.15 * vel, 0.012, Math.max(0.03, seconds * 0.7), 0.18, at, 0);
  const end = at + seconds * 0.7 + 0.4;
  osc(b, 'sine', f, 0, g, at, end);
  osc(b, 'triangle', f * 2, 0, level(b, 0.28, g), at, end);
  osc(b, 'sawtooth', f, 0, level(b, 0.1, filter(b, 'lowpass', 520, 0.5, g)), at, end);
};

/** Electric piano: a sine carrier with a decaying FM bite and a short tine on top, under a soft low-pass. */
const keys: Instrument = (b, out, f, at, seconds, vel) => {
  const ring = Math.max(0.7, seconds * 1.3);
  const g = voiceGain(b, out, 0.13 * vel, 0.005, 0.04, ring, at, 0.45);
  const lp = filter(b, 'lowpass', 3600, 0.5, g);
  const end = at + ring + 0.2;
  const carrier = osc(b, 'sine', f, 0, lp, at, end);
  const mod = b.ctx.createOscillator();
  mod.frequency.value = f;
  const depth = b.ctx.createGain();
  depth.gain.setValueAtTime(f * 1.3, at);
  depth.gain.exponentialRampToValueAtTime(f * 0.06, at + 0.5);
  mod.connect(depth).connect(carrier.frequency);
  mod.start(at);
  mod.stop(end);
  const tine = voiceGain(b, out, 0.04 * vel, 0.002, 0, 0.09, at, 0.2);
  osc(b, 'sine', f * 7, 0, tine, at, at + 0.12);
};

/** Plucked synth: two detuned saws through a low-pass that closes fast. */
const pluck: Instrument = (b, out, f, at, seconds, vel) => {
  const decay = 0.1 + Math.min(0.35, seconds * 0.9);
  const g = voiceGain(b, out, 0.09 * vel, 0.004, 0, decay, at, 0.3);
  const lp = filter(b, 'lowpass', 2600, 3, g);
  lp.frequency.setValueAtTime(2600, at);
  lp.frequency.exponentialRampToValueAtTime(420, at + decay * 0.8);
  const end = at + decay + 0.1;
  osc(b, 'sawtooth', f, -7, lp, at, end);
  osc(b, 'sawtooth', f, 7, lp, at, end);
};

/** Vibes: a sine with a quick overtone, a slow wobble in loudness and a long, roomy tail. */
const vibes: Instrument = (b, out, f, at, seconds, vel) => {
  const ring = 1.1 + seconds * 0.4;
  const g = voiceGain(b, out, 0.1 * vel, 0.003, 0, ring, at, 0.8);
  const end = at + ring + 0.1;
  osc(b, 'sine', f, 0, g, at, end);
  osc(b, 'sine', f * 4, 0, level(b, 0.22, g), at, at + 0.35);
  const wobble = b.ctx.createOscillator();
  wobble.frequency.value = 4.6;
  const depth = b.ctx.createGain();
  depth.gain.value = 0.015 * vel;
  wobble.connect(depth).connect(g.gain);
  wobble.start(at);
  wobble.stop(end);
};

/** Soft kick: a sine dropping from 135 to 52 Hz with a tiny click (no sub-bass: small speakers cannot play it). */
const kick: Instrument = (b, out, _f, at, _s, vel) => {
  const g = voiceGain(b, out, 0.34 * vel, 0.003, 0, 0.2, at, 0);
  const o = osc(b, 'sine', 135, 0, g, at, at + 0.28);
  o.frequency.setValueAtTime(135, at);
  o.frequency.exponentialRampToValueAtTime(52, at + 0.11);
  noiseHit(b, out, 'bandpass', 1800, 0.03 * vel, 0.012, at, 0);
};

function noiseHit(b: Buses, out: Out, type: BiquadFilterType, freq: number, peak: number, decay: number, at: number, wet: number): void {
  const g = voiceGain(b, out, peak, 0.002, 0, decay, at, wet);
  const f = filter(b, type, freq, type === 'bandpass' ? 1.4 : 0.7, g);
  const src = b.ctx.createBufferSource();
  src.buffer = b.noise;
  src.connect(f);
  src.start(at, Math.random() * 0.8);
  src.stop(at + decay + 0.05);
}

/** Snare: a band of noise on a short tone, with a little room. */
const snare: Instrument = (b, out, _f, at, _s, vel) => {
  noiseHit(b, out, 'bandpass', 1900, 0.13 * vel, 0.17, at, 0.28);
  const g = voiceGain(b, out, 0.1 * vel, 0.002, 0, 0.1, at, 0.1);
  const o = osc(b, 'triangle', 190, 0, g, at, at + 0.14);
  o.frequency.setValueAtTime(190, at);
  o.frequency.exponentialRampToValueAtTime(140, at + 0.08);
};

const hat: Instrument = (b, out, _f, at, _s, vel) => noiseHit(b, out, 'highpass', 7800, 0.04 * vel, 0.04, at, 0.08);
const openhat: Instrument = (b, out, _f, at, _s, vel) => noiseHit(b, out, 'highpass', 6800, 0.04 * vel, 0.35, at, 0.2);
const shaker: Instrument = (b, out, _f, at, _s, vel) => noiseHit(b, out, 'bandpass', 6200, 0.035 * vel, 0.07, at, 0.12);
/** Rim: a short wooden click with a bright ring. */
const rim: Instrument = (b, out, _f, at, _s, vel) => {
  noiseHit(b, out, 'bandpass', 2400, 0.06 * vel, 0.035, at, 0.25);
  osc(b, 'sine', 820, 0, voiceGain(b, out, 0.05 * vel, 0.002, 0, 0.05, at, 0.15), at, at + 0.08);
};

const INSTRUMENTS: Record<Voice, Instrument> = { pad, bass, keys, pluck, vibes, kick, snare, hat, openhat, shaker, rim };
