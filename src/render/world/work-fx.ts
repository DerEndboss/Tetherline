import { Container, Sprite, type Texture } from 'pixi.js';
import type { BuildingDef } from '../../content/types';
import { drillInfo } from '../../sim/blocks/production';
import { BLOCKS } from '../../sim/blocks/registry';
import { powerFactor } from '../../sim/power';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';
import { hexToNumber } from '../art/color';
import { FX } from '../art/fx';
import type { SpriteLight } from '../art/svg';
import type { Baked } from '../bake';
import type { Point } from '../iso';
import { SpritePool } from '../sprite-pool';

/**
 * Machines that visibly work, driven by sim state and nothing else: a running drill hammers and kicks up dust, a
 * crafter's lights come up and it vents steam while a recipe runs, a burning generator glows and smokes, a pump
 * sends out ripples, a battery's light shows its charge, a node blinks, and a consumer that wants power and gets
 * none shows the no-power sign. Honest and small: it stops when the machine stops. The sprite itself never moves
 * (shake and squash stay 0); the moving parts are the art's work loop (objects.ts, docs/art.md "Work loops"),
 * this adds lights (additive glows at the art's light points), puffs and ripples, and says how busy a machine is.
 */

/** Where a kind's lights and vent sit, in sprite-local world px relative to the anchor (before the fit scale). */
export interface KindLook {
  lights: SpriteLight[];
  vent: { x: number; y: number };
  /** Visible height above the ground in world px, for icons. */
  top: number;
}

/** What a behaviour does while busy. */
interface Style {
  shake: number;
  squash: number;
  glow: boolean;
  puff: 'none' | 'dust' | 'steam' | 'smoke';
  ripple: boolean;
}

const STYLES: Partial<Record<string, Style>> = {
  // Buildings never shake or squash: shaking moves the whole
  // sprite, square base plate included, and reads as rattling. Glow, dust, steam and ripples show the work instead.
  drill: { shake: 0, squash: 0, glow: false, puff: 'dust', ripple: false },
  crafter: { shake: 0, squash: 0, glow: true, puff: 'steam', ripple: false },
  generator: { shake: 0, squash: 0, glow: true, puff: 'smoke', ripple: false },
  pump: { shake: 0, squash: 0, glow: false, puff: 'none', ripple: true },
  battery: { shake: 0, squash: 0, glow: true, puff: 'none', ripple: false },
  'power-node': { shake: 0, squash: 0, glow: true, puff: 'none', ripple: false },
  'mass-driver': { shake: 0, squash: 0, glow: true, puff: 'none', ripple: false },
  mega: { shake: 0, squash: 0, glow: true, puff: 'steam', ripple: false },
  core: { shake: 0, squash: 0, glow: true, puff: 'none', ripple: false },
  // item steering pieces only play their work loop (objects.ts) while items pass
  junction: { shake: 0, squash: 0, glow: false, puff: 'none', ripple: false },
  router: { shake: 0, squash: 0, glow: false, puff: 'none', ripple: false },
  sorter: { shake: 0, squash: 0, glow: false, puff: 'none', ripple: false },
  overflow: { shake: 0, squash: 0, glow: false, puff: 'none', ripple: false },
  unloader: { shake: 0, squash: 0, glow: false, puff: 'none', ripple: false },
  bridge: { shake: 0, squash: 0, glow: false, puff: 'none', ripple: false },
};

/** Behaviours that count as busy while items flow through them (no work counter of their own). */
const FLOW = new Set(['junction', 'router', 'sorter', 'overflow', 'unloader', 'bridge']);
/** How long a steering piece keeps working after the last item passed (ms). */
const FLOW_HOLD = 1500;

/** A fingerprint of a steering piece's item traffic: it changes whenever an item enters, waits or leaves. */
function trafficOf(b: Building): number {
  let n = b.rr * 7919 + Math.round(b.work * 997);
  // an unloader without a setting writes its queue at index 1 of an empty array: index 0 is a hole that iterates as undefined
  for (const q of b.queue) n = n * 31 + (q?.length ?? 0) * 17 + (q?.[0] ?? 0);
  return n;
}

const PUFF_COLORS = { dust: 0xc9a27a, steam: 0xe9f0f8, smoke: 0x7b7f8c };
const MAX_PUFFS = 140;

interface Puff {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  a0: number;
}

/** A small ring of pooled soft puffs: no allocation after the first few frames. */
class Puffs {
  private readonly live: Puff[] = [];
  private readonly free: Sprite[] = [];
  private seed = 1;

  constructor(
    private readonly layer: Container,
    private readonly tex: Texture,
  ) {}

