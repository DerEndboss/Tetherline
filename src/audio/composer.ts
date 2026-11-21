import { createRng, nextFloat, nextInt, type RngState } from '../sim/rng';
import { DRONE_BARS, trackBars, type TrackDef } from './tracks';

/**
 * The build tracks as pure data: `trackBar` turns a track definition (tracks.ts), a bar number and a seed into the
 * notes of that bar. Nothing here touches WebAudio (music.ts plays the bars), so the music is testable and
 * deterministic: the same seed gives the same bars, and a bar depends only on its number (so a track can be
 * resumed anywhere).
 *
 * A track follows its form: drone intro, verse (groove without melody), groove (with a call-and-response melody),
 * lift (everything, doubled melody, shaker), breakdown (no drums) and a drone outro. Each melodic section grows its
 * own motif from the seed and varies it from phrase to phrase.
 */

export type Voice = 'pad' | 'bass' | 'keys' | 'pluck' | 'vibes' | 'kick' | 'snare' | 'hat' | 'openhat' | 'shaker' | 'rim';
export type SectionKind = 'intro' | 'verse' | 'groove' | 'lift' | 'breakdown' | 'outro';

export interface MusicNote {
  voice: Voice;
  /** Start in beats from the bar's start (4 beats per bar), swing included. */
  beat: number;
  /** Length in beats. */
  len: number;
  /** Semitones above the track's root (negative = below). Ignored by the drums. */
  semi: number;
  /** 0..1 loudness. */
  vel: number;
}

export interface MusicBar {
  /** Bar number within the track. */
  index: number;
  track: string;
  section: SectionKind;
  /** Bar within its section, 0-based, and the section's length. */
  barInSection: number;
  sectionBars: number;
  bpm: number;
  notes: MusicNote[];
}

/** Beats per bar. */
export const BEATS = 4;

/** What plays in each kind of section. `lead`: 0 none, 1 call only, 2 every phrase, 3 every phrase doubled. */
interface Layers {
  drone: boolean;
  pad: number;
  comp: number;
  bass: boolean;
  kick: boolean;
  snare: boolean;
  hat: boolean;
  shaker: boolean;
  rim: boolean;
  lead: 0 | 1 | 2 | 3;
}

const LAYERS: Record<SectionKind, Layers> = {
  intro: { drone: true, pad: 0.7, comp: 0, bass: false, kick: false, snare: false, hat: false, shaker: false, rim: false, lead: 0 },
  verse: { drone: false, pad: 0.35, comp: 0.8, bass: true, kick: true, snare: true, hat: true, shaker: false, rim: true, lead: 0 },
  groove: { drone: false, pad: 0.4, comp: 0.85, bass: true, kick: true, snare: true, hat: true, shaker: true, rim: true, lead: 1 },
  lift: { drone: false, pad: 0.5, comp: 1, bass: true, kick: true, snare: true, hat: true, shaker: true, rim: true, lead: 3 },
  breakdown: { drone: false, pad: 0.55, comp: 0.7, bass: false, kick: false, snare: false, hat: false, shaker: true, rim: false, lead: 2 },
  outro: { drone: true, pad: 0.7, comp: 0, bass: false, kick: false, snare: false, hat: false, shaker: false, rim: false, lead: 0 },
};

export interface SectionAt {
  kind: SectionKind;
  /** Position of the section in the form, its first bar and its length. */
  n: number;
  from: number;
  bars: number;
}

/** The section a bar of the track belongs to (bars past the end wrap around). */
export function sectionAt(def: TrackDef, index: number): SectionAt {
  let bar = ((index % trackBars(def)) + trackBars(def)) % trackBars(def);
  let from = 0;
  for (let n = 0; n < def.form.length; n++) {
    const [kind, bars] = def.form[n]!;
    if (bar < bars) return { kind, n, from, bars };
    bar -= bars;
    from += bars;
  }
  throw new Error('unreachable: bar inside the form');
}

/** Semitones of scale step `step` (0 = root; steps past the scale go up an octave, negative ones down). */
export function scaleSemi(scale: readonly number[], step: number): number {
  const n = scale.length;
  const octave = Math.floor(step / n);
  return scale[((step % n) + n) % n]! + octave * 12;
}

/** Beat of a 16th-note step with the track's swing: off-beat sixteenths (or eighths) arrive a little late. */
export function stepBeat(def: TrackDef, step: number): number {
  const { grid, amount } = def.swing;
  const late = grid === 16 ? step % 2 === 1 : step % 4 === 2;
  const shift = grid === 16 ? (amount * 1) / 12 : amount / 6;
  return step / 4 + (late ? shift : 0);
}

