import { content } from '../content';
import type { Building, SimState } from '../sim/state';
import { emptySoundscape, type Soundscape } from './machines';

/** What the audio sees of the world each moment: the state, the camera zoom and which tiles are on screen. */
export interface SceneView {
  state: SimState;
  zoom: number;
  /** Whether a tile is on screen (with a margin); everything counts when missing. */
  onScreen?: (x: number, y: number) => boolean;
}

/** Counts the running machines on screen by sound, and the belt tiles with goods on them. */
export function scanSoundscape(view: SceneView): Soundscape {
  const scene = emptySoundscape(view.zoom);
  const { buildings, belts } = view.state;
  for (const b of buildings) {
    if (b.build < 1 || b.removing || (view.onScreen && !view.onScreen(b.x, b.y))) continue;
    if (b.slot >= 0) scene.belts += (belts.count[b.slot] ?? 0) > 0 ? 1 : 0;
    else countMachine(scene, b);
  }
  return scene;
}

function countMachine(scene: Soundscape, b: Building): void {
  const sound = content.buildings.at(b.kind).art.sound;
  if (sound && (sound === 'hum' || b.work > 0)) scene.machines[sound] += 1;
}
