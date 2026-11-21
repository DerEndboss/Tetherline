/** Musical key of a world theme: every plop and chime is a note of this scale. */
export interface SoundKey {
  /** Frequency of the scale's root note in Hz. */
  rootHz: number;
  /** Scale steps in semitones above the root, ascending, within one octave. */
  scale: number[];
}

/** Sound family of a thing that breaks (dust boulders, wrecks). */
export type ObstacleSound = 'stone' | 'crystal' | 'metal' | 'plant';

/** A running machine's sound: drills thump, smelters hiss, assemblers whirr, power hums, generators burn. */
export type MachineSound = 'thump' | 'hiss' | 'whirr' | 'hum' | 'burn';

/** Interface sounds (ui-sounds.ts decides which one a control makes). */
export type UiSound = 'click' | 'tab' | 'open' | 'close' | 'confirm' | 'toggle-on' | 'toggle-off' | 'slide' | 'disabled';

/** Frequency of scale step `step` (0 = root; steps past the scale go up an octave). */
export function noteHz(key: SoundKey, step: number): number {
  const n = key.scale.length;
  const octave = Math.floor(step / n);
  const semis = key.scale[((step % n) + n) % n]! + octave * 12;
  return key.rootHz * 2 ** (semis / 12);
}
