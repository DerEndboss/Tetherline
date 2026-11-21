import type { SoundKey } from './types';
import { DEFAULT_PREFERENCES, type Channel } from '../settings/preferences';
import { trackBar } from './composer';
import { channelGain, createBuses, type Buses } from './engine';
import type { Out } from './instruments';
import { MachineAmbience, type Soundscape } from './machines';
import { fadeLevel, playBarOn } from './music';
import { beltDone, beltTick, breakApart, buildDone, chime, ghostPlaced, plop, siteStart, sparkle, uiBlip, uiTick } from './sfx';
import { startAmbience } from './ambience';
import { DRONE_BARS, TRACKS, trackBars, type TrackDef } from './tracks';

/**
 * Renders the game's sound offline into a buffer (scripts/listen.mjs): one build track (or the crossfade between
 * two), the machines near a close camera, the wind, and a few building sounds at fixed times. Nobody can listen
 * during an automated run, so levels are measured instead, and the file lets a human listen afterwards. Browser only.
 */
export interface Rendered {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

export interface RenderOptions {
  /** Track to play (index into TRACKS) and the bar to start from; default the first track from its start. */
  track?: number;
  fromBar?: number;
  /** A second track to start when the first reaches its outro, to hear the crossfade. */
  next?: number;
}

const SCENE: Soundscape = { zoom: 1.5, machines: { thump: 3, hiss: 2, whirr: 1, hum: 1, burn: 1 }, belts: 6 };

/** Schedules a track's bars with the same fades as the game; returns each bar's start time and the track's end. */
function playTrack(b: Buses, def: TrackDef, seed: number, from: number, start: number, until: number): { bars: { at: number; spb: number }[]; end: number; outroAt: number } {
  const dry = b.ctx.createGain();
  const wet = b.ctx.createGain();
  const fadeDry = b.ctx.createGain();
  const fadeWet = b.ctx.createGain();
  const tone = b.ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = def.warmth;
  dry.connect(fadeDry).connect(tone).connect(b.music);
  wet.connect(fadeWet).connect(b.musicWet);
  const out: Out = { dry, wet };
  const total = trackBars(def);
  const bars: { at: number; spb: number }[] = [];
  let at = start;
  let outroAt = Infinity;
  for (let i = from; i < total && at < until; i++) {
    const bar = trackBar(def, i, seed);
    if (i === total - DRONE_BARS) outroAt = at;
    const len = playBarOn(b, def, bar, at, out);
    for (const g of [fadeDry, fadeWet]) {
      g.gain.setValueAtTime(fadeLevel(bar, 0), at);
      g.gain.linearRampToValueAtTime(fadeLevel(bar, 1), at + len);
    }
    bars.push({ at, spb: 60 / def.bpm });
    at += len;
  }
  return { bars, end: at, outroAt };
}

export async function renderSound(key: SoundKey, seconds: number, seed: number, channels: readonly Channel[], opts: RenderOptions = {}): Promise<Rendered> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  const on = new Set(channels);
  const { buses } = createBuses(ctx, (ch) => (on.has(ch) ? channelGain(ch, DEFAULT_PREFERENCES.volume[ch]) : 0));
  const def = TRACKS[opts.track ?? 0]!;
  const first = playTrack(buses, def, seed, opts.fromBar ?? 0, 0.1, seconds);
  let bars = first.bars;
  if (opts.next !== undefined && first.outroAt < seconds) bars = bars.concat(playTrack(buses, TRACKS[opts.next]!, seed, 0, first.outroAt, seconds).bars);
  startAmbience(buses, key);
  const machines = new MachineAmbience(buses, key);
  // The machines schedule a little ahead of the clock, as in the game: wake them every quarter second.
  for (let t = 0.25; t < seconds; t += 0.25) {
    void ctx.suspend(t).then(() => {
      const bar = bars.findLast((x) => x.at <= ctx.currentTime);
      machines.update(SCENE, bar ? { beat: bar.spb, barAt: bar.at } : null);
      void ctx.resume();
    });
  }
  machines.update(SCENE, null);
  effects(buses, key, seconds);
  const out = await ctx.startRendering();
  return { sampleRate: rate, left: out.getChannelData(0), right: out.getChannelData(1) };
}

/** The player at work: ghosts, a belt drag, a construction finishing at three sizes, a break, a purchase, two clicks. */
function effects(b: Buses, key: SoundKey, seconds: number): void {
  const n = (step: number): number => key.rootHz * 2 ** ((key.scale[((step % 5) + 5) % 5]! + Math.floor(step / 5) * 12) / 12);
  for (let t = 4; t < seconds - 4; t += 12) {
    for (let i = 0; i < 3; i++) ghostPlaced(b, n(2 + i * 2), t + i * 0.25);
    for (let i = 0; i < 8; i++) beltTick(b, n(3 + Math.min(i + 1, 10)), t + 1 + i * 0.07, 0.7);
    beltDone(b, [n(5), n(7), n(9)], t + 1.7);
    siteStart(b, n(3), t + 2.5, 0.8);
    for (const [i, size] of [1, 3, 6].entries()) buildDone(b, [n(0), n(2), n(4), n(5)], size, t + 3.5 + i * 0.9);
    breakApart(b, 'stone', n(-2), t + 7, 0.6);
    plop(b, 'metal', n(2), 0.6, t + 7.5);
    sparkle(b, [n(2), n(4), n(6)], t + 7.8);
    chime(b, n(7), t + 8.5);
    uiTick(b, n(7), t + 10);
    uiBlip(b, n(4), n(7), t + 10.6);
  }
}
