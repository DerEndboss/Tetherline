import type { Camera } from './camera';

/**
 * Keyboard camera motion: WASD / arrow keys pan and + / - zoom with momentum instead of one jump per key repeat.
 * The old way moved a fixed step on every `keydown` repeat, which fires once, pauses ~500 ms, then ticks at the
 * keyboard's rate: a lurch, a stall and a stutter. Here the keys only say where the player wants to go; every
 * animation frame eases the velocity towards that wish (exponential smoothing, so the feel is the same at 30, 60
 * or 144 fps) and moves the camera by the velocity. Pure maths on a `Camera`, no DOM, so it is testable.
 */

/** Screen-pixel direction a pan key pulls the content (the camera moves the opposite way). */
const PAN_KEYS: Record<string, readonly [number, number]> = {
  ArrowLeft: [1, 0],
  KeyA: [1, 0],
  ArrowRight: [-1, 0],
  KeyD: [-1, 0],
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
};

/** `KeyboardEvent.key` values that zoom, with their direction. Matched by key, not code, so any layout works. */
const ZOOM_KEYS: Record<string, number> = { '+': 1, '=': 1, '-': -1, _: -1 };

/** How quickly the velocity catches up with the wish (per second): ~90 % of the way in 0.25 s. */
const ACCEL_RATE = 9;
/** How quickly it dies down once the keys are let go: a short, soft glide to a stop. */
const DAMP_RATE = 12;
/** Zoom is gentler: 1 / 0.35 s. */
const ZOOM_ACCEL_RATE = 8;
const ZOOM_DAMP_RATE = 10;
/** Zoom speed: natural-log units per second (1.1 is about 3x per second). */
const ZOOM_SPEED = 1.1;
/** Below this the glide has ended and the loop may sleep. */
const REST_PAN = 1.5;
const REST_ZOOM = 0.004;
/** Wheel zoom glides to its target: ~90 % of the way in 0.16 s, the same at any frame rate. */
const WHEEL_RATE = 14;
/** Closer than this (in natural-log zoom) the glide snaps to its target. */
const WHEEL_REST = 0.0008;
/** One wheel event never zooms by more than this (natural-log units): a flung wheel stays tame. */
const WHEEL_MAX_STEP = 0.5;
/** A frame longer than this (a background tab waking up) moves the camera as if it were this long. */
const MAX_DT = 0.05;

/** Full pan speed in screen px per second: scales with the screen so a phone and a 4K window both feel brisk. */
export function panSpeed(viewW: number, viewH: number): number {
  return Math.min(1200, Math.max(520, Math.min(viewW, viewH) * 1.05));
}

/** Moves a value towards a target in a frame-rate independent way: the share closed in `dt` seconds is 1 - e^(-rate dt). */
export function approach(value: number, target: number, rate: number, dt: number): number {
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}

export class CameraMotion {
  /** Current pan velocity in screen px per second (the direction the content moves). */
  vx = 0;
  vy = 0;
  /** Current zoom velocity in natural-log units per second. */
  vz = 0;
  private readonly pan = new Set<string>();
  private readonly zoom = new Set<number>();
  /** Where wheel zoom is heading (an absolute camera zoom, 0 = no glide) and the screen point it holds still. */
  private target = 0;
  private anchorX = 0;
  private anchorY = 0;
  /** Pull towards a window edge (-1..1 per axis, the content moves the opposite way), see `edge`. */
  private edgeX = 0;
  private edgeY = 0;

  /** A key went down. Returns true when it is one the camera uses (the caller then prevents the default). */
  press(code: string, key: string): boolean {
    if (PAN_KEYS[code]) {
      this.pan.add(code);
      return true;
    }
    const z = ZOOM_KEYS[key];
    if (z) {
      this.zoom.add(z);
      return true;
    }
    return false;
  }

  /** A key went up. Zoom keys let go by direction, so Shift changing `=` to `+` mid-press cannot leave one stuck. */
  release(code: string, key: string): void {
    this.pan.delete(code);
    const z = ZOOM_KEYS[key];
    if (z) this.zoom.delete(z);
  }

  /** Window lost focus or the player started typing: every key counts as released. */
  releaseAll(): void {
    this.pan.clear();
    this.zoom.clear();
  }

