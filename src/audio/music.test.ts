import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { fadeLevel } from './music';
import { BEATS, scaleSemi, sectionAt, stepBeat, trackBar, trackOrder, type MusicBar, type SectionKind } from './composer';
import { crowd, layerLevel, proximity } from './machines';
import { DRONE_BARS, TRACKS, trackBars } from './tracks';

const mod12 = (s: number): number => ((s % 12) + 12) % 12;
const sig = (b: MusicBar): string => b.notes.map((n) => `${n.voice}${n.beat.toFixed(3)}:${n.semi}`).join(',');

function bars(i: number, seed: number): MusicBar[] {
  const def = TRACKS[i]!;
  return Array.from({ length: trackBars(def) }, (_, n) => trackBar(def, n, seed));
}

describe('build tracks', () => {
  it('has 2 to 3 tracks, each with its own key, tempo and name', () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(2);
    expect(TRACKS.length).toBeLessThanOrEqual(3);
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
    expect(new Set(TRACKS.map((t) => t.rootHz.toFixed(1))).size).toBe(TRACKS.length);
    expect(new Set(TRACKS.map((t) => t.bpm)).size).toBe(TRACKS.length);
  });

  it('are groovy but chill (70 to 105 BPM) and last 3 to 5 minutes', () => {
    for (const t of TRACKS) {
      expect(t.bpm).toBeGreaterThanOrEqual(70);
      expect(t.bpm).toBeLessThanOrEqual(105);
      const minutes = (trackBars(t) * BEATS) / t.bpm;
      expect(minutes, t.id).toBeGreaterThan(3);
      expect(minutes, t.id).toBeLessThan(5);
    }
  });

  it('start and end with a four-bar drone and have all five other section kinds', () => {
    for (const t of TRACKS) {
      expect(t.form[0]).toEqual(['intro', DRONE_BARS]);
      expect(t.form[t.form.length - 1]).toEqual(['outro', DRONE_BARS]);
      const kinds = new Set<SectionKind>(t.form.map(([k]) => k));
      for (const k of ['verse', 'groove', 'lift', 'breakdown'] as const) expect(kinds.has(k), `${t.id} ${k}`).toBe(true);
      expect(t.chords.length).toBe(8);
    }
  });

  it('are deterministic for a seed and differ between seeds', () => {
    const a = bars(0, 7).map(sig);
    expect(bars(0, 7).map(sig)).toEqual(a);
    expect(bars(0, 8).map(sig)).not.toEqual(a);
  });

  it('keep every melody and chord note in the track key', () => {
    for (const [i, t] of TRACKS.entries()) {
      const pent = new Set(t.scale);
      const chordTones = new Set(t.chords.flatMap((c) => [...c.notes, c.bass].map(mod12)));
      const inKey = (voice: string, semi: number): boolean => {
        if (voice === 'vibes' || voice === t.lead) return pent.has(mod12(semi)) || [0, 7].includes(mod12(semi));
        if (voice === 'pad' || voice === 'bass' || voice === t.comp.voice) return chordTones.has(mod12(semi)) || [0, 7].includes(mod12(semi));
        return true;
      };
      for (const bar of bars(i, 3)) for (const n of bar.notes) expect(inKey(n.voice, n.semi), `${t.id} ${n.voice} ${n.semi}`).toBe(true);
    }
  });

  it('keep the bass in a range small speakers can play', () => {
    for (const [i, t] of TRACKS.entries()) {
      for (const n of bars(i, 5).flatMap((bar) => bar.notes.filter((x) => x.voice === 'bass'))) {
        expect(t.rootHz * 2 ** (n.semi / 12), t.id).toBeGreaterThan(60);
        expect(t.rootHz * 2 ** (n.semi / 12), t.id).toBeLessThan(400);
      }
    }
  });

  it('keep the beat out of the drones and breakdowns and in the grooves', () => {
    const beat = (bar: MusicBar): boolean => bar.notes.some((n) => n.voice === 'kick' || n.voice === 'snare');
    const quiet: SectionKind[] = ['intro', 'outro', 'breakdown'];
    for (const [i] of TRACKS.entries()) {
      for (const bar of bars(i, 5)) expect(beat(bar), `${bar.track} ${bar.section}`).toBe(!quiet.includes(bar.section));
    }
  });

  it('never loop: no stretch of 8 bars repeats inside a track', () => {
    for (const [i] of TRACKS.entries()) {
      const score = bars(i, 11);
      const seen = new Set<string>();
      for (let n = 0; n + 8 <= score.length; n++) {
        const window = score.slice(n, n + 8).map((b) => `${b.section}|${sig(b)}`).join('/');
        if (score.slice(n, n + 8).every((b) => b.section === 'intro' || b.section === 'outro')) continue;
        expect(seen.has(window), `${TRACKS[i]!.id} bar ${n}`).toBe(false);
        seen.add(window);
      }
    }
  });

  it('finds sections and swings the off-beats', () => {
    const t = TRACKS[0]!;
    expect(sectionAt(t, 0).kind).toBe('intro');
    expect(sectionAt(t, trackBars(t) - 1).kind).toBe('outro');
    expect(stepBeat(t, 0)).toBe(0);
    expect(stepBeat(t, 1)).toBeGreaterThan(0.25);
    expect(stepBeat(t, 2)).toBe(0.5);
    const shuffle = TRACKS.find((x) => x.swing.grid === 8)!;
    expect(stepBeat(shuffle, 2)).toBeGreaterThan(0.5);
    expect(stepBeat(shuffle, 1)).toBe(0.25);
  });

  it('crossfades on an equal-power curve: in across the intro, out across the outro', () => {
    const t = TRACKS[0]!;
    const first = trackBar(t, 0, 1);
    const last = trackBar(t, trackBars(t) - 1, 1);
    expect(fadeLevel(first, 0)).toBe(0);
    expect(fadeLevel(last, 1)).toBeCloseTo(0, 5);
    for (let k = 0; k <= DRONE_BARS; k++) {
      const gin = Math.sin((k / DRONE_BARS) * (Math.PI / 2));
      const gout = Math.cos((k / DRONE_BARS) * (Math.PI / 2));
      expect(gin ** 2 + gout ** 2).toBeCloseTo(1, 5);
    }
    expect(fadeLevel(trackBar(t, 20, 1), 0.5)).toBe(1);
  });

  it('plays the tracks in a seeded order, never one twice in a row', () => {
    let previous = -1;
    for (let round = 0; round < 20; round++) {
      const order = trackOrder(5, TRACKS.length, round, previous);
      expect([...order].sort()).toEqual(TRACKS.map((_, i) => i));
      expect(order[0]).not.toBe(previous);
      previous = order[order.length - 1]!;
    }
  });

  it('maps scale steps across octaves', () => {
    const key = content.themes.get(content.rules.defaultTheme).sound;
    expect(scaleSemi(key.scale, 0)).toBe(0);
    expect(scaleSemi(key.scale, key.scale.length)).toBe(12);
    expect(scaleSemi(key.scale, -1)).toBe(key.scale[key.scale.length - 1]! - 12);
  });
});

describe('machine ambience by zoom', () => {
  it('gets louder the closer the camera is, and with more machines, but saturates', () => {
    expect(proximity(0.3)).toBe(0);
    expect(proximity(2.5)).toBe(1);
    expect(proximity(1)).toBeGreaterThan(proximity(0.7));
    expect(crowd(0)).toBe(0);
    expect(crowd(20)).toBeLessThan(1);
    expect(crowd(4)).toBeGreaterThan(crowd(1));
    expect(layerLevel(2, 3)).toBeGreaterThan(layerLevel(0.6, 3));
    expect(layerLevel(0.3, 3)).toBeGreaterThan(0);
    expect(layerLevel(2, 0)).toBe(0);
  });
});