  private rnd(): number {
    // render-only noise: a cheap LCG keeps it allocation free and independent of Math.random
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  emit(kind: keyof typeof PUFF_COLORS, x: number, y: number, depth: number): void {
    if (this.live.length >= MAX_PUFFS) return;
    const sprite = this.free.pop() ?? new Sprite(this.tex);
    if (!sprite.parent) this.layer.addChild(sprite);
    sprite.texture = this.tex;
    sprite.anchor.set(0.5);
    sprite.tint = PUFF_COLORS[kind];
    sprite.visible = true;
    sprite.zIndex = depth;
    const up = kind === 'dust' ? 9 : 16;
    this.live.push({ sprite, x, y, vx: (this.rnd() - 0.5) * (kind === 'dust' ? 26 : 8), vy: -up - this.rnd() * 8, age: 0, life: 0.9 + this.rnd() * 0.7, s0: kind === 'dust' ? 0.18 : 0.14, s1: kind === 'dust' ? 0.5 : 0.42, a0: kind === 'smoke' ? 0.42 : 0.34 });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        this.free.push(p.sprite);
        this.live[i] = this.live[this.live.length - 1]!;
        this.live.pop();
        continue;
      }
      const t = p.age / p.life;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.sprite.position.set(p.x, p.y);
      p.sprite.scale.set(p.s0 + (p.s1 - p.s0) * t);
      p.sprite.alpha = p.a0 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
  }
}

/** How busy a machine is right now (0..1), from sim state alone; `power` = it gets energy. */
type Busy = (w: World, b: Building, def: BuildingDef, power: boolean) => number;

const BUSY: Partial<Record<string, Busy>> = {
  drill: (w, b, def, power) => {
    const { item } = drillInfo(w, b);
    return item >= 0 && (b.items[item] ?? 0) < (def.items ?? 10) && power ? 1 : 0;
  },
  crafter: (_w, b, _def, power) => (b.work > 0.001 && power ? 1 : 0),
  generator: (_w, b, def) => (b.work > 0 || def.generator?.wind ? 1 : 0),
  pump: (_w, _b, _def, power) => (power ? 1 : 0),
  battery: (_w, b, def) => ((def.power?.store ?? 0) > 0 ? Math.min(1, b.charge / def.power!.store!) : 0),
  'power-node': () => 1,
  core: () => 1,
  mega: (_w, b, _def, power) => (power && b.build >= 1 ? 0.6 : 0),
  'mass-driver': (_w, b, _def, power) => (power && b.build >= 1 ? 0.6 : 0),
};

/** A consumer that wants power and gets none. */
function starved(w: World, b: Building, def: BuildingDef): boolean {
  if (!def.power?.use) return false;
  const wants = BLOCKS[def.behaviour].wantsPower;
  return (!wants || wants(w, b)) && powerFactor(w, b) < 0.05;
}

export class WorkFx {
  private readonly glows: SpritePool;
  private readonly icons: SpritePool;
  private readonly ripples: SpritePool;
  private readonly puffs: Puffs | null;
  /** Smoothed activity per building id (0..1): machines fade in and out of work. */
  private readonly act = new Map<number, number>();
  private readonly emitAt = new Map<number, number>();
  /** Steering pieces: last traffic fingerprint and when it last changed. */
  private readonly traffic = new Map<number, { sig: number; at: number }>();
  private last = 0;
  private dt = 0;
  private still = false;

