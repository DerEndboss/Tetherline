import { describe, expect, it } from 'vitest';
import { Camera } from './camera';
import { approach, CameraMotion, panSpeed } from './camera-motion';

function cam(): Camera {
  const c = new Camera();
  c.resize(1000, 700);
  c.zoom = 1;
  return c;
}

/** Holds the keys for `seconds` at `fps`, then lets go and glides for `rest` seconds; returns the camera. */
function run(keys: string[], seconds: number, fps: number, rest = 1): Camera {
  const camera = cam();
  const m = new CameraMotion();
  for (const k of keys) m.press(k, '');
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) m.step(dt, camera);
  for (const k of keys) m.release(k, '');
  for (let t = 0; t < rest; t += dt) m.step(dt, camera);
  return camera;
}

describe('camera motion', () => {
  it('eases in: the first frame moves far less than full speed', () => {
    const camera = cam();
    const m = new CameraMotion();
    m.press('KeyD', 'd');
    m.step(1 / 60, camera);
    expect(m.vx).toBeLessThan(0);
    expect(Math.abs(m.vx)).toBeLessThan(panSpeed(1000, 700) * 0.2);
    for (let i = 0; i < 90; i++) m.step(1 / 60, camera);
    expect(Math.abs(m.vx)).toBeGreaterThan(panSpeed(1000, 700) * 0.95);
  });

  it('D moves the view right (the camera x grows), A left, W up, S down', () => {
    expect(run(['KeyD'], 0.5, 60).x).toBeGreaterThan(100);
    expect(run(['KeyA'], 0.5, 60).x).toBeLessThan(-100);
    expect(run(['KeyW'], 0.5, 60).y).toBeLessThan(-100);
    expect(run(['KeyS'], 0.5, 60).y).toBeGreaterThan(100);
  });

  it('travels the same distance at 30, 60 and 144 fps (frame-rate independent)', () => {
    const d = (fps: number): number => run(['KeyD'], 1, fps).x;
    expect(Math.abs(d(30) - d(144)) / d(144)).toBeLessThan(0.03);
    expect(Math.abs(d(60) - d(144)) / d(144)).toBeLessThan(0.02);
  });

  it('a diagonal is no faster than a straight line', () => {
    const m = new CameraMotion();
    m.press('KeyD', '');
    m.press('KeyS', '');
    const [x, y] = m.direction();
    expect(Math.hypot(x, y)).toBeCloseTo(1, 10);
    const camera = run(['KeyD', 'KeyS'], 1, 60);
    const straight = run(['KeyD'], 1, 60);
    expect(Math.hypot(camera.x, camera.y)).toBeCloseTo(Math.abs(straight.x), -1);
  });

  it('opposite keys cancel, and the arrows work like WASD', () => {
    const m = new CameraMotion();
    m.press('KeyA', '');
    m.press('KeyD', '');
    expect(m.direction()).toEqual([0, 0]);
    expect(run(['ArrowRight'], 0.5, 60).x).toBeCloseTo(run(['KeyD'], 0.5, 60).x, 6);
  });

  it('glides softly to a stop after release and then sleeps', () => {
    const camera = cam();
    const m = new CameraMotion();
    m.press('KeyD', '');
    for (let i = 0; i < 60; i++) m.step(1 / 60, camera);
    m.release('KeyD', '');
    expect(m.active).toBe(true);
    const at = camera.x;
    m.step(1 / 60, camera);
    expect(camera.x).toBeGreaterThan(at);
    let frames = 0;
    while (m.step(1 / 60, camera) && frames < 300) frames += 1;
    expect(frames).toBeLessThan(120);
    expect(m.active).toBe(false);
  });

  it('never moves in a long hitch more than a short frame would', () => {
    const camera = cam();
    const m = new CameraMotion();
    m.press('KeyD', '');
    m.step(5, camera);
    expect(camera.x).toBeLessThan(panSpeed(1000, 700) * 0.06);
  });

  it('zoom keys zoom smoothly and respect the zoom limits', () => {
    const camera = cam();
    const m = new CameraMotion();
    m.press('', '+');
    for (let i = 0; i < 600; i++) m.step(1 / 60, camera);
    expect(camera.zoom).toBe(camera.maxZoom);
    m.release('', '+');
    m.press('', '-');
    for (let i = 0; i < 600; i++) m.step(1 / 60, camera);
    expect(camera.zoom).toBe(camera.minZoom);
  });

  it('ignores keys it does not own and lets go of everything on releaseAll', () => {
    const m = new CameraMotion();
    expect(m.press('KeyQ', 'q')).toBe(false);
    expect(m.press('KeyW', 'w')).toBe(true);
    m.releaseAll();
    expect(m.held).toBe(false);
    expect(approach(0, 10, 9, 1000)).toBeCloseTo(10, 6);
  });

  it('wheel zoom glides to its target and keeps the point under the cursor still', () => {
    const camera = cam();
    const m = new CameraMotion();
    const before = camera.screenToWorld(800, 200);
    m.wheel(Math.exp(0.6), 800, 200, camera);
    expect(m.active).toBe(true);
    m.step(1 / 60, camera);
    expect(camera.zoom).toBeGreaterThan(1);
    expect(camera.zoom).toBeLessThan(Math.exp(0.5));
    for (let i = 0; i < 120; i++) m.step(1 / 60, camera);
    expect(camera.zoom).toBeCloseTo(Math.exp(0.5), 3);
    expect(m.active).toBe(false);
    const after = camera.screenToWorld(800, 200);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('wheel zoom ends in the same place at 30 and at 144 fps, and several notches add up', () => {
    const finish = (fps: number): number => {
      const camera = cam();
      const m = new CameraMotion();
      m.wheel(Math.exp(0.3), 500, 350, camera);
      m.wheel(Math.exp(0.3), 500, 350, camera);
      for (let i = 0; i < fps * 2; i++) m.step(1 / fps, camera);
      return camera.zoom;
    };
    expect(finish(30)).toBeCloseTo(finish(144), 3);
    expect(finish(60)).toBeCloseTo(Math.exp(0.6), 3);
  });

  it('wheel zoom stops at the zoom limits', () => {
    const camera = cam();
    const m = new CameraMotion();
    for (let i = 0; i < 40; i++) m.wheel(Math.exp(0.5), 500, 350, camera);
    for (let i = 0; i < 300; i++) m.step(1 / 60, camera);
    expect(camera.zoom).toBeCloseTo(camera.maxZoom, 3);
    for (let i = 0; i < 40; i++) m.wheel(Math.exp(-0.5), 500, 350, camera);
    for (let i = 0; i < 600; i++) m.step(1 / 60, camera);
    expect(camera.zoom).toBeCloseTo(camera.minZoom, 3);
  });

  it('pushing at a window edge pans that way and stops when released', () => {
    const camera = cam();
    const m = new CameraMotion();
    m.edge(1, 0);
    for (let i = 0; i < 30; i++) m.step(1 / 60, camera);
    expect(camera.x).toBeGreaterThan(50);
    m.edge(0, 0);
    for (let i = 0; i < 120; i++) m.step(1 / 60, camera);
    expect(m.active).toBe(false);
  });
});
