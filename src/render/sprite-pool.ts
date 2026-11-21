import { Container, Sprite } from 'pixi.js';
import type { Baked } from './bake';
import { depthOf } from './iso';

/** Sprites reused frame to frame: `begin`, take as many as needed with `next`, `end` hides the rest. */
export class SpritePool {
  private readonly sprites: Sprite[] = [];
  private used = 0;

  constructor(readonly layer: Container) {}

  begin(): void {
    this.used = 0;
  }

  next(baked: Baked, x: number, y: number): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite();
      this.sprites.push(s);
      this.layer.addChild(s);
    }
    this.used += 1;
    s.texture = baked.texture;
    s.anchor.set(baked.ax, baked.ay);
    s.position.set(x, y);
    s.scale.set(1, 1);
    s.rotation = 0;
    s.alpha = 1;
    s.tint = 0xffffff;
    s.blendMode = 'normal';
    s.visible = true;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
  }
}

/** Sort key: nearer tiles (iso: larger x + y; top-down: lower rows) in front; room for glow, flash and ghost layers per object. */
export function depthKey(x: number, y: number): number {
  return depthOf(x, y) * 8 + x * 0.001;
}
