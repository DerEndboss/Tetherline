import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { analyse, breathe, stamp, stripMoving, type LoopRef } from './loop';
import { overlay, type Image } from './render';

const steel = new MeshStandardMaterial({ color: 0x888888 });

/** A pad that stays and an arm that turns with the frame. */
function machine(frame: number): Group {
  const pad = new Mesh(new BoxGeometry(1, 0.1, 1), steel);
  const arm = new Mesh(new BoxGeometry(0.6, 0.05, 0.1), steel);
  arm.position.y = 0.3;
  arm.rotation.y = (frame / 4) * (Math.PI / 2);
  const g = new Group();
  g.add(pad, arm);
  return g;
}

const ref: LoopRef = { key: 'building-test', count: 4, fps: 12, build: (_k, i) => machine(i) };

describe('work loops (kit/loop.ts)', () => {
  it('keeps the still parts in the work base and drops the moving ones', () => {
    const root = new Group();
    root.add(machine(0));
    expect(stripMoving(root, ref)).toBe(1);
    let meshes = 0;
    root.traverse((o) => {
      if (o instanceof Mesh) meshes++;
    });
    expect(meshes).toBe(1);
  });

  it('shares one bounding box over all frames', () => {
    const b = analyse(ref).bounds;
    expect(b.min.x).toBeCloseTo(-0.5);
    expect(b.max.y).toBeCloseTo(0.325);
  });

  it('closes its waves without a jump', () => {
    expect(breathe(0, 12)).toBeCloseTo(breathe(12, 12));
    expect(stamp(0, 12)).toBeCloseTo(0);
    expect(stamp(11, 12)).toBeLessThan(0.1);
  });
});

/** Source-over of straight-alpha `top` on `bottom`, both 8 bit. */
function over(bottom: Image, top: Image): Uint8ClampedArray {
  const out = new Uint8ClampedArray(bottom.data.length);
  for (let p = 0; p < out.length; p += 4) {
    const ta = top.data[p + 3]! / 255;
    const ba = bottom.data[p + 3]! / 255;
    const a = ta + ba * (1 - ta);
    for (let c = 0; c < 3; c++) {
      const v = (top.data[p + c]! / 255) * ta + (bottom.data[p + c]! / 255) * ba * (1 - ta);
      out[p + c] = a > 0 ? (v / a) * 255 : 0;
    }
    out[p + 3] = a * 255;
  }
  return out;
}

describe('overlay frames (kit/render.ts)', () => {
  it('is transparent where the frame equals the base and rebuilds the frame over it', () => {
    // pixels: same opaque, changed opaque, transparent base under a new part, half-covered shadow getting darker
    const base: Image = { width: 4, height: 1, data: new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 255, 0, 0, 0, 0, 0, 0, 0, 80]) };
    const frame: Image = { width: 4, height: 1, data: new Uint8ClampedArray([200, 100, 50, 255, 20, 220, 90, 255, 120, 130, 140, 255, 0, 0, 0, 140]) };
    const o = overlay(frame, base);
    expect(o.data[3]).toBe(0);
    const back = over(base, o);
    for (let i = 4; i < 16; i++) expect(Math.abs(back[i]! - frame.data[i]!)).toBeLessThanOrEqual(2);
  });
});