  /** Whether any camera key is held (or the mouse pushes at a window edge). */
  get held(): boolean {
    return this.pan.size > 0 || this.zoom.size > 0 || this.edgeX !== 0 || this.edgeY !== 0;
  }

  /** Whether the loop still has work: a key is down, the glide has not come to rest, or a wheel zoom is under way. */
  get active(): boolean {
    return this.held || this.target > 0 || Math.hypot(this.vx, this.vy) > REST_PAN || Math.abs(this.vz) > REST_ZOOM;
  }

  /**
   * One wheel notch (or trackpad delta) as a zoom `factor` around the screen point (sx, sy): it moves the target,
   * and `step` glides the camera there, so many small events add up to one smooth zoom (and at any frame rate).
   */
  wheel(factor: number, sx: number, sy: number, camera: Camera): void {
    const base = this.target > 0 ? this.target : camera.zoom;
    const log = Math.max(-WHEEL_MAX_STEP, Math.min(WHEEL_MAX_STEP, Math.log(factor)));
    this.target = Math.min(camera.maxZoom, Math.max(camera.minZoom, base * Math.exp(log)));
    this.anchorX = sx;
    this.anchorY = sy;
  }

  /** The mouse is at a window edge: push the camera that way (x, y in -1..1, 0 = not at an edge). */
  edge(x: number, y: number): void {
    this.edgeX = x;
    this.edgeY = y;
  }

  /** The wished pan direction as a unit vector (zero when no keys, normalised on diagonals, opposite keys cancel). */
  direction(): [number, number] {
    let x = 0;
    let y = 0;
    for (const code of this.pan) {
      const d = PAN_KEYS[code]!;
      x += d[0];
      y += d[1];
    }
    x -= this.edgeX;
    y -= this.edgeY;
    const len = Math.hypot(x, y);
    return len > 0 ? [x / len, y / len] : [0, 0];
  }

  /** The wished zoom direction: 1 in, -1 out, 0 for none or both. */
  private zoomWish(): number {
    let z = 0;
    for (const d of this.zoom) z += d;
    return Math.sign(z);
  }

  /**
   * Advances by `dt` seconds: eases the velocities, moves the camera. Returns whether another frame is needed.
   * The position moves by the average of the old and new velocity, so a long frame does not overshoot.
   */
  step(dt: number, camera: Camera): boolean {
    const t = Math.min(MAX_DT, Math.max(0, dt));
    const speed = panSpeed(camera.viewW, camera.viewH);
    const [dx, dy] = this.direction();
    const wishing = dx !== 0 || dy !== 0;
    const rate = wishing ? ACCEL_RATE : DAMP_RATE;
    const ox = this.vx;
    const oy = this.vy;
    this.vx = approach(this.vx, dx * speed, rate, t);
    this.vy = approach(this.vy, dy * speed, rate, t);
    const oz = this.vz;
    const zw = this.zoomWish();
    this.vz = approach(this.vz, zw * ZOOM_SPEED, zw !== 0 ? ZOOM_ACCEL_RATE : ZOOM_DAMP_RATE, t);
    if (!this.active) this.rest();
    const mx = ((ox + this.vx) / 2) * t;
    const my = ((oy + this.vy) / 2) * t;
    if (mx !== 0 || my !== 0) camera.panByScreen(mx, my);
    const mz = ((oz + this.vz) / 2) * t;
    if (mz !== 0) camera.zoomAt(Math.exp(mz), camera.viewW / 2, camera.viewH / 2);
    this.glide(t, camera);
    return this.active;
  }

  /** The wheel zoom: eases the camera's zoom towards the target, keeping the point under the cursor still. */
  private glide(dt: number, camera: Camera): void {
    if (this.target <= 0) return;
    if (this.zoom.size > 0) {
      this.target = 0;
      return;
    }
    const gap = Math.log(this.target / camera.zoom);
    if (Math.abs(gap) < WHEEL_REST) {
      camera.zoomAt(this.target / camera.zoom, this.anchorX, this.anchorY);
      this.target = 0;
      return;
    }
    const next = approach(0, gap, WHEEL_RATE, dt);
    camera.zoomAt(Math.exp(next), this.anchorX, this.anchorY);
  }

  /** Cuts any leftover glide (the player grabbed the camera with the mouse, or the glide is below a pixel). */
  rest(): void {
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.target = 0;
  }
}
