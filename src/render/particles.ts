import { Container, Sprite, type Texture } from 'pixi.js';
import { hexToNumber } from './art/color';
import { FX, SHARD_VARIANTS } from './art/fx';
import type { Baked } from './bake';

/**
 * Short-lived visual particles in world px with a fake height `z` (drawn at y - z), so pieces fly in
 * arcs, fall, bounce and settle. Sprites are pooled; nothing here touches the game state. Real time.
 */
interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  bounce: number;
  life: number;
  age: number;
  s0: number;
  s1: number;
  a0: number;
  spin: number;
  /** Sparks point along their screen velocity and stretch with speed. */
  streak: boolean;
  /** Alpha curve: 'fade' (linear out), 'pop' (in fast, out slow), 'late' (hold, then fade). */
  curve: 'fade' | 'pop' | 'late';
}

export interface Burst {
  x: number;
  y: number;
  z: number;
}

const MAX_PARTICLES = 700;

export class Particles {
  readonly layer = new Container();
  private readonly live: Particle[] = [];
  private readonly free: Sprite[] = [];
  /** Reduced motion: fewer, shorter particles. */
  still = false;

  constructor(private readonly sprites: Map<string, Baked>) {}

  private texture(id: string): Texture | undefined {
    return this.sprites.get(id)?.texture;
  }

  private spawn(id: string, p: Omit<Particle, 'sprite' | 'age'>, color: string, additive: boolean): void {
    if (this.live.length >= MAX_PARTICLES) return;
    const tex = this.texture(id);
    if (!tex) return;
    const sprite = this.free.pop() ?? new Sprite();
    if (!sprite.parent) this.layer.addChild(sprite);
    sprite.texture = tex;
    sprite.anchor.set(0.5);
    sprite.tint = hexToNumber(color);
    sprite.blendMode = additive ? 'add' : 'normal';
    sprite.visible = true;
    sprite.rotation = 0;
    this.live.push({ ...p, sprite, age: 0 });
  }

  private n(count: number): number {
    return this.still ? Math.ceil(count / 3) : count;
  }

  sparks(at: Burst, color: string, count: number, speed = 260): void {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.45 + Math.random() * 0.75);
      this.spawn(FX.spark, {
        x: at.x, y: at.y, z: at.z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: 90 + Math.random() * 220,
        gravity: 900, drag: 2.2, bounce: 0, life: 0.22 + Math.random() * 0.28,
        s0: 0.55 + Math.random() * 0.4, s1: 0.2, a0: 1, spin: 0, streak: true, curve: 'fade',
      }, color, true);
    }
  }

  chips(at: Burst, color: string, count: number, power = 1, leaf = false): void {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (70 + Math.random() * 120) * power;
      const id = leaf ? FX.leaf : FX.shard(Math.floor(Math.random() * SHARD_VARIANTS));
      this.spawn(id, {
        x: at.x + Math.cos(a) * 8, y: at.y + Math.sin(a) * 4, z: at.z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: (160 + Math.random() * 220) * power,
        gravity: leaf ? 380 : 980, drag: leaf ? 2.5 : 0.6, bounce: leaf ? 0 : 0.35,
        life: 0.8 + Math.random() * 0.5, s0: (0.7 + Math.random() * 0.6) * (leaf ? 1.1 : 1), s1: 0.6,
        a0: 1, spin: (Math.random() - 0.5) * 16, streak: false, curve: 'late',
      }, color, false);
    }
  }

  puffs(at: Burst, color: string, count: number, size = 1): void {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 50;
      this.spawn(FX.puff, {
        x: at.x + Math.cos(a) * 14 * size, y: at.y + Math.sin(a) * 7 * size, z: at.z + Math.random() * 10,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: 18 + Math.random() * 24,
        gravity: 0, drag: 2.4, bounce: 0, life: 0.6 + Math.random() * 0.5,
        s0: 0.35 * size, s1: (0.9 + Math.random() * 0.5) * size, a0: 0.5, spin: (Math.random() - 0.5) * 2,
        streak: false, curve: 'fade',
      }, color, false);
    }
  }

  flash(at: Burst, color: string, size = 1, life = 0.18): void {
    this.spawn(FX.glow, {
      x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, bounce: 0,
      life, s0: 0.6 * size, s1: 1.6 * size, a0: 0.95, spin: 0, streak: false, curve: 'fade',
    }, color, true);
  }

  ring(at: Burst, color: string, size = 1): void {
    this.spawn(FX.ring, {
      x: at.x, y: at.y, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, bounce: 0,
      life: 0.5, s0: 0.25 * size, s1: 1.25 * size, a0: 0.7, spin: 0, streak: false, curve: 'fade',
    }, color, true);
  }

  star(at: Burst, color: string, size = 1, life = 0.75): void {
    this.spawn(FX.star, {
      x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, bounce: 0,
      life, s0: 0.05, s1: size, a0: 1, spin: 1.6, streak: false, curve: 'pop',
    }, color, true);
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        this.free.push(p.sprite);
        this.live.splice(i, 1);
        continue;
      }
      step(p, dt);
      draw(p);
    }
  }
}

function step(p: Particle, dt: number): void {
  const k = Math.max(0, 1 - p.drag * dt);
  p.vx *= k;
  p.vy *= k;
  p.vz -= p.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  if (!p.streak) p.sprite.rotation += p.spin * dt;
  if (p.z < 0 && p.gravity > 0) {
    p.z = 0;
    p.vz = p.bounce > 0 && Math.abs(p.vz) > 60 ? -p.vz * p.bounce : 0;
    p.vx *= 0.5;
    p.vy *= 0.5;
    p.spin *= 0.4;
  }
}

function alphaCurve(p: Particle, t: number): number {
  if (p.curve === 'pop') return t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
  if (p.curve === 'late') return t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  return 1 - t;
}

function draw(p: Particle): void {
  const t = p.age / p.life;
  const s = p.s0 + (p.s1 - p.s0) * (p.curve === 'pop' ? Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) : t);
  p.sprite.position.set(p.x, p.y - p.z);
  p.sprite.alpha = p.a0 * alphaCurve(p, t);
  if (p.streak) {
    const sx = p.vx;
    const sy = p.vy - p.vz;
    p.sprite.rotation = Math.atan2(sy, sx);
    p.sprite.scale.set(s * (0.6 + Math.min(1.6, Math.hypot(sx, sy) / 300)), s);
  } else {
    p.sprite.scale.set(s);
  }
}