function note(voice: Voice, beat: number, len: number, semi: number, vel: number): MusicNote {
  return { voice, beat, len, semi, vel: Math.min(1, Math.max(0, vel)) };
}

/** Seeded random stream for one place in the music: same arguments, same numbers. */
function streamFor(seed: number, ...parts: number[]): RngState {
  let h = seed >>> 0;
  for (const p of parts) h = Math.imul(h ^ (p + 0x9e3779b9), 0x85ebca6b) >>> 0;
  return createRng(h);
}

function textHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** The chord loop is aligned to the end of the drone intro. */
function chordFor(def: TrackDef, index: number): TrackDef['chords'][number] {
  const n = def.chords.length;
  return def.chords[(((index - DRONE_BARS) % n) + n) % n]!;
}

function droneNotes(sec: SectionAt, index: number, layers: Layers): MusicNote[] {
  const at = index - sec.from;
  if (at % 2 !== 0) return [];
  const notes = [0, 7, 12].map((s) => note('pad', 0, 8, s, layers.pad * (s === 7 ? 0.8 : 1)));
  if (sec.kind === 'intro' && at === 2) notes.push(note('vibes', 2, 3, 12, 0.3), note('vibes', 3, 3, 19, 0.25));
  return notes;
}

function padNotes(def: TrackDef, index: number, layers: Layers): MusicNote[] {
  const chord = chordFor(def, index);
  return [chord.notes[0]!, chord.notes[2]!].map((s) => note('pad', 0, 4, s, layers.pad * 0.6));
}

function compNotes(def: TrackDef, index: number, layers: Layers): MusicNote[] {
  const chord = chordFor(def, index);
  const out: MusicNote[] = [];
  for (const hit of def.comp.hits) {
    chord.notes.forEach((semi, i) => out.push(note(def.comp.voice, stepBeat(def, hit.step) + i * 0.012, hit.len / 4, semi, hit.vel * layers.comp * (1 - i * 0.07))));
  }
  return out;
}

function bassNotes(def: TrackDef, index: number): MusicNote[] {
  const chord = chordFor(def, index);
  return def.bass.map((h) => note('bass', stepBeat(def, h.step), h.len / 4, chord.bass + h.interval, h.vel));
}

/** The bar's drums; a groove or lift ends its eight bars with a snare roll and starts the next with an open hat. */
function drumNotes(def: TrackDef, layers: Layers, sec: SectionAt, index: number): MusicNote[] {
  const kit = def.drums;
  const out: MusicNote[] = [];
  const rows: [boolean, Voice, readonly number[]][] = [
    [layers.kick, 'kick', kit.kick],
    [layers.snare, 'snare', kit.snare],
    [layers.hat, 'hat', kit.hat],
    [layers.shaker, 'shaker', kit.shaker],
    [layers.rim, 'rim', kit.rim],
  ];
  for (const [on, voice, row] of rows) {
    if (!on) continue;
    row.forEach((vel, step) => {
      if (vel > 0) out.push(note(voice, stepBeat(def, step), 0.2, 0, vel));
    });
  }
  const last = index - sec.from === sec.bars - 1;
  if (last && sec.bars >= 8 && layers.snare) {
    for (let k = 0; k < 4; k++) out.push(note('snare', stepBeat(def, 12 + k), 0.2, 0, 0.25 + k * 0.15));
  }
  if (index === sec.from && sec.n > 0 && layers.kick) out.push(note('openhat', 0, 1, 0, 0.6));
  return out;
}

/** One melody note of a motif: a step in the 32-step, two-bar phrase and a position in the scale. */
interface MotifNote {
  step: number;
  pos: number;
  len: number;
}

/** Grows a motif: five or six notes on mostly eighth-note positions, a random walk in the scale that settles on the root or fifth. */
function makeMotif(rng: RngState, scale: readonly number[]): MotifNote[] {
  const count = nextInt(rng, 5, 6);
  const steps = new Set<number>([nextInt(rng, 0, 1) * 2]);
  while (steps.size < count) {
    const s = nextInt(rng, 1, 15) * 2 - (nextFloat(rng) < 0.25 ? 1 : 0);
    if (![...steps].some((o) => Math.abs(o - s) < 2)) steps.add(s);
  }
  const sorted = [...steps].sort((a, b) => a - b);
  let pos = nextInt(rng, 1, 3);
  const walk = [-2, -1, -1, 1, 1, 2];
  const motif = sorted.map((step, i) => {
    pos = Math.max(-1, Math.min(2 * scale.length - 3, pos + walk[nextInt(rng, 0, walk.length - 1)]!));
    const next = sorted[i + 1] ?? 32;
    return { step, pos, len: Math.min(6, next - step) };
  });
  const end = motif[motif.length - 1]!;
  end.pos = Math.round(end.pos / scale.length) * scale.length;
  end.len = Math.min(8, 32 - end.step);
  return motif;
}

