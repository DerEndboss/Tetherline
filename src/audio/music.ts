import { BEATS, trackBar, trackOrder, type MusicBar } from './composer';
import type { AudioEngine, Buses } from './engine';
import { playNote, type Out } from './instruments';
import { DRONE_BARS, TRACKS, trackBars, type TrackDef } from './tracks';

/**
 * Plays the build tracks (tracks.ts, composed bar by bar in composer.ts) with a look-ahead scheduler: bars are
 * scheduled on the audio clock a little before they sound, so timing stays exact however the page's frames stutter.
 *
 * Two or three tracks follow each other for as long as the game runs. Each plays about four minutes; its last four
 * bars (a bare drone on root and fifth) overlap the next track's first four, and the volume of each crossfades
 * on an equal-power curve across those bars, so the change is a slow blend. The order is a seeded shuffle that never
 * plays one track twice in a row. While muted or at zero volume nothing is scheduled; the music goes on from a
 * fresh bar when it returns.
 */
const AHEAD = 0.8;
const LOOK_MS = 120;

/** What the settings window shows and does with the music. */
export interface MusicControl {
  nowPlaying(): { id: string; name: string } | null;
  /** Starts the crossfade to the next track at the next bar. */
  skip(): void;
}

/** One track being played: its buses, the next bar to schedule and when that bar starts. */
interface Deck {
  def: TrackDef;
  out: Out;
  faders: GainNode[];
  index: number;
  nextAt: number;
  /** Start of the bar scheduled last, for the machine thumps and "now playing". */
  lastAt: number;
  lastBar: MusicBar | null;
  done: boolean;
}

export class MusicPlayer implements MusicControl {
  private timer: number | null = null;
  private decks: Deck[] = [];
  private round = 0;
  private queue: number[] = [];
  private previous = -1;

  constructor(
    private readonly engine: AudioEngine,
    private readonly seed: number,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.schedule(), LOOK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** The music's pulse right now: seconds per beat and the audio time of the newest started bar's first beat. */
  pulse(): { beat: number; barAt: number } | null {
    const now = this.engine.live?.ctx.currentTime ?? 0;
    const deck = this.newest((d) => d.lastBar !== null && d.lastAt <= now + AHEAD);
    return deck?.lastBar ? { beat: 60 / deck.def.bpm, barAt: deck.lastAt } : null;
  }

  nowPlaying(): { id: string; name: string } | null {
    const deck = this.newest((d) => d.lastBar !== null);
    return deck ? { id: deck.def.id, name: deck.def.name } : null;
  }

  skip(): void {
    const deck = this.newest((d) => !d.done);
    const outroAt = deck ? trackBars(deck.def) - DRONE_BARS : 0;
    if (deck && deck.index < outroAt) deck.index = outroAt;
  }

  private newest(pick: (d: Deck) => boolean): Deck | undefined {
    return this.decks.findLast(pick);
  }

  private nextTrack(): TrackDef {
    if (this.queue.length === 0) {
      this.queue = trackOrder(this.seed, TRACKS.length, this.round++, this.previous);
    }
    const n = this.queue.shift()!;
    this.previous = n;
    return TRACKS[n]!;
  }

  private startDeck(at: number): void {
    const b = this.engine.live;
    if (!b) return;
    const def = this.nextTrack();
    const dryFade = b.ctx.createGain();
    const wetFade = b.ctx.createGain();
    dryFade.gain.value = 0;
    wetFade.gain.value = 0;
    const tone = b.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = def.warmth;
    tone.Q.value = 0.5;
    dryFade.connect(tone).connect(b.music);
    wetFade.connect(b.musicWet);
    const dry = b.ctx.createGain();
    const wet = b.ctx.createGain();
    dry.connect(dryFade);
    wet.connect(wetFade);
    this.decks.push({ def, out: { dry, wet }, faders: [dryFade, wetFade], index: 0, nextAt: at, lastAt: 0, lastBar: null, done: false });
  }

  private schedule(): void {
    const b = this.engine.live;
    if (!b || !this.engine.audible('music')) {
      for (const d of this.decks) d.nextAt = 0;
      return;
    }
    const now = b.ctx.currentTime;
    if (this.decks.length === 0) this.startDeck(now + 0.1);
    // A deck may start another while it plays (the crossfade), so walk the list as it grows.
    for (let i = 0; i < this.decks.length; i++) this.fill(b, this.decks[i]!, now);
    this.retire(now);
  }

  /** Schedules a deck's bars up to the look-ahead. */
  private fill(b: Buses, deck: Deck, now: number): void {
    // First bar, or the page slept (hidden tab, muted): start again a moment from now instead of catching up.
    if (deck.nextAt < now + 0.02) deck.nextAt = now + 0.1;
    while (!deck.done && deck.nextAt < now + AHEAD) this.playBar(b, deck);
  }

  /** Drops the decks whose last bar has sounded. */
  private retire(now: number): void {
    for (const d of this.decks) if (d.done && d.nextAt <= now) d.faders.forEach((f) => f.disconnect());
    this.decks = this.decks.filter((d) => !d.done || d.nextAt > now);
  }

  private playBar(b: Buses, deck: Deck): void {
    const bar = trackBar(deck.def, deck.index, this.seed);
    const total = trackBars(deck.def);
    const start = deck.nextAt;
    const length = (BEATS * 60) / deck.def.bpm;
    // The first outro bar starts the next track, so the two drones overlap.
    if (deck.index === total - DRONE_BARS && this.decks[this.decks.length - 1] === deck) this.startDeck(start);
    fade(deck.faders, bar, start, length);
    playBarNotes(b, deck, bar, start);
    deck.lastBar = bar;
    deck.lastAt = start;
    deck.nextAt += length;
    deck.index += 1;
    if (deck.index >= total) deck.done = true;
  }
}

/** Equal-power fade over the drone bars: in across the intro, out across the outro, a straight line per bar. */
function fade(gains: readonly GainNode[], bar: MusicBar, at: number, length: number): void {
  const from = fadeLevel(bar, 0);
  const to = fadeLevel(bar, 1);
  for (const g of gains) {
    g.gain.cancelScheduledValues(at);
    g.gain.setValueAtTime(from, at);
    g.gain.linearRampToValueAtTime(to, at + length);
  }
}

/** Gain at `part` (0..1) of a bar: 0 to 1 over the intro, 1 to 0 over the outro, else 1. */
export function fadeLevel(bar: MusicBar, part: number): number {
  if (bar.section === 'intro') return Math.sin(((bar.barInSection + part) / bar.sectionBars) * (Math.PI / 2));
  if (bar.section === 'outro') return Math.cos(((bar.barInSection + part) / bar.sectionBars) * (Math.PI / 2));
  return 1;
}

function playBarNotes(b: Buses, deck: Deck, bar: MusicBar, at: number): void {
  const spb = 60 / bar.bpm;
  for (const n of bar.notes) playNote(b, deck.out, deck.def.rootHz, n, at, spb);
}

/** Schedules one bar of a track on any buses at audio time `at`, with its own dry and wet outs (offline renders). */
export function playBarOn(b: Buses, def: TrackDef, bar: MusicBar, at: number, out: Out): number {
  const spb = 60 / bar.bpm;
  for (const n of bar.notes) playNote(b, out, def.rootHz, n, at, spb);
  return BEATS * spb;
}
