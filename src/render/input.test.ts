import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { secondarySink, type SecondarySink } from '../game/tools/sink';
import type { Camera } from './camera';
import { attachCameraInput, type InputOptions } from './input';

type Handler = (e: unknown) => void;

/** The pointer input on a fake element: events go straight to the handlers it registered. */
function rig(hold: SecondarySink['hold']) {
  const handlers = new Map<string, Handler>();
  const el = {
    addEventListener: (type: string, h: Handler) => void handlers.set(type, h),
    removeEventListener: (type: string) => void handlers.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => undefined,
    clientWidth: 800,
    clientHeight: 600,
  };
  const camera = { screenToWorld: (x: number, y: number) => ({ x, y }), panByScreen: vi.fn(), zoomAt: vi.fn() };
  const taps: { x: number; y: number }[] = [];
  const options: InputOptions = { onTap: (x, y) => void taps.push({ x, y }), onDragStart: () => false };
  const detach = attachCameraInput(el as unknown as HTMLElement, camera as unknown as Camera, options);
  secondarySink.current = { tap: () => false, dragStart: () => false, drag: () => undefined, dragEnd: () => undefined, hold };
  const fire = (type: string, pointerType: string, id: number, x: number, y: number): void =>
    handlers.get(type)!({ type, pointerType, pointerId: id, button: 0, clientX: x, clientY: y });
  return { fire, taps, camera, detach };
}

describe('long press on touch', () => {
  const vibrate = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vibrate.mockClear();
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout: (f: () => void, ms: number) => globalThis.setTimeout(f, ms), clearTimeout: (id: number) => globalThis.clearTimeout(id) });
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    secondarySink.current = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a finger held still takes away what is under it, and the release is no tap', () => {
    const hold = vi.fn(() => true);
    const { fire, taps, detach } = rig(hold);
    fire('pointerdown', 'touch', 1, 100, 100);
    vi.advanceTimersByTime(700);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalled();
    fire('pointerup', 'touch', 1, 100, 100);
    expect(taps).toEqual([]);
    detach();
  });

  it('when nothing is under the finger the release is still a tap (a building is selected as before)', () => {
    const hold = vi.fn(() => false);
    const { fire, taps, detach } = rig(hold);
    fire('pointerdown', 'touch', 1, 100, 100);
    vi.advanceTimersByTime(700);
    fire('pointerup', 'touch', 1, 100, 100);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(taps).toEqual([{ x: 100, y: 100 }]);
    expect(vibrate).not.toHaveBeenCalled();
    detach();
  });

  it('a quick tap never reaches the hold', () => {
    const hold = vi.fn(() => true);
    const { fire, taps, detach } = rig(hold);
    fire('pointerdown', 'touch', 1, 40, 50);
    vi.advanceTimersByTime(200);
    fire('pointerup', 'touch', 1, 40, 50);
    vi.advanceTimersByTime(1000);
    expect(hold).not.toHaveBeenCalled();
    expect(taps).toEqual([{ x: 40, y: 50 }]);
    detach();
  });

  it('a finger that moves (a pan) is no long press', () => {
    const hold = vi.fn(() => true);
    const { fire, camera, detach } = rig(hold);
    fire('pointerdown', 'touch', 1, 100, 100);
    vi.advanceTimersByTime(200);
    fire('pointermove', 'touch', 1, 140, 100);
    vi.advanceTimersByTime(1000);
    expect(hold).not.toHaveBeenCalled();
    expect(camera.panByScreen).toHaveBeenCalled();
    detach();
  });

  it('a second finger (pinch) cancels it', () => {
    const hold = vi.fn(() => true);
    const { fire, detach } = rig(hold);
    fire('pointerdown', 'touch', 1, 100, 100);
    vi.advanceTimersByTime(200);
    fire('pointerdown', 'touch', 2, 200, 100);
    vi.advanceTimersByTime(1000);
    expect(hold).not.toHaveBeenCalled();
    detach();
  });

  it('the mouse has the right button and never long presses', () => {
    const hold = vi.fn(() => true);
    const { fire, taps, detach } = rig(hold);
    fire('pointerdown', 'mouse', 1, 100, 100);
    vi.advanceTimersByTime(2000);
    expect(hold).not.toHaveBeenCalled();
    fire('pointerup', 'mouse', 1, 100, 100);
    expect(taps).toHaveLength(1);
    detach();
  });

  it('a press that is cancelled (the browser took the touch) leaves no timer behind', () => {
    const hold = vi.fn(() => true);
    const { fire, detach } = rig(hold);
    fire('pointerdown', 'touch', 1, 100, 100);
    fire('pointercancel', 'touch', 1, 100, 100);
    vi.advanceTimersByTime(2000);
    expect(hold).not.toHaveBeenCalled();
    detach();
  });
});