/** Phrase p of a section plays the motif plainly, moved a step, with a new ending, or thinned out. */
function varyMotif(motif: readonly MotifNote[], phrase: number, scale: readonly number[]): MotifNote[] {
  const kind = phrase % 4;
  const top = 2 * scale.length - 3;
  let out: MotifNote[] = motif.map((m) => ({ ...m }));
  if (kind === 1) out = out.map((m, i) => ({ ...m, pos: m.pos + (i === out.length - 1 ? 0 : phrase % 8 < 4 ? 1 : -1) }));
  if (kind === 2) out = out.map((m, i) => (i >= out.length - 2 ? { ...m, pos: m.pos + (i % 2 === 0 ? 2 : -1) } : m));
  if (kind === 3) out = out.filter((_, i) => i % 2 === 0 || i === out.length - 1).map((m) => ({ ...m, len: Math.min(8, m.len + 2) }));
  return out.map((m) => ({ ...m, pos: Math.max(-1, Math.min(top, m.pos)) }));
}

function leadNotes(def: TrackDef, layers: Layers, sec: SectionAt, index: number, seed: number): MusicNote[] {
  const at = index - sec.from;
  const phrase = Math.floor(at / 2);
  const half = at % 2;
  if (layers.lead === 0 || (layers.lead === 1 && phrase % 2 === 1)) return [];
  const motif = makeMotif(streamFor(seed, textHash(def.id), sec.n, sec.from), def.scale);
  const out: MusicNote[] = [];
  for (const m of varyMotif(motif, phrase, def.scale)) {
    if (m.step < half * 16 || m.step >= half * 16 + 16) continue;
    const step = m.step - half * 16;
    const semi = 12 + scaleSemi(def.scale, m.pos);
    const vel = 0.55 + (step % 4 === 0 ? 0.15 : 0);
    out.push(note(def.lead, stepBeat(def, step), m.len / 4, semi, vel * (layers.lead === 2 ? 0.9 : 1)));
    if (layers.lead === 3) out.push(note('vibes', stepBeat(def, step) + 0.02, m.len / 4, semi + 12, 0.3));
  }
  return out;
}

/** Tiny human differences in loudness and timing; deterministic for the bar. */
function humanize(notes: MusicNote[], rng: RngState): MusicNote[] {
  return notes.map((n) => {
    const drum = n.voice === 'kick' || n.voice === 'snare';
    const vel = Math.min(1, Math.max(0.05, n.vel * (0.92 + nextFloat(rng) * 0.16)));
    const beat = n.beat + (drum ? 0 : (nextFloat(rng) - 0.5) * 0.014);
    return { ...n, vel, beat: Math.max(0, beat) };
  });
}

/** Bar `index` of a track, for a seed. */
export function trackBar(def: TrackDef, index: number, seed: number): MusicBar {
  const sec = sectionAt(def, index);
  const layers = LAYERS[sec.kind];
  const notes: MusicNote[] = [];
  if (layers.drone) notes.push(...droneNotes(sec, index, layers));
  else if (layers.pad > 0) notes.push(...padNotes(def, index, layers));
  if (layers.comp > 0) notes.push(...compNotes(def, index, layers));
  if (layers.bass) notes.push(...bassNotes(def, index));
  notes.push(...drumNotes(def, layers, sec, index));
  notes.push(...leadNotes(def, layers, sec, index, seed));
  return {
    index,
    track: def.id,
    section: sec.kind,
    barInSection: index - sec.from,
    sectionBars: sec.bars,
    bpm: def.bpm,
    notes: humanize(notes, streamFor(seed, textHash(def.id), index)),
  };
}

/** The order the tracks follow: a seeded shuffle each round, never the same track twice in a row. */
export function trackOrder(seed: number, count: number, round: number, previous = -1): number[] {
  const rng = streamFor(seed, 0x7ac, round);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (order[0] === previous) order.push(order.shift()!);
  return order;
}
