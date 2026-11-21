import { Container, Sprite, Texture } from 'pixi.js';
import type { ThemePalette as WorldPalette } from '../content/types';
import { hexToNumber, hexToRgb, mix } from './art/color';
import { FX } from './art/fx';
import { rand } from './art/rand';
import type { Baked } from './bake';

type Stop = [offset: number, color: string, alpha: number];

/** A vertical gradient as a 1 x 256 texture, stretched to whatever size it is drawn at. */
function gradientTexture(stops: readonly Stop[]): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [o, c, a] of stops) {
    const [r, gg, b] = hexToRgb(c);
    g.addColorStop(o, `rgba(${r},${gg},${b},${a})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 256);
  const t = Texture.from(canvas);
  t.source.scaleMode = 'linear';
  return t;
}

/** Soft dark corners and bottom edge, so the eye rests on the middle and the HUD sits on calm ground. */
function vignetteTexture(shadow: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const [r, g, b] = hexToRgb(shadow);
  const grad = ctx.createRadialGradient(128, 112, 60, 128, 128, 190);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.7, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.62)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const t = Texture.from(canvas);
  t.source.scaleMode = 'linear';
  return t;
}

/** Warm key light falling in from the upper left over the whole scene (added on top, very soft). */
function washTexture(light: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const [r, g, b] = hexToRgb(light);
  const grad = ctx.createRadialGradient(40, 10, 10, 40, 10, 300);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.2)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.07)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const t = Texture.from(canvas);
  t.source.scaleMode = 'linear';
  return t;
}

/** Two layers of distant low-poly ridges melting into the haze, drawn once and stretched across the screen. */
function ridgeTexture(far: string, near: string, rim: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const r = rand(404);
  const layer = (base: number, amp: number, step: number, color: string, edge: string): void => {
    ctx.beginPath();
    ctx.moveTo(0, 96);
    for (let x = 0; x <= 1024 + step; x += step) {
      const y = base - amp * (0.15 + r() * 0.85) * (0.6 + 0.4 * Math.sin(x / 190));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(1024, 96);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, base - amp, 0, 96);
    g.addColorStop(0, edge);
    g.addColorStop(0.35, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fill();
  };
  layer(70, 44, 42, far, rim);
  layer(88, 30, 30, near, far);
  // Melt the foot of the ridges into the haze so the band never ends in a hard line above the ground.
  const fade = ctx.createLinearGradient(0, 0, 0, 96);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.9)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1024, 96);
  ctx.globalCompositeOperation = 'source-over';
  const t = Texture.from(canvas);
  t.source.scaleMode = 'linear';
  return t;
}

interface Cloud {
  sprite: Sprite;
  /** Position across the screen 0..1 and height in the band 0..1. */
  x: number;
  y: number;
  /** Screen widths per second. */
  speed: number;
}

interface Star {
  sprite: Sprite;
  x: number;
  y: number;
  phase: number;
}

/**
 * Screen-space sky. `back` sits behind the world (seen past the map's edges when zoomed out); `front` is
 * the horizon over the top of the screen: deep blue with stars and a ringed planet sinking into a
 * pink-orange glow and haze, as if the camera were tilted towards the horizon. Both shift a little with
 * the camera (parallax). `wash` adds the warm key light from the upper left, `vignette` darkens the edges.
 */
export class Sky {
  readonly back = new Container();
  readonly front = new Container();
  readonly vignette: Sprite;
  /** Warm light wash over the world, under the horizon band. */
  readonly wash: Sprite;
  private readonly backFill: Sprite;
  private readonly band: Sprite;
  private readonly glow: Sprite;
  private readonly ridge: Sprite;
  private readonly planet: Sprite;
  private readonly moon: Sprite;
  private readonly stars: Star[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly cloudLayer = new Container();
  private readonly starLayer = new Container();
  private bandH = 160;
  private lastNow = 0;

  constructor(palette: WorldPalette, sprites: Map<string, Baked>) {
    const { top, mid, horizon, haze } = palette.sky;
    this.backFill = new Sprite(gradientTexture([[0, top, 1], [0.55, mid, 1], [0.85, mix(haze, mid, 0.4), 1], [1, horizon, 1]]));
    this.back.addChild(this.backFill);
    this.band = new Sprite(gradientTexture([[0, top, 1], [0.45, mid, 0.97], [0.75, mix(mid, haze, 0.35), 0.6], [1, haze, 0]]));
    this.glow = new Sprite(gradientTexture([[0, horizon, 0], [0.42, horizon, 0.5], [0.58, mix(horizon, haze, 0.5), 0.42], [1, haze, 0]]));
    this.ridge = new Sprite(ridgeTexture(mix(haze, mid, 0.55), mix(mid, top, 0.55), mix(horizon, haze, 0.5)));
    this.planet = this.bakedSprite(sprites, FX.planet);
    this.moon = this.bakedSprite(sprites, FX.moon);
    const r = rand(77);
    const starTex = sprites.get(FX.mote)?.texture ?? Texture.WHITE;
    for (let i = 0; i < 46; i++) {
      const sprite = new Sprite(starTex);
      sprite.anchor.set(0.5);
      sprite.tint = hexToNumber(mix('#ffffff', horizon, r() * 0.4));
      sprite.blendMode = 'add';
      const size = 0.25 + r() * r() * 0.55;
      sprite.scale.set(size);
      this.stars.push({ sprite, x: r(), y: r() * r(), phase: r() * Math.PI * 2 });
      this.starLayer.addChild(sprite);
    }
    const puff = sprites.get(FX.puff)?.texture ?? Texture.WHITE;
    for (let i = 0; i < 6; i++) {
      const sprite = new Sprite(puff);
      sprite.anchor.set(0.5);
      sprite.tint = hexToNumber(mix(haze, horizon, r() * 0.5));
      this.clouds.push({ sprite, x: r(), y: 0.55 + r() * 0.35, speed: 0.004 + r() * 0.006 });
      this.cloudLayer.addChild(sprite);
    }
    this.front.addChild(this.band, this.starLayer, this.moon, this.planet, this.cloudLayer, this.glow, this.ridge);
    this.vignette = new Sprite(vignetteTexture(palette.shadow));
    this.wash = new Sprite(washTexture(palette.light));
    this.wash.blendMode = 'add';
  }

  private bakedSprite(sprites: Map<string, Baked>, id: string): Sprite {
    const b = sprites.get(id);
    const s = new Sprite(b?.texture ?? Texture.EMPTY);
    s.anchor.set(0.5);
    return s;
  }

  resize(w: number, h: number): void {
    this.backFill.width = w;
    this.backFill.height = h;
    this.bandH = Math.round(Math.min(230, Math.max(96, h * 0.21)));
    this.band.width = w;
    this.band.height = this.bandH;
    this.glow.width = w;
    this.glow.height = this.bandH * 0.9;
    this.glow.y = this.bandH * 0.32;
    this.ridge.width = w;
    this.ridge.height = Math.max(40, this.bandH * 0.42);
    this.ridge.y = this.bandH - this.ridge.height + 2;
    this.vignette.width = w;
    this.vignette.height = h;
    this.wash.width = w;
    this.wash.height = h;
  }

  /** Parallax from the camera position (world px) and twinkling stars; `nowMs` is real time. */
  update(w: number, camX: number, camY: number, nowMs: number, still: boolean): void {
    const px = -camX * 0.012;
    const scale = Math.min(1, w / 900, Math.max(0.5, this.bandH / 210));
    this.planet.scale.set(scale);
    this.planet.position.set(w * 0.74 + px * 1.6, this.bandH * 0.56 - camY * 0.004);
    this.moon.scale.set(scale * 0.8);
    this.moon.position.set(w * 0.4 + px * 1.2, this.bandH * 0.26);
    const dt = this.lastNow ? Math.min(0.1, (nowMs - this.lastNow) / 1000) : 0;
    this.lastNow = nowMs;
    for (const c of this.clouds) {
      if (!still) c.x = (c.x + c.speed * dt) % 1.4;
      c.sprite.position.set((c.x - 0.2) * w + px * 0.8, this.bandH * c.y);
      c.sprite.scale.set((this.bandH / 60) * 1.6, this.bandH / 60 * 0.45);
      c.sprite.alpha = 0.22;
    }
    for (const s of this.stars) {
      const x = (((s.x * (w + 80) + px * 0.6) % (w + 80)) + (w + 80)) % (w + 80) - 40;
      s.sprite.position.set(x, 6 + s.y * this.bandH * 0.62);
      s.sprite.alpha = still ? 0.7 : 0.45 + 0.4 * Math.sin(nowMs / 900 + s.phase);
    }
  }
}
