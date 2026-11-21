import { content } from '../content';
import type { SimEvent } from '../sim/commands';
import { startAmbience } from './ambience';
import { onCue, type Cue } from './cues';
import type { AudioEngine, Buses } from './engine';
import { emptySoundscape, MachineAmbience } from './machines';
import { MusicPlayer } from './music';
import { beltDone, beltTick, breakApart, buildDone, chime, crumble, ghostCancel, ghostPlaced, siteStart, sparkle, swell, uiBlip, uiKnock, uiTick } from './sfx';
import { scanSoundscape, type SceneView } from './soundscape';
import { noteHz, type SoundKey, type UiSound } from './types';

/**
 * The game's sound: the build tracks (music.ts), the world's wind and hum, the machines you can see and hear by
 * zoom (machines.ts, fed by `watch`), the sound of every building action (ghost placed, site started, construction
 * finished, belt drag, removal) and the interface sounds. Effects are notes of the world's key.
 *
 * Wiring: `new GameSound(engine, key, seed)`, `game.onEvents(sound.onEvents)`, and `sound.watch(() => view)` so
 * the machines follow the camera. Input code reports ghosts and belt drags with `emitCue` (cues.ts).
 */
const SCENE_MS = 250;
/** Least seconds between two sounds of one kind, so a burst of events stays a pleasant patter. */
const GAP = { built: 0.045, site: 0.12, removed: 0.05, belt: 0.03, ghost: 0.04 };
/** A batch of builds in one tick rings as a short run of notes, not one loud pile. */
const MAX_RUN = 6;

export class GameSound {
  private readonly music: MusicPlayer;
  private machines: MachineAmbience | null = null;
  private probe: (() => SceneView | null) | null = null;
  private readonly last = { built: 0, site: 0, removed: 0, belt: 0, ghost: 0 };
  private step = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly key: SoundKey,
    seed: number,
  ) {
    this.music = new MusicPlayer(engine, seed);
    engine.music = this.music;
    engine.onStart((b) => {
      startAmbience(b, key);
      this.machines = new MachineAmbience(b, key);
      this.music.start();
      window.setInterval(() => this.updateScene(), SCENE_MS);
    });
    onCue((cue) => this.cue(cue));
  }

  /** Lets the machine layers follow what the camera sees. `probe` is polled four times a second. */
  watch(probe: () => SceneView | null): void {
    this.probe = probe;
  }

  private updateScene(): void {
    const view = this.probe?.() ?? null;
    if (!this.machines || !this.engine.live) return;
    const scene = view ? scanSoundscape(view) : emptySoundscape();
    this.machines.update(this.engine.audible('ambience') ? scene : emptySoundscape(scene.zoom), this.music.pulse());
  }

  /** Whether `kind` may sound at `at`; remembers the time when it may. */
  private free(kind: keyof typeof GAP, at: number): boolean {
    if (at - this.last[kind] < GAP[kind]) return false;
    this.last[kind] = at;
    return true;
  }

  onEvents = (events: readonly SimEvent[]): void => {
    const b = this.engine.live;
    if (!b) return;
    const at = b.ctx.currentTime + 0.005;
    let run = 0;
    for (const e of events) {
      if (e.type === 'built') {
        if (run < MAX_RUN) this.built(b, e.kind, at + run * 0.07);
        run += 1;
      } else this.other(b, e, at);
    }
  };

  /** Construction finished: the thump and clank grow with the building's size, the notes climb the key. */
  private built(b: Buses, kind: number, at: number): void {
    if (!this.free('built', at)) return;
    const size = content.buildings.list[kind]?.size ?? 1;
    const base = this.step % 5;
    this.step += 1;
    buildDone(b, [0, 2, 4, 5].map((i) => noteHz(this.key, base + i)), size, at);
  }

  private other(b: Buses, e: SimEvent, at: number): void {
    const type: string = e.type;
    const note = (i: number): number => noteHz(this.key, i);
    const chord = (steps: number[]): number[] => steps.map(note);
    const play: Record<string, () => void> = {
      site: () => this.free('site', at) && siteStart(b, note(3), at, 0.8),
      removed: () => this.free('removed', at) && crumble(b, at, 0.55),
      'boulder-cleared': () => this.free('removed', at) && breakApart(b, 'stone', note(-2), at, 0.6),
      'plan-dropped': () => uiKnock(b, note(1), at),
      'order-done': () => chime(b, note(7), at),
      'core-upgraded': () => swell(b, chord([0, 2, 4, 7]), at),
      won: () => swell(b, chord([0, 2, 4, 7]), at, 1.3),
      'drone-added': () => sparkle(b, chord([4, 6, 9]), at, 0.06, 0.9),
    };
    play[type]?.();
  }

  private cue(cue: Cue): void {
    const b = this.engine.live;
    if (!b) return;
    const at = b.ctx.currentTime + 0.005;
    if (cue.type === 'ghost' && this.free('ghost', at)) ghostPlaced(b, noteHz(this.key, 2 + ((this.step++ * 2) % 7)), at, Math.min(1.3, 0.8 + (cue.count ?? 1) * 0.05));
    else if (cue.type === 'ghost-cancel' && this.free('ghost', at)) ghostCancel(b, noteHz(this.key, 3), at);
    else if (cue.type === 'belt-tick' && this.free('belt', at)) beltTick(b, noteHz(this.key, 3 + Math.min(cue.length, 10)), at, 0.7);
    else if (cue.type === 'belt-done') beltDone(b, [0, 2, 4].map((i) => noteHz(this.key, 5 + i)), at);
  }

  ui(kind: UiSound): void {
    const b = this.engine.live;
    if (!b) return;
    const at = b.ctx.currentTime + 0.005;
    if (kind === 'tab' || kind === 'click') uiTick(b, noteHz(this.key, 4), at, 0.6);
    else if (kind === 'confirm' || kind === 'open') uiBlip(b, noteHz(this.key, 2), noteHz(this.key, 5), at, 0.6);
    else if (kind === 'close' || kind === 'toggle-off') uiBlip(b, noteHz(this.key, 5), noteHz(this.key, 2), at, 0.5);
    else if (kind === 'toggle-on') uiBlip(b, noteHz(this.key, 3), noteHz(this.key, 6), at, 0.5);
    else if (kind === 'disabled') uiKnock(b, noteHz(this.key, 1), at);
  }
}
