import { Container } from 'pixi.js';
import type { BuildingDef } from '../../content/types';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';
import type { Baked } from '../bake';
import type { Camera } from '../camera';
import { groundEllipse, tileInView } from '../iso';
import { SpritePool } from '../sprite-pool';
import { footprintCentre } from './geometry';

/**
 * The ground outside the base is this much darker while lighting is on (a tint on the painted map). Cool and about
 * 55 % (0xb4b9cc left unbuilt land too bright), so the warm pools of the base read like a lit city.
 */
export const DIM = 0x868ca6;
const WARM = 0xffd9a0;
const MAX_LIGHTS = 360;

/** Whether a building gets a light pool: finished, not flat logistics, and when zoomed far out only the bigger ones. */
function lit(def: BuildingDef, b: Building, far: boolean): boolean {
  return b.build >= 1 && def.behaviour !== 'conveyor' && def.behaviour !== 'conduit' && !(far && def.size < 2);
}

/**
 * Minimal lighting: the player's own base gets warm light pools on the ground (soft additive sprites, one per
 * finished building, bigger for the core), the rest of the map is a little darker. Nothing here is a shader or a
 * light map: pooled sprites, culled to the view, drawn under the depth-sorted objects, so it costs next to nothing.
 * It can be switched off in the settings (`WorldSettings.lighting`).
 */
export class LightLayer {
  readonly layer = new Container();
  private readonly pool: SpritePool;
  private on = true;

  constructor(private readonly glow: Baked | undefined) {
    this.layer.blendMode = 'add';
    this.pool = new SpritePool(this.layer);
  }

  /** Whether lighting is on (off: nothing drawn). */
  setOn(on: boolean): void {
    this.on = on;
    this.layer.visible = on;
  }

  update(w: World, camera: Camera, nowMs: number, still: boolean): void {
    if (!this.on || !this.glow) return;
    const view = camera.viewRect();
    this.pool.begin();
    let n = 0;
    const far = camera.zoom < 0.4;
    for (const b of w.state.buildings) {
      const def = w.def(b);
      if (n >= MAX_LIGHTS || !lit(def, b, far) || !tileInView(b.x + def.size / 2, b.y + def.size / 2, view, 260)) continue;
      this.place(this.glow, b, def, b.id === w.state.core, nowMs, still);
      n++;
    }
    this.pool.end();
  }

  /** One light pool under a building. */
  private place(glow: Baked, b: Building, def: BuildingDef, core: boolean, nowMs: number, still: boolean): void {
    const e = groundEllipse(core ? def.size * 1.5 + 2.5 : def.size * 0.9 + 1.6);
    const c = footprintCentre(b.x, b.y, def.size);
    const s = this.pool.next(glow, c.x, c.y + 4);
    s.blendMode = 'add';
    s.tint = WARM;
    s.scale.set((e.rx * 2) / 64, (e.ry * 2) / 64);
    s.alpha = (core ? 0.42 : 0.24) * (still ? 1 : 0.92 + 0.08 * Math.sin(nowMs / 900 + b.id));
  }
}

/** The tint of the painted map for the lighting setting. */
export const mapTint = (lighting: boolean): number => (lighting ? DIM : 0xffffff);
