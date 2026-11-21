import type { MachineSound, SoundKey } from './types';
import type { Buses } from './engine';

/**
 * The base at work, heard through the camera (the ambience follows the zoom): machines on screen thump
 * softly in time with the music, belts hum, smelters hiss, mixers and fabricators whirr, generators rumble, labs
 * hum a fifth. Each layer runs continuously at silence and fades with what is on screen and how close the camera
 * is: zoomed out the base is a faint bed, zoomed in the machines are right there. Which sound a building makes is
 * data (`BuildingDef.ambience`).
 */
export interface Soundscape {
  /** Camera zoom (0.3 far .. 2.5 close). */
  zoom: number;
  /** Running machines on screen, by sound. */
  machines: Record<MachineSound, number>;
  /** Belt tiles on screen with goods moving on them. */
  belts: number;
}

export function emptySoundscape(zoom = 1): Soundscape {
  return { zoom, machines: { thump: 0, hiss: 0, whirr: 0, hum: 0, burn: 0 }, belts: 0 };
}

/** How close the camera feels: 0 far out (zoom 0.45 and below) .. 1 close (zoom 1.6 and up). */
export function proximity(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - 0.45) / (1.6 - 0.45)));
  return t ** 1.3;
}

/** Many machines are louder than one, but not twenty times louder. */
export function crowd(count: number, half = 2.5): number {
  return count <= 0 ? 0 : 1 - Math.exp(-count / half);
}

/** Loudness of one layer, 0..1: a faint bed far out, the full sound up close. */
export function layerLevel(zoom: number, count: number): number {
  return crowd(count) * (0.12 + 0.88 * proximity(zoom));
}

type Layer = Exclude<MachineSound, 'thump'> | 'belts';
/** Peak gain of each layer at level 1. */
const PEAK: Record<Layer, number> = { hiss: 0.04, whirr: 0.035, hum: 0.028, burn: 0.03, belts: 0.032 };

export class MachineAmbience {
  private readonly layers = new Map<Layer, GainNode>();
  private thumpLevel = 0;
  private nextThump = 0;
  private thumpCount = 0;

  constructor(
    private readonly b: Buses,
    private readonly key: SoundKey,
  ) {
    this.layers.set('belts', this.beltHum());
    this.layers.set('hiss', this.hiss());
    this.layers.set('whirr', this.whirr());
    this.layers.set('hum', this.labHum());
    this.layers.set('burn', this.rumble());
  }

  /** Fades every layer to what the camera sees; schedules the thumps on the beat (`pulse` from the music). */
  update(scene: Soundscape, pulse: { beat: number; barAt: number } | null): void {
    const now = this.b.ctx.currentTime;
    for (const [layer, gain] of this.layers) {
      const count = layer === 'belts' ? scene.belts : scene.machines[layer];
      gain.gain.setTargetAtTime(PEAK[layer] * layerLevel(scene.zoom, count), now, 0.35);
    }
    this.thumpLevel = layerLevel(scene.zoom, scene.machines.thump);
    this.thumps(now, pulse);
  }

  /** Soft low thumps on the beat while mines run on screen (on every other beat when there are few). */
  private thumps(now: number, pulse: { beat: number; barAt: number } | null): void {
    const beat = pulse?.beat ?? 0.8;
    if (this.thumpLevel < 0.02) {
      this.nextThump = 0;
      return;
    }
    if (this.nextThump < now) {
      // Snap onto the music's grid: the next beat after now.
      const origin = pulse?.barAt ?? now;
      this.nextThump = origin + Math.ceil((now + 0.05 - origin) / beat) * beat;
    }
    while (this.nextThump < now + 0.4) {
      const every = this.thumpLevel > 0.5 ? 1 : 2;
      if (this.thumpCount % every === 0) this.thump(this.nextThump, this.thumpCount % 4 === 2);
      this.thumpCount += 1;
      this.nextThump += beat;
    }
  }

  private thump(at: number, fifth: boolean): void {
    const { ctx } = this.b;
    const g = ctx.createGain();
    const peak = 0.09 * this.thumpLevel;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    g.connect(this.b.ambience);
    const f = (this.key.rootHz / 2) * (fifth ? 1.5 : 1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.8, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.07);
    o.connect(g);
    o.start(at);
    o.stop(at + 0.25);
    // A muffled clack on top: the drill head biting.
    const n = ctx.createBufferSource();
    n.buffer = this.b.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, at);
    ng.gain.exponentialRampToValueAtTime(peak * 0.5, at + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    n.connect(lp).connect(ng).connect(this.b.ambience);
    n.start(at, Math.random() * 0.8);
    n.stop(at + 0.08);
  }

  private silent(): GainNode {
    const g = this.b.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.b.ambience);
    return g;
  }

  private noiseInto(to: AudioNode, filter: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
    const src = this.b.ctx.createBufferSource();
    src.buffer = this.b.noise;
    src.loop = true;
    const f = this.b.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(to);
    src.start(0, Math.random());
    return f;
  }

  private lfo(rate: number, depth: number, param: AudioParam): void {
    const o = this.b.ctx.createOscillator();
    o.frequency.value = rate;
    const g = this.b.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
  }

  private sine(f: number, level: number, to: AudioNode): OscillatorNode {
    const o = this.b.ctx.createOscillator();
    o.frequency.value = f;
    const g = this.b.ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(to);
    o.start();
    return o;
  }

  /** Belts: a low hum on the root with a slow wobble, plus the soft roll of rollers. */
  private beltHum(): GainNode {
    const out = this.silent();
    const o = this.sine(this.key.rootHz / 2, 0.5, out);
    this.lfo(0.6, 1.5, o.frequency);
    this.sine(this.key.rootHz, 0.15, out);
    this.noiseInto(out, 'bandpass', 260, 1.2);
    return out;
  }

  /** Smelters: a soft steam hiss that breathes. */
  private hiss(): GainNode {
    const out = this.silent();
    const breath = this.b.ctx.createGain();
    breath.gain.value = 0.6;
    breath.connect(out);
    this.lfo(0.23, 0.35, breath.gain);
    this.noiseInto(breath, 'highpass', 3200, 0.6);
    return out;
  }

  /** Mixers and fabricators: a motor whirr, a band of noise pulsing at 7 Hz with a quiet tone on the fifth. */
  private whirr(): GainNode {
    const out = this.silent();
    const motor = this.b.ctx.createGain();
    motor.gain.value = 0.6;
    motor.connect(out);
    this.lfo(7, 0.3, motor.gain);
    const band = this.noiseInto(motor, 'bandpass', 950, 3);
    this.lfo(0.15, 120, band.frequency);
    this.sine(this.key.rootHz * 1.5, 0.08, out);
    return out;
  }

  /** Labs: a clean hum on the fifth with a slow shimmer. */
  private labHum(): GainNode {
    const out = this.silent();
    const shimmer = this.b.ctx.createGain();
    shimmer.gain.value = 0.7;
    shimmer.connect(out);
    this.lfo(0.4, 0.25, shimmer.gain);
    this.sine(this.key.rootHz * 0.75, 0.6, shimmer);
    this.sine(this.key.rootHz * 1.5, 0.2, shimmer);
    return out;
  }

  /** Generators: a low rumble of fire. */
  private rumble(): GainNode {
    const out = this.silent();
    const flicker = this.b.ctx.createGain();
    flicker.gain.value = 0.7;
    flicker.connect(out);
    this.lfo(1.7, 0.25, flicker.gain);
    this.noiseInto(flicker, 'bandpass', 190, 0.9);
    return out;
  }
}
