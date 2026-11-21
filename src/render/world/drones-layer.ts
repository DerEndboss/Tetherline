import { Container, Graphics, Sprite } from 'pixi.js';
import type { Building, DroneState } from '../../sim/state';
import type { DroneAct } from '../../sim/drones';
import { opsOf } from '../../sim/drones/tech';
import type { World } from '../../sim/world';
import type { Baked } from '../bake';
import { FX } from '../art/fx';
import { groundEllipse, gridToWorld, heightScale, viewMode, type Point, type ViewMode } from '../iso';
import { depthKey } from '../sprite-pool';
import { BuildBeams, type BeamInput } from './build-beam';
import { footprintCentre } from './geometry';
import { chipId, DRONE_FRAMES } from './sprites';

/** How high a drone floats over the ground, in iso world px (scaled by the view). */
const HOVER = 70;
const HELPER_TINT = 0xb4f3e0;
const HELPER_SCALE = 0.84;
/** Where the weld torch sits under the body, from the sprite anchor, in world px (measured on the three art sets). */
const NOZZLE: Record<ViewMode, Point> = { iso: { x: 0, y: 21 }, steep: { x: 11, y: 20 }, top: { x: 11, y: 11 } };
/** Conveyors and conduits are flat on the ground (the belts layer draws them): the beam lands on the tile itself. */
const FLAT = new Set(['conveyor', 'conduit']);
const BEAM_BUILD = 0x7ff0e8;
const BEAM_REMOVE = 0xff7a6a;
const BEAM_CLEAR = 0xffd36b;
const BEAM_MINE = 0x9be8ff;
const MARK = 0xffd36b;
/** Beam colour by what the drone does to a bare tile. */
const GROUND_BEAM: Partial<Record<DroneAct, number>> = { clear: BEAM_CLEAR, mine: BEAM_MINE, remove: BEAM_REMOVE };

interface Drawn {
  body: Sprite;
  cargo: Sprite;
  shadow: Graphics;
  /** Smoothed ground position in tiles (the sim moves at 20 Hz, this follows it every frame). */
  x: number;
  y: number;
  lean: number;
}

/** Where the point a drone works on is, on screen: a building's (the height built so far) or a tile. */
export type WirePoint = (b: Building) => Point;

/**
 * The drones layer: every drone in `state.drones` (the player's drone and up to four helpers) with a
 * shadow, rotor frames, a lean into the flight direction, the load it carries and its work beam (build.beam.ts,
 * the same for every drone and every job), plus a small crate marker over machines the drones keep supplied.
 */
export class DronesLayer {
  private readonly drawn: Drawn[] = [];
  private readonly beams: BuildBeams;
  private readonly marks = new Graphics();
  private last = 0;

  constructor(
    private readonly objects: Container,
    private readonly baked: Map<string, Baked>,
  ) {
    this.beams = new BuildBeams(objects, baked.get(FX.glow), Number.MAX_SAFE_INTEGER - 2);
    this.marks.zIndex = Number.MAX_SAFE_INTEGER - 3;
    objects.addChild(this.marks);
  }

  setStill(still: boolean): void {
    this.beams.setStill(still);
  }