  constructor(
    objects: Container,
    private readonly sprites: Map<string, Baked>,
    private readonly tech: number,
  ) {
    this.glows = new SpritePool(objects);
    this.icons = new SpritePool(objects);
    this.ripples = new SpritePool(objects);
    const puff = sprites.get(FX.puff)?.texture;
    this.puffs = puff ? new Puffs(objects, puff) : null;
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  /** How busy a building looks right now (0..1, smoothed); 0 when still or unknown. */
  activity(id: number): number {
    return this.still ? 0 : (this.act.get(id) ?? 0);
  }

  begin(nowMs: number): void {
    this.dt = this.last ? Math.min(0.1, (nowMs - this.last) / 1000) : 0;
    this.last = nowMs;
    if (this.act.size > 6000) {
      this.act.clear();
      this.emitAt.clear();
      this.traffic.clear();
    }
    this.glows.begin();
    this.icons.begin();
    this.ripples.begin();
    this.puffs?.update(this.dt);
  }

  end(): void {
    this.glows.end();
    this.icons.end();
    this.ripples.end();
  }

  /**
   * Animates one finished building: nudges its sprite (`s`, at screen point `c`), adds its lights, puffs and
   * signs. `fit` is the sprite's scale, `depth` its sort key.
   */
  apply(w: World, b: Building, def: BuildingDef, s: Sprite, look: KindLook, c: Point, fit: number, depth: number, nowMs: number): void {
    if (starved(w, b, def)) this.noPower(look, c, fit, depth, nowMs);
    const style = STYLES[def.behaviour];
    if (!style) return;
    const goal = FLOW.has(def.behaviour) ? this.flowing(b, nowMs) : (BUSY[def.behaviour]?.(w, b, def, powerFactor(w, b) > 0.05) ?? 0);
    const prev = this.act.get(b.id) ?? goal;
    const a = prev + (goal - prev) * Math.min(1, this.dt * 4);
    this.act.set(b.id, a);
    if (a >= 0.02) this.work(style, w, b, def, s, look, c, fit, depth, a, nowMs);
  }

  /** 1 while items pass a steering piece (its traffic changed within FLOW_HOLD), else 0. Render state only. */
  private flowing(b: Building, nowMs: number): number {
    const sig = trafficOf(b);
    const seen = this.traffic.get(b.id);
    if (!seen) {
      this.traffic.set(b.id, { sig, at: -Infinity });
      return 0;
    }
    if (seen.sig !== sig) {
      seen.sig = sig;
      seen.at = nowMs;
    }
    return nowMs - seen.at < FLOW_HOLD ? 1 : 0;
  }

  private work(style: Style, _w: World, b: Building, def: BuildingDef, s: Sprite, look: KindLook, c: Point, fit: number, depth: number, a: number, nowMs: number): void {
    const t = this.still ? 0 : nowMs / 1000;
    const k = this.still ? 0 : a;
    s.x += Math.sin(t * 38 + b.id) * style.shake * k;
    s.scale.y *= 1 - style.squash * Math.abs(Math.sin(t * 7 + b.id * 0.7)) * k;
    if (style.glow) this.lights(def, b, look, c, fit, depth, a, t);
    if (style.ripple) this.ripple(c, fit, depth, a, t, b.id);
    if (style.puff !== 'none' && !this.still) this.smoke(style.puff, b, look, c, fit, depth, a);
  }

  private lights(def: BuildingDef, b: Building, look: KindLook, c: Point, fit: number, depth: number, a: number, t: number): void {
    const baked = this.sprites.get(FX.glow);
    if (!baked) return;
    const tint = hexToNumber(def.art.glow ?? '') || this.tech;
    const flicker = def.behaviour === 'generator' ? 0.75 + 0.25 * Math.sin(t * 13 + b.id) * Math.sin(t * 5.3) : 0.8 + 0.2 * Math.sin(t * 2.4 + b.id);
    const blink = def.behaviour === 'power-node' ? 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.2 + b.id * 1.7)) : 1;
    const lights = look.lights.length ? look.lights : [{ x: 0, y: -look.top * 0.7, color: '', r: 14 + def.size * 6, phase: 0 }];
    for (const l of lights) {
      const g = this.glows.next(baked, c.x + l.x * fit, c.y + l.y * fit);
      g.blendMode = 'add';
      g.tint = l.color ? hexToNumber(l.color) : tint;
      g.scale.set((Math.max(8, l.r) * fit * 1.7) / 64);
      g.alpha = Math.min(1, a * flicker * blink * 0.85);
      g.zIndex = depth + 0.2;
    }
  }

  private ripple(c: Point, fit: number, depth: number, a: number, t: number, id: number): void {
    const baked = this.sprites.get(FX.ring);
    if (!baked) return;
    for (let k = 0; k < 2; k++) {
      const f = (t * 0.55 + k * 0.5 + id * 0.13) % 1;
      const r = this.ripples.next(baked, c.x, c.y + 6);
      r.blendMode = 'add';
      r.tint = 0x9fd8ff;
      r.scale.set((0.35 + f * 0.9) * fit);
      r.alpha = (1 - f) * 0.55 * a;
      r.zIndex = depth - 0.1;
    }
  }

  private smoke(kind: 'dust' | 'steam' | 'smoke', b: Building, look: KindLook, c: Point, fit: number, depth: number, a: number): void {
    const at = (this.emitAt.get(b.id) ?? 0) - this.dt * a;
    if (at > 0) {
      this.emitAt.set(b.id, at);
      return;
    }
    this.emitAt.set(b.id, kind === 'dust' ? 0.45 : 0.28);
    const v = kind === 'dust' ? { x: 0, y: 12 } : look.vent;
    this.puffs?.emit(kind, c.x + v.x * fit, c.y + v.y * fit, depth + 0.4);
  }

  private noPower(look: KindLook, c: Point, fit: number, depth: number, nowMs: number): void {
    const baked = this.sprites.get(FX.noPower);
    if (!baked) return;
    const pulse = this.still ? 1 : 0.75 + 0.25 * Math.sin(nowMs / 260);
    const s = this.icons.next(baked, c.x, c.y - look.top * fit - 14);
    s.scale.set(0.8 * pulse);
    s.alpha = pulse;
    s.zIndex = depth + 0.6;
  }
}

