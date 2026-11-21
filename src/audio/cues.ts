/**
 * Sound cues from the player's building actions, which the simulation does not report (it only sees the result).
 * Whoever handles the input (game/interaction.ts, tools) calls `emitCue`; GameSound listens and plays the sound.
 * No audio import is needed on the emitting side, so tests and headless runs stay silent and free of WebAudio.
 *
 *   ghost         a ghost was placed (`count` ghosts at once for a line or an area)
 *   ghost-cancel  a ghost or plan was taken back
 *   belt-tick     the belt drag grew by one tile; `length` is the line's length so far (1 = first tile)
 *   belt-done     the belt drag was released with `length` tiles
 */
export type Cue =
  | { type: 'ghost'; count?: number }
  | { type: 'ghost-cancel' }
  | { type: 'belt-tick'; length: number }
  | { type: 'belt-done'; length: number };

const listeners = new Set<(cue: Cue) => void>();

export function emitCue(cue: Cue): void {
  for (const l of listeners) l(cue);
}

export function onCue(listener: (cue: Cue) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
