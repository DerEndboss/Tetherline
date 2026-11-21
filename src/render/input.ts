import type { Camera } from './camera';
import { isTextEntry } from '../game/hotkeys';
import { secondarySink } from '../game/tools/sink';
import { toolSettings } from '../game/tools/settings';
import { CameraMotion } from './camera-motion';
import { worldToTile } from './iso';

/** Movement (screen px) after which a press counts as a drag, not a tap. */
const TAP_SLOP = 8;
const WHEEL_ZOOM = 0.0015;
/** Pointer this close to a window edge (px) scrolls the map when edge scrolling is on. */
const EDGE_ZONE = 14;

interface Pointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** A right or middle mouse button always pans, even when the world takes left drags (belt drawing). */
  panOnly: boolean;
  /** The right mouse button: the tools may take its drag (sweeping boulders) when no tool is in hand. */
  secondary: boolean;
}

export interface InputOptions {
  /** A press released without dragging, in canvas-local screen px. */
  onTap: (sx: number, sy: number) => void;
  /** The mouse moved with no button down (ghost follows the cursor). */
  onHover?: (sx: number, sy: number) => void;
  /** A one-finger or left-button drag begins at its press point: return true to take it instead of panning. */
  onDragStart?: (sx: number, sy: number) => boolean;
  onDrag?: (sx: number, sy: number) => void;
  onDragEnd?: (sx: number, sy: number) => void;
  /** A right-click without dragging (a right drag pans): "let go of what is in my hand". */
  onSecondaryTap?: () => void;
  /** The mouse left the world (over a panel, out of the window): forget where it was. */
  onLeave?: () => void;
  /**
   * The tile a right click acts on, when it is not simply the ground tile under the pointer (a decoration piece
   * standing up in front of it, see render/world/view.ts `pointTile`).
   */
  pointTile?: (sx: number, sy: number) => { x: number; y: number };
}

/**
 * Mouse, wheel, touch and keyboard camera control on one element:
 * drag pans (unless the world takes the drag: moving a ghost, drawing belts), middle mouse drag always pans,
 * right drag pans while a tool is in hand and sweeps boulders away otherwise (game/tools/sink.ts), a right click
 * clears the boulder or decoration on a tile (or lets go of the tool), the wheel zooms at the cursor with a glide
 * (camera-motion.ts), two fingers pinch-zoom and pan, a still press taps. The mouse at the window edge scrolls
 * the map when that setting is on. Arrow keys / WASD pan and + / - zoom with momentum while no text field has focus.
 * Returns a detach function.
 */
export function attachCameraInput(el: HTMLElement, camera: Camera, options: InputOptions): () => void {
  const pointers = new Map<number, Pointer>();
  let dragged = false;
  let pinched = false;
  let captured = false;
  let swept = false;
  const keys = new KeyMotion(camera);
  const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: PointerEvent): void => {
    const p = local(e);
    el.setPointerCapture(e.pointerId);
    const mouse = e.pointerType === 'mouse';
    pointers.set(e.pointerId, { x: p.x, y: p.y, startX: p.x, startY: p.y, panOnly: mouse && e.button !== 0, secondary: mouse && e.button === 2 });
    if (pointers.size === 1) {
      dragged = false;
      pinched = false;
      captured = false;
      swept = false;
    } else {
      pinched = true;
      if (captured) options.onDragEnd?.(p.x, p.y);
      captured = false;
    }
  };

  const tile = (x: number, y: number): { x: number; y: number } => {
    const w = camera.screenToWorld(x, y);
    return worldToTile(w.x, w.y);
  };

  const sweep = (p: { x: number; y: number }): void => {
    const t = tile(p.x, p.y);
    secondarySink.current?.drag(t.x, t.y, camera.screenToWorld(p.x, p.y));
  };

  const startDrag = (ptr: Pointer): void => {
    dragged = true;
    captured = !ptr.panOnly && (options.onDragStart?.(ptr.startX, ptr.startY) ?? false);
    const t = tile(ptr.startX, ptr.startY);
    swept = ptr.secondary && (secondarySink.current?.dragStart(t.x, t.y, camera.screenToWorld(ptr.startX, ptr.startY)) ?? false);
  };

  /** One pointer moving: a drag the world took, a camera pan, or still a press. */
  const single = (ptr: Pointer, p: { x: number; y: number }): void => {
    if (!dragged && Math.hypot(p.x - ptr.startX, p.y - ptr.startY) <= TAP_SLOP) return;
    if (!dragged) startDrag(ptr);
    if (captured) options.onDrag?.(p.x, p.y);
    else if (swept) sweep(p);
    else camera.panByScreen(p.x - ptr.x, p.y - ptr.y);
  };

  const move = (e: PointerEvent): void => {
    const ptr = pointers.get(e.pointerId);
    const p = local(e);
    if (!ptr) {
      if (pointers.size === 0 && e.pointerType === 'mouse') {
        options.onHover?.(p.x, p.y);
        keys.edgeAt(p.x, p.y, el.clientWidth, el.clientHeight);
      }
      return;
    }
    if (pointers.size >= 2) pinchMove(camera, pointers, e.pointerId, p);
    else single(ptr, p);
    ptr.x = p.x;
    ptr.y = p.y;
  };

  const isTap = (ptr: Pointer, e: PointerEvent): boolean => pointers.size === 0 && !dragged && !pinched && e.type === 'pointerup' && !ptr.panOnly;

  const isSecondaryTap = (ptr: Pointer, e: PointerEvent): boolean =>
    pointers.size === 0 && !dragged && !pinched && e.type === 'pointerup' && ptr.panOnly && e.button === 2;

  const up = (e: PointerEvent): void => {
    const ptr = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!ptr) return;
    if (captured && pointers.size === 0) {
      captured = false;
      options.onDragEnd?.(ptr.x, ptr.y);
    } else if (swept && pointers.size === 0) {
      swept = false;
      const t = tile(ptr.x, ptr.y);
      secondarySink.current?.dragEnd(t.x, t.y, camera.screenToWorld(ptr.x, ptr.y));
    } else if (isTap(ptr, e)) options.onTap(ptr.x, ptr.y);
    else if (isSecondaryTap(ptr, e)) secondaryTap(ptr);
  };
  /** A right click: the tools act on the tile (clear a boulder or decoration) or, with a tool in hand, let go of it. */
  const secondaryTap = (ptr: Pointer): void => {
    const t = (options.pointTile ?? tile)(ptr.x, ptr.y);
    if (!secondarySink.current?.tap(t.x, t.y)) options.onSecondaryTap?.();
  };
  const leave = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    keys.edgeAt(-1, -1, 0, 0);
    if (pointers.size === 0) options.onLeave?.();
  };
  const noMenu = (e: Event): void => e.preventDefault();

  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-delta * WHEEL_ZOOM);
    if (toolSettings.get().smoothZoom) keys.zoomBy(factor, p.x, p.y);
    else camera.zoomAt(factor, p.x, p.y);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', noMenu);
  keys.attach();
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('pointerleave', leave);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', noMenu);
    keys.detach();
  };
}

