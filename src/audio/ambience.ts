import type { SoundKey } from './types';
import type { Buses } from './engine';

/**
 * The world's soft background: a low hum on the root and fifth of the world's key, slowly breathing, and a
 * wind of filtered noise that drifts in pitch. It runs as long as the page does; mute fades the master.
 */
export function startAmbience(b: Buses, key: SoundKey): void {
  const { ctx } = b;
  const hum = ctx.createGain();
  hum.gain.value = 0.03;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 320;
  hum.connect(low).connect(b.ambience);
  const root = key.rootHz / 2;
  for (const [ratio, detune] of [[1, -4], [1.5, 3], [2, 6]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = root * ratio;
    o.detune.value = detune;
    o.connect(hum);
    o.start();
  }
  const breathe = ctx.createOscillator();
  breathe.frequency.value = 0.07;
  const depth = ctx.createGain();
  depth.gain.value = 0.012;
  breathe.connect(depth).connect(hum.gain);
  breathe.start();

  const wind = ctx.createBufferSource();
  wind.buffer = b.noise;
  wind.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 520;
  band.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.022;
  wind.connect(band).connect(windGain).connect(b.ambience);
  const drift = ctx.createOscillator();
  drift.frequency.value = 0.05;
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = 260;
  drift.connect(driftDepth).connect(band.frequency);
  drift.start();
  wind.start();
}
