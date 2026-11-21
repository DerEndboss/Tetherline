import type { MusicControl } from './music';
import { CHANNELS, volumeGain, type Channel, type PreferenceStore } from '../settings/preferences';

/**
 * WebAudio output: one context (created on the first user gesture, as browsers require), three channels the
 * settings control separately (music, effects, ambience), a shared room reverb, a soft compressor and a master
 * gain that the mute toggle ramps. Mute is remembered per browser; the volumes live in the preferences.
 */
const MUTE_KEY = 'groundbreak.muted';

/** Gain of each channel at full slider: the mix between them (music sits under the effects). */
const CHANNEL_LEVEL: Record<Channel, number> = { music: 0.85, effects: 0.8, ambience: 0.45 };
const MASTER = 0.9;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage blocked: mute still works for this session
  }
}

export interface Buses {
  /** An AudioContext in the game; an OfflineAudioContext when sound is rendered to a file (scripts/listen.mjs). */
  ctx: BaseAudioContext;
  /** Effects bus (plops, lasers, chimes, UI clicks). */
  sfx: AudioNode;
  /** Ambience bus (hum, wind, the machines near the camera). */
  ambience: AudioNode;
  /** Music bus (the generative score). */
  music: AudioNode;
  /** Wet sends: into a soft room reverb whose return goes through the same channel fader. */
  musicWet: AudioNode;
  sfxWet: AudioNode;
  /** One second of white noise, shared by all noisy sounds. */
  noise: AudioBuffer;
}

/** A soft stereo room: decaying noise, a little darker towards the tail. Synthesized, no sample. */
function roomImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      low += 0.18 * (Math.random() * 2 - 1 - low);
      const bright = 1 - t * 0.8;
      data[i] = (low * (1 - bright) + (Math.random() * 2 - 1) * bright * 0.6) * (1 - t) ** 3;
    }
  }
  return buffer;
}

/**
 * The mixing desk on any context: a fader per channel into a soft compressor and the master, a room reverb send
 * per wet channel (its return goes through the same fader, so the slider turns the tail down too) and the shared
 * noise buffer. `level` gives each channel's fader gain.
 */
export function createBuses(ctx: BaseAudioContext, level: (ch: Channel) => number, masterGain = MASTER): { buses: Buses; master: GainNode; faders: Record<Channel, GainNode> } {
  const master = ctx.createGain();
  master.gain.value = masterGain;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.connect(master).connect(ctx.destination);
  // Nothing below 40 Hz: laptop and phone speakers cannot play it, it only muddies the mix and eats headroom.
  const floor = ctx.createBiquadFilter();
  floor.type = 'highpass';
  floor.frequency.value = 45;
  const floor2 = ctx.createBiquadFilter();
  floor2.type = 'highpass';
  floor2.frequency.value = 45;
  floor.connect(floor2).connect(comp);
  const fader = (ch: Channel): GainNode => {
    const g = ctx.createGain();
    g.gain.value = level(ch);
    g.connect(floor);
    return g;
  };
  const faders: Record<Channel, GainNode> = { music: fader('music'), effects: fader('effects'), ambience: fader('ambience') };
  const room = roomImpulse(ctx, 2.6);
  const wet = (ch: Channel): GainNode => {
    const send = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = room;
    send.connect(reverb).connect(faders[ch]);
    return send;
  };
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const buses: Buses = { ctx, sfx: faders.effects, ambience: faders.ambience, music: faders.music, musicWet: wet('music'), sfxWet: wet('effects'), noise };
  return { buses, master, faders };
}

/** Full-slider gain of a channel times the slider's curve (exported for offline renders). */
export function channelGain(ch: Channel, slider: number): number {
  return CHANNEL_LEVEL[ch] * volumeGain(slider);
}

export class AudioEngine {
  private buses: Buses | null = null;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly faders = new Map<Channel, GainNode>();
  private muted = readMuted();
  private readonly listeners = new Set<() => void>();
  private readonly startHooks: ((b: Buses) => void)[] = [];
  /** The running music, for the settings window (now playing, skip); set by GameSound. */
  music: MusicControl | null = null;

  constructor(private readonly preferences: PreferenceStore) {
    preferences.subscribe(() => this.applyVolumes());
  }

  /** Creates or resumes the context. Call from a user gesture (pointerdown, keydown). */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.context = ctx;
    const out = createBuses(ctx, (ch) => this.level(ch), this.muted ? 0 : MASTER);
    this.master = out.master;
    for (const ch of CHANNELS) this.faders.set(ch, out.faders[ch]);
    this.buses = out.buses;
    for (const hook of this.startHooks) hook(this.buses);
  }

  /** Runs once the context exists (immediately if it already does). */
  onStart(hook: (b: Buses) => void): void {
    this.startHooks.push(hook);
    if (this.buses) hook(this.buses);
  }

  /** The buses while sound can play; null before the first gesture or while muted. */
  get live(): Buses | null {
    return this.muted ? null : this.buses;
  }

  /** Whether a channel can be heard at all right now (not muted, context running, slider above zero). */
  audible(channel: Channel): boolean {
    return this.live !== null && this.context?.state === 'running' && this.preferences.get().volume[channel] > 0;
  }

  /** Pauses all sound while the page is hidden (the game pauses too) and resumes it when it comes back. */
  setHidden(hidden: boolean): void {
    const ctx = this.context;
    if (!ctx) return;
    if (hidden && ctx.state === 'running') void ctx.suspend();
    if (!hidden && ctx.state === 'suspended') void ctx.resume();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeMuted(muted);
    if (this.master && this.buses) {
      const now = this.buses.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER, now, 0.05);
    }
    for (const fn of this.listeners) fn();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private level(ch: Channel): number {
    return channelGain(ch, this.preferences.get().volume[ch]);
  }

  private applyVolumes(): void {
    const ctx = this.buses?.ctx;
    if (!ctx) return;
    for (const [ch, g] of this.faders) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime(this.level(ch), ctx.currentTime, 0.04);
    }
    for (const fn of this.listeners) fn();
  }
}