/** Two-finger gesture: zoom by the change in finger distance around the midpoint, pan with the midpoint. */
function pinchMove(camera: Camera, pointers: Map<number, Pointer>, id: number, p: { x: number; y: number }): void {
  const [a, b] = [...pointers.entries()].slice(0, 2);
  if (!a || !b) return;
  const other = a[0] === id ? b[1] : a[1];
  const self = pointers.get(id)!;
  const before = { mx: (self.x + other.x) / 2, my: (self.y + other.y) / 2, d: Math.hypot(self.x - other.x, self.y - other.y) };
  const after = { mx: (p.x + other.x) / 2, my: (p.y + other.y) / 2, d: Math.hypot(p.x - other.x, p.y - other.y) };
  if (before.d > 0) camera.zoomAt(after.d / before.d, after.mx, after.my);
  camera.panByScreen(after.mx - before.mx, after.my - before.my);
}

/** Keys only steer the camera when no text field has focus (buttons are fine) and no modifier but Shift is held. */
export function keyIsForWorld(e: Pick<KeyboardEvent, 'target' | 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return !isTextEntry(e.target as HTMLElement | null);
}

/**
 * Window key listeners for the camera: holds the pressed keys in a CameraMotion and runs an animation-frame loop
 * only while the camera is moving, so an idle game costs nothing.
 */
class KeyMotion {
  private readonly motion = new CameraMotion();
  private raf = 0;
  private last = 0;

  constructor(private readonly camera: Camera) {}

  private readonly down = (e: KeyboardEvent): void => {
    if (!keyIsForWorld(e)) return;
    if (!this.motion.press(e.code, e.key)) return;
    e.preventDefault();
    this.kick();
  };

  private readonly up = (e: KeyboardEvent): void => this.motion.release(e.code, e.key);

  /** A wheel zoom glides to its target (see CameraMotion.wheel). */
  zoomBy(factor: number, sx: number, sy: number): void {
    this.motion.wheel(factor, sx, sy, this.camera);
    this.kick();
  }

  /** The mouse at (x, y) in a w x h element: pushes at an edge when edge scrolling is on (w = 0: the mouse left). */
  edgeAt(x: number, y: number, w: number, h: number): void {
    const on = toolSettings.get().edgePan && w > 0;
    const ex = on ? Number(x >= w - EDGE_ZONE) - Number(x <= EDGE_ZONE) : 0;
    const ey = on ? Number(y >= h - EDGE_ZONE) - Number(y <= EDGE_ZONE) : 0;
    this.motion.edge(ex, ey);
    if (ex !== 0 || ey !== 0) this.kick();
  }

  private readonly stop = (): void => this.motion.releaseAll();

  private readonly frame = (now: number): void => {
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.raf = this.motion.step(dt, this.camera) ? requestAnimationFrame(this.frame) : 0;
  };

  private kick(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  attach(): void {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.stop);
  }

  detach(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.stop);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.motion.rest();
    this.motion.releaseAll();
  }
}