  update(w: World, nowMs: number, wire: WirePoint, zoom: number): void {
    const dt = Math.min(0.1, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    const frame = this.baked.get(DRONE_FRAMES[Math.floor(nowMs / 60) % 2]!);
    const inputs: (BeamInput | null)[] = [];
    w.state.drones.forEach((d, i) => inputs.push(this.draw(w, d, i, frame, nowMs, dt, wire)));
    for (let i = w.state.drones.length; i < this.drawn.length; i++) this.hide(this.drawn[i]!);
    this.beams.update(inputs, nowMs, dt, zoom);
    this.drawMarks(w, nowMs);
  }

  private draw(w: World, d: DroneState, i: number, frame: Baked | undefined, nowMs: number, dt: number, wire: WirePoint): BeamInput | null {
    const t = this.slot(i, d);
    const show = Boolean(frame);
    t.body.visible = show;
    t.shadow.visible = show;
    if (!frame) {
      t.cargo.visible = false;
      return null;
    }
    const k = 1 - Math.exp(-dt * 16);
    const lag = d.x - d.y - (t.x - t.y);
    t.x += (d.x - t.x) * k;
    t.y += (d.y - t.y) * k;
    const lift = HOVER * heightScale() + Math.sin(nowMs / 400 + i) * 4;
    const c = gridToWorld(t.x, t.y);
    const helper = i > 0;
    t.lean += (Math.max(-0.2, Math.min(0.2, lag * 0.06)) - t.lean) * Math.min(1, dt * 8);
    t.body.texture = frame.texture;
    t.body.anchor.set(frame.ax, frame.ay);
    t.body.position.set(c.x, c.y - lift);
    t.body.rotation = t.lean;
    t.body.scale.set(helper ? HELPER_SCALE : 1);
    t.body.tint = helper ? HELPER_TINT : 0xffffff;
    t.body.zIndex = depthKey(Math.floor(t.x), Math.floor(t.y)) + 6;
    this.drawShadow(t, c.x, c.y, lift, helper);
    this.drawCargo(w, d, t, c.x, c.y - lift + 18);
    const nozzle = NOZZLE[viewMode()];
    const size = t.body.scale.x;
    const target = this.beamTarget(w, d, wire);
    return { from: { x: c.x + nozzle.x * size, y: c.y - lift + nozzle.y * size }, aim: target, color: target?.color ?? BEAM_BUILD };
  }

  private drawShadow(t: Drawn, x: number, y: number, lift: number, helper: boolean): void {
    const e = groundEllipse(helper ? 0.3 : 0.36);
    const grow = 1 - Math.min(0.35, lift / 400);
    t.shadow.clear().ellipse(0, 0, e.rx * grow, e.ry * grow).fill({ color: 0x000000, alpha: 0.28 });
    t.shadow.position.set(x, y);
    t.shadow.zIndex = t.body.zIndex - 1;
  }

  private drawCargo(w: World, d: DroneState, t: Drawn, x: number, y: number): void {
    const m = d.carry && d.carry.n > 0 ? w.content.materials.list[d.carry.item] : undefined;
    const icon = m ? (this.baked.get(m.icon) ?? this.baked.get(chipId(m.id))) : undefined;
    t.cargo.visible = Boolean(icon);
    if (!icon) return;
    t.cargo.texture = icon.texture;
    t.cargo.anchor.set(icon.ax, icon.ay);
    t.cargo.position.set(x, y);
    t.cargo.scale.set(0.55);
    t.cargo.zIndex = t.body.zIndex + 1;
  }

  /** The point and colour of what a drone is working on: a piece it builds or dismantles, a boulder, ore. Null when none. */
  private beamTarget(w: World, d: DroneState, wire: WirePoint): (Point & { color: number }) | null {
    if (d.act === 'clear' || d.act === 'mine') return this.tileTarget(d);
    if (d.task === 'idle' || d.waiting) return null;
    const b = d.target >= 0 ? w.byId.get(d.target) : undefined;
    if (b) return { ...this.workPoint(w, b, wire), color: d.task === 'remove' ? BEAM_REMOVE : BEAM_BUILD };
    return d.task === 'remove' ? this.tileTarget(d) : null;
  }

  /** The bare tile the drone works on: a boulder, ore, or a piece it just took down (the drone keeps that tile). */
  private tileTarget(d: DroneState): (Point & { color: number }) | null {
    if (d.tx === undefined || d.ty === undefined || Math.hypot(d.x - d.tx - 0.5, d.y - d.ty - 0.5) >= (d.task === 'remove' ? 6 : 3)) return null;
    const p = gridToWorld(d.tx + 0.5, d.ty + 0.5);
    return { x: p.x, y: p.y - 6 * heightScale(), color: GROUND_BEAM[d.act ?? 'idle'] ?? BEAM_REMOVE };
  }

  /**
   * Where the beam lands on a building: the tile itself for a belt or a pipe, else the height reached so far
   * (the holographic site rises from the bottom, so the beam rides up with it).
   */
  private workPoint(w: World, b: Building, wire: WirePoint): Point {
    const def = w.def(b);
    const c = footprintCentre(b.x, b.y, def.size);
    if (FLAT.has(def.behaviour)) return { x: c.x, y: c.y - 2 * heightScale() };
    const top = wire(b);
    const reached = Math.min(1, Math.max(0.12, b.build)) * (def.behaviour === 'power-node' ? 1 : 2);
    return { x: c.x + (top.x - c.x) * reached, y: c.y + (top.y - c.y) * reached };
  }

  /** A little bobbing crate over every machine marked for supply. */
  private drawMarks(w: World, nowMs: number): void {
    this.marks.clear();
    for (const id of opsOf(w).supply) {
      const b = w.byId.get(id);
      if (!b) continue;
      const size = w.def(b).size;
      const c = footprintCentre(b.x, b.y, size);
      const up = (46 + size * 16) * Math.max(0.5, heightScale()) + Math.sin(nowMs / 500 + id) * 3;
      this.crate(c.x, c.y - up);
    }
  }

  private crate(x: number, y: number): void {
    const g = this.marks;
    g.poly([x, y - 9, x + 11, y - 3, x, y + 3, x - 11, y - 3]).fill({ color: MARK, alpha: 0.95 });
    g.poly([x - 11, y - 3, x, y + 3, x, y + 13, x - 11, y + 7]).fill({ color: 0xc08a2a });
    g.poly([x + 11, y - 3, x, y + 3, x, y + 13, x + 11, y + 7]).fill({ color: 0x8f6420 });
  }

  private slot(i: number, d: DroneState): Drawn {
    let t = this.drawn[i];
    if (!t) {
      t = { body: new Sprite(), cargo: new Sprite(), shadow: new Graphics(), x: d.x, y: d.y, lean: 0 };
      this.drawn[i] = t;
      this.objects.addChild(t.shadow, t.body, t.cargo);
    }
    return t;
  }

  private hide(t: Drawn): void {
    t.body.visible = false;
    t.cargo.visible = false;
    t.shadow.visible = false;
  }

}
