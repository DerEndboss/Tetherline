import { Container, Graphics, Sprite } from 'pixi.js';
import type { Baked } from '../bake';
import type { Point } from '../iso';

/**
 * The drones' work beam (building, dismantling, clearing, mining): one fine, bright line from the drone's
 * nozzle to the work point, tapering a little towards the work, with a soft additive glow around it, a few
 * light pulses running along it and a small spot with a spark or two where it lands.
 *
 * It never wobbles or jumps: the work point glides from piece to piece (so a belt line being laid is followed by
 * one continuous beam), the beam grows out of the nozzle when it starts, and it fades in and out. It lingers a
 * moment when the drone has no target for a tick or two (between two pieces), so a chain does not flicker.
 * Widths are screen pixels (divided by the zoom), so the beam stays a hairline at any zoom.
 * Everything here is drawing only: nothing reads or writes the simulation.
 */

export interface BeamInput {
  /** The drone's nozzle, in world px. */
  from: Point;
  /** The point being worked on (null: the drone has no work right now). */
  aim: Point | null;
  color: number;
}

interface Beam {
  /** The smoothed work point. */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  color: number;
  alpha: number;
  grow: number;
  idle: number;
  on: boolean;
}

/** How fast the work point follows a new target (per second): about 0.1 s to settle, so a line is one glide. */
const AIM_RATE = 14;
/** A target further than this (world px) from the work point is not followed: the beam starts afresh there. */
const SNAP_PX = 520;
/** Seconds a beam stays after its target went away, so the gap between two pieces does not flicker it. */
const LINGER = 0.22;
const FADE_IN = 0.1;
const FADE_OUT = 0.28;
/** Seconds the beam takes to reach out from the nozzle to the work point when it starts. */
const GROW = 0.14;
/** Beam widths in screen px: [nozzle end, work end] of the halo, the body and the white-hot core. */
const HALO: [number, number] = [3, 15];
const BODY: [number, number] = [1.6, 4.6];
const CORE: [number, number] = [0.9, 1.7];
const PULSES = 3;
const PULSE_MS = 760;
const SPARKS = 3;
const SPARK_MS = 420;
/** Size of the soft light at the work point and at the nozzle, in screen px. */
const SPOT = 46;
const NOZZLE = 11;
const MAX_SPOTS = 48;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Mixes a colour towards white. */
function lighten(color: number, t: number): number {
  const ch = (shift: number): number => Math.round(((color >> shift) & 255) + (255 - ((color >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A cheap deterministic 0..1 from two integers (the spark directions: visual only, the same every run). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
}

export class BuildBeams {
  private readonly lines = new Graphics();
  private readonly spots: Sprite[] = [];
  private readonly beams: Beam[] = [];
  private used = 0;
  private still = false;
  private zoom = 1;

  constructor(
    private readonly parent: Container,
    private readonly glow: Baked | undefined,
    private readonly zIndex: number,
  ) {
    this.lines.blendMode = 'add';
    this.lines.zIndex = zIndex;
    parent.addChild(this.lines);
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  /** Draws every drone's beam for this frame; `inputs[i]` is drone i (null = no such drone). */
  update(inputs: readonly (BeamInput | null)[], nowMs: number, dt: number, zoom: number): void {
    this.zoom = Math.max(0.25, zoom);
    this.lines.clear();
    this.used = 0;
    const count = Math.max(inputs.length, this.beams.length);
    for (let i = 0; i < count; i++) this.beam(i, inputs[i] ?? null, nowMs, dt);
    for (let i = this.used; i < this.spots.length; i++) this.spots[i]!.visible = false;
  }

  private state(i: number): Beam {
    return (this.beams[i] ??= { x: 0, y: 0, fromX: 0, fromY: 0, color: 0xffffff, alpha: 0, grow: 0, idle: 0, on: false });
  }

  /** Follows the work point and eases the beam in and out; draws it while it is visible. */
  private beam(i: number, input: BeamInput | null, nowMs: number, dt: number): void {
    const b = this.state(i);
    this.follow(b, input, dt);
    const to = b.on ? 1 : 0;
    b.alpha += clamp(to - b.alpha, -dt / FADE_OUT, dt / FADE_IN);
    if (b.alpha < 0.004) {
      b.alpha = 0;
      b.grow = 0;
      return;
    }
    b.grow = Math.min(1, b.grow + dt / GROW);
    this.draw(b, i, nowMs);
  }

  private follow(b: Beam, input: BeamInput | null, dt: number): void {
    if (input) {
      b.fromX = input.from.x;
      b.fromY = input.from.y;
    }
    if (!input?.aim) {
      b.idle += dt;
      if (b.idle > LINGER) b.on = false;
      return;
    }
    const { aim } = input;
    b.idle = 0;
    b.color = input.color;
    if (!b.on || Math.hypot(aim.x - b.x, aim.y - b.y) > SNAP_PX) {
      b.x = aim.x;
      b.y = aim.y;
      if (!b.on) b.grow = 0;
    } else {
      const k = 1 - Math.exp(-dt * AIM_RATE);
      b.x += (aim.x - b.x) * k;
      b.y += (aim.y - b.y) * k;
    }
    b.on = true;
  }

  private draw(b: Beam, i: number, nowMs: number): void {
    const px = 1 / this.zoom;
    const reach = b.grow * b.grow * (3 - 2 * b.grow);
    const breathe = this.still ? 1 : 0.95 + 0.05 * Math.sin(nowMs / 240 + i * 1.7);
    const a = b.alpha * breathe;
    const ex = b.fromX + (b.x - b.fromX) * reach;
    const ey = b.fromY + (b.y - b.fromY) * reach;
    this.taper(b.fromX, b.fromY, ex, ey, HALO, px, b.color, 0.2 * a);
    this.taper(b.fromX, b.fromY, ex, ey, BODY, px, b.color, 0.5 * a);
    this.taper(b.fromX, b.fromY, ex, ey, CORE, px, lighten(b.color, 0.6), a);
    this.spot(b.fromX, b.fromY, NOZZLE * px, lighten(b.color, 0.4), 0.8 * a);
    if (reach < 1) return;
    this.landing(b, i, nowMs, px, a);
    if (!this.still) this.pulses(b, i, nowMs, px, a);
  }

  /** A long thin quad from (ax, ay) to (bx, by), `w` screen px wide at the start and at the end. */
  private taper(ax: number, ay: number, bx: number, by: number, w: [number, number], px: number, color: number, alpha: number): void {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) return;
    const nx = (-(by - ay) / len) * 0.5 * px;
    const ny = ((bx - ax) / len) * 0.5 * px;
    this.lines.poly([ax + nx * w[0], ay + ny * w[0], bx + nx * w[1], by + ny * w[1], bx - nx * w[1], by - ny * w[1], ax - nx * w[0], ay - ny * w[0]]).fill({ color, alpha });
  }

  /** The light where the beam lands, with a hot centre and a few small sparks. */
  private landing(b: Beam, i: number, nowMs: number, px: number, a: number): void {
    const pulse = this.still ? 1 : 0.9 + 0.1 * Math.sin(nowMs / 170 + i);
    this.spot(b.x, b.y, SPOT * px * pulse, b.color, 0.7 * a);
    this.spot(b.x, b.y, SPOT * 0.4 * px, lighten(b.color, 0.75), a);
    if (this.still) return;
    for (let s = 0; s < SPARKS; s++) this.spark(b, i, s, nowMs, px, a);
  }

  /** One spark: leaves the landing point in a direction fixed by its cycle, rises a little, falls and fades. */
  private spark(b: Beam, i: number, s: number, nowMs: number, px: number, a: number): void {
    const t = nowMs / SPARK_MS + s / SPARKS;
    const cycle = Math.floor(t);
    const f = t - cycle;
    const dir = hash01(cycle * 3 + s, i + 1) * Math.PI * 2;
    const out = (7 + 9 * hash01(cycle, s + 17 * i)) * f * px;
    const x = b.x + Math.cos(dir) * out;
    const y = b.y + Math.sin(dir) * out * 0.6 - (8 * f - 10 * f * f) * px;
    this.spot(x, y, 6 * px * (1 - f * 0.5), lighten(b.color, 0.85), a * (1 - f) * (1 - f));
  }

  /** Small bright dots running from the nozzle to the work point: the energy that goes into the piece. */
  private pulses(b: Beam, i: number, nowMs: number, px: number, a: number): void {
    for (let k = 0; k < PULSES; k++) {
      const t = (nowMs / PULSE_MS + k / PULSES + i * 0.31) % 1;
      this.spot(b.fromX + (b.x - b.fromX) * t, b.fromY + (b.y - b.fromY) * t, 6 * px, lighten(b.color, 0.5), 0.7 * a * Math.sin(Math.PI * t));
    }
  }

  /** An additive soft dot of `size` world px; a pool, nothing is allocated per frame once it is warm. */
  private spot(x: number, y: number, size: number, color: number, alpha: number): void {
    if (!this.glow || this.used >= MAX_SPOTS || alpha <= 0.01) return;
    let s = this.spots[this.used];
    if (!s) {
      s = new Sprite(this.glow.texture);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.zIndex = this.zIndex + 0.5;
      this.parent.addChild(s);
      this.spots.push(s);
    }
    this.used++;
    s.visible = true;
    s.position.set(x, y);
    s.scale.set(size / 64);
    s.tint = color;
    s.alpha = Math.min(1, alpha);
  }
}
