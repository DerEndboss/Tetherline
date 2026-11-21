import { emitCue } from '../audio/cues';
import type { BuildingDef, Id } from '../content/types';
import type { Command, PlanSpec, TileBox } from '../sim/commands';
import { asDir } from '../sim/grid';
import type { Dir } from '../sim/state';
import type { World } from '../sim/world';
import { wreckAt } from '../sim/wrecks';
import type { Game } from './game';
import { blueprintPlans, captureBlueprint, flipBlueprint, pasteCorner, rotateBlueprint, type Blueprint } from './tools/blueprint';
import { type Tile } from './tools/geometry';
import { isLineDef, pastePreview, placePreview, type Modifiers, type PlaceDrag, type PreviewGhost } from './tools/preview';
import { Region, rowRuns, type WorldPt } from './tools/region';
import { probes, secondarySink, type SecondarySink } from './tools/sink';
import { toolSettings } from './tools/settings';
import { UndoStack, type UndoEntry } from './tools/undo';

export type { PreviewGhost } from './tools/preview';

export type Mode = { kind: 'none' } | { kind: 'place'; building: Id } | { kind: 'remove' } | { kind: 'select' } | { kind: 'paste' };

/** What the React side sees (a new object whenever it changes, for useSyncExternalStore). */
export interface InteractionView {
  mode: Mode;
  rot: Dir;
  /** Building id the player clicked (context info), -1 = none. */
  selected: number;
  /** The decoration piece the player clicked (it stays highlighted), null = none. */
  decoSelected: Tile | null;
  /** The blueprint in the clipboard (copied area, or one picked from the library), if any. */
  clip: { name: string; w: number; h: number; count: number } | null;
  undo: number;
  redo: number;
}

type DragKind = 'place' | 'remove' | 'select' | 'sweep';

interface Drag {
  kind: DragKind;
  from: Tile;
  /** Where the press was, in world px (null: only tiles are known, so a drag covers a box of tiles). */
  fromAt: WorldPt | null;
  /** Which axis a placing line starts along (see PlaceDrag). */
  xFirst: boolean | null;
}

/** The axis of a line is fixed once the pointer is this many tiles from the start. */
const AXIS_LOCK = 2;

/**
 * The build tools between pointer, renderer and sim. It turns gestures on tiles into commands:
 * - click places a ghost; drag lays a belt line (turns by itself, routes around obstacles), a pole line, or a
 *   row of copies; Shift-drag fills a rectangle; Ctrl flips which way a line turns first;
 * - X is the demolish tool (drag a rectangle; materials come back), Delete/Backspace demolishes what is under
 *   the cursor, or clears the dust boulder or decoration there; right click does the same with no tool in hand
 *   (a ghost is cancelled, a building demolished; Ctrl+Z brings it back);
 * - a plain click with no tool selects the building, salvages the wreck or selects the decoration piece under the
 *   pointer (it stays highlighted; Backspace / Delete / right click removes it);
 * - R rotates the ghost, the blueprint in hand or the building under the cursor, Q picks what is under the cursor;
 * - B / Ctrl+C selects an area to copy as a blueprint, Ctrl+V pastes it (R / F turn and mirror it);
 * - Ctrl+Z / Ctrl+Shift+Z undo and redo placing, demolishing and rotating.
 * Left drags without a tool and middle drags pan; right drags sweep boulders away when no tool is in hand.
 */
export class Interaction {
  mode: Mode = { kind: 'none' };
  rot: Dir = 0;
  /** True until R is pressed for the tool in hand: a single belt then turns to fit the belts next to it. */
  private autoTurn = true;
  selected = -1;
  /** The decoration piece the player clicked: a tile (set by a plain click, cleared by Escape, a tool or removing it). */
  selectedDeco: Tile | null = null;
  /** What a Q pick took from a building: its setting (recipe, sorter item), put on the copies placed next; -1 = none. */
  private toolConfig = -1;
  /** The blueprint in hand while mode is `paste` (already turned), and the last copied one. */
  clip: Blueprint | null = null;
  readonly undoStack = new UndoStack();
  private _hover: Tile | null = null;
  /** The pointer in world px (null when the caller gave tiles only). */
  private _hoverAt: WorldPt | null = null;
  private drag: Drag | null = null;
  private regionCache: { key: string; region: Region } | null = null;
  private mods: Modifiers = { shift: false, ctrl: false };
  private listeners = new Set<() => void>();
  private pickListeners = new Set<(building: Id) => void>();
  private view: InteractionView;
  private rev = 0;
  private cache: { rev: number; layout: number; world: World; ghosts: PreviewGhost[] } | null = null;
  private world: World;

  constructor(private readonly game: Game) {
    this.world = game.world;
    this.view = this.makeView();
    secondarySink.current = this.secondary;
  }

  /* ---------- Store for React ---------- */

  readonly subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  readonly getView = (): InteractionView => this.view;

  /** Called when the player picks a building with Q (the hotbar can put it in a slot). */
  onPick(fn: (building: Id) => void): () => void {
    this.pickListeners.add(fn);
    return () => this.pickListeners.delete(fn);
  }

  private makeView(): InteractionView {
    const c = this.clip;
    return {
      mode: this.mode,
      rot: this.rot,
      selected: this.selected,
      decoSelected: this.selectedDeco,
      clip: c ? { name: c.name, w: c.w, h: c.h, count: c.items.length } : null,
      undo: this.undoStack.undoCount,
      redo: this.undoStack.redoCount,
    };
  }

  private changed(): void {
    this.rev++;
    this.view = this.makeView();
    for (const l of this.listeners) l();
  }

  /** The tile under the cursor (null when it is over a panel or outside). */
  get hover(): Tile | null {
    return this._hover;
  }

  /**
   * The tile corner nearest the pointer (set by the renderer before hover and tap). A building of even size centres
   * on it, so a 2x2 drill sits where the cursor points instead of hanging off to one side.
   */
  set corner(c: Tile | null) {
    if (c === this._corner || (c && this._corner && c.x === this._corner.x && c.y === this._corner.y)) return;
    this._corner = c;
    this.rev++;
  }

  private _corner: Tile | null = null;

  set hover(t: Tile | null) {
    const same = t === this._hover || (t !== null && this._hover !== null && t.x === this._hover.x && t.y === this._hover.y);
    if (same) return;
    this._hover = t;
    this.rev++;
  }

  /** A new world was loaded: forget history and drags that belong to the old one. */
  private sync(): World {
    const w = this.game.world;
    if (w !== this.world) {
      this.world = w;
      this.undoStack.clear();
      this.drag = null;
      this.rev++;
    }
    return w;
  }

  /** Shift and Ctrl as held right now (hotkeys.ts keeps this up to date). */
  setModifiers(shift: boolean, ctrl: boolean): void {
    if (shift === this.mods.shift && ctrl === this.mods.ctrl) return;
    this.mods = { shift, ctrl };
    this.rev++;
  }

  /* ---------- Tools ---------- */

  startPlacing(building: Id): void {
    this.mode = { kind: 'place', building };
    this.autoTurn = true;
    this.toolConfig = -1;
    this.selected = -1;
    this.selectedDeco = null;
    this.drag = null;
    this.changed();
  }

  /** X: the demolish tool (drag a rectangle, or click one building). */
  startRemoving(): void {
    this.mode = { kind: 'remove' };
    this.selectedDeco = null;
    this.drag = null;
    this.changed();
  }

  /** B / Ctrl+C: drag a rectangle to copy what is inside as a blueprint. */
  startSelecting(): void {
    this.mode = { kind: 'select' };
    this.drag = null;
    this.changed();
  }

  /** Puts a blueprint in hand (a fresh copy, one from the library, or the clipboard again with no argument). */
  pasteBlueprint(bp: Blueprint | null = this.clip): void {
    if (!bp) return;
    this.clip = bp;
    this.mode = { kind: 'paste' };
    this.drag = null;
    this.changed();
  }

  /** Drops the tool in hand, a drag in progress and the selection. */
  cancel(): void {
    this.mode = { kind: 'none' };
    this.drag = null;
    this.selected = -1;
    this.selectedDeco = null;
    this.changed();
  }

  /** R: turns the ghost, the blueprint in hand, or (no tool) the rotating building under the cursor. */
  rotate(by = 1): void {
    const w = this.sync();
    if (this.mode.kind === 'paste' && this.clip) this.clip = rotateBlueprint(this.clip, by);
    else if (this.mode.kind === 'place') this.turnTool(by);
    else return this.turnBuildingUnderCursor(w, by);
    this.changed();
  }

  /** Turns the tool in hand; a belt shown turned to fit its neighbours turns on from where it is shown. */
  private turnTool(by: number): void {
    const shown = this.autoTurn ? this.preview()[0] : undefined;
    this.rot = asDir((shown && this.preview().length === 1 ? shown.rot : this.rot) + by + 4);
    this.autoTurn = false;
  }

  private turnBuildingUnderCursor(w: World, by: number): void {
    const b = this._hover ? w.at(this._hover.x, this._hover.y) : undefined;
    if (!b || !w.def(b).rotates || b.build < 1) return;
    const to = asDir(b.rot + by + 4);
    this.game.enqueue({ type: 'rotate', id: b.id, rot: to });
    this.undoStack.record({ type: 'rotate', id: b.id, from: b.rot, to });
    this.changed();
  }

  /** F: mirrors the blueprint in hand. */
  flip(): void {
    if (this.mode.kind !== 'paste' || !this.clip) return;
    this.clip = flipBlueprint(this.clip);
    this.changed();
  }

  /** Q: take the building (or queued ghost) under the cursor as the tool, with its rotation. */
  pipette(): void {
    const w = this.sync();
    const t = this._hover;
    const hit = t ? thingAt(w, t) : null;
    if (!hit) return;
    const def = w.defs[hit.kind]!;
    if (def.behaviour === 'core') return;
    this.rot = hit.rot;
    this.startPlacing(def.id);
    this.autoTurn = false;
    this.toolConfig = def.stages ? -1 : hit.config;
    for (const fn of this.pickListeners) fn(def.id);
  }

  private def(): BuildingDef | undefined {
    return this.mode.kind === 'place' ? this.game.content.buildings.find(this.mode.building) : undefined;
  }

  /* ---------- Undo ---------- */

  undo(): void {
    const w = this.sync();
    for (const c of this.undoStack.undo(w)) this.game.enqueue(c);
    this.changed();
  }

  redo(): void {
    const w = this.sync();
    for (const c of this.undoStack.redo(w)) this.game.enqueue(c);
    this.changed();
  }

  /* ---------- Demolish and clear ---------- */

  /** What would be demolished in an area, as specs (for undo): buildings (not the core) and queued ghosts. */
  private specsIn(w: World, area: Region): PlanSpec[] {
    const out: PlanSpec[] = [];
    for (const b of w.state.buildings) {
      const def = w.def(b);
      if (def.behaviour === 'core' || !area.hasFootprint(b.x, b.y, def.size)) continue;
      out.push(spec(def.id, b.x, b.y, b.rot, b.config));
    }
    for (const p of w.state.plans) if (area.hasFootprint(p.x, p.y, w.defs[p.kind]!.size)) out.push(spec(w.defs[p.kind]!.id, p.x, p.y, p.rot, p.config));
    return out;
  }

  /** Marks everything in a box for removal (the drone runs it down and the materials go back to the core). */
  demolish(box: TileBox): number {
    return this.demolishArea(Region.ofBox(box));
  }

  /**
   * Marks everything an area covers for removal. A box of tiles is one command; an area on the screen (iso) takes
   * the buildings and ghosts whose footprint centre it holds, one single-tile command each (the same commands undo
   * sends), so the sim needs no idea of such shapes.
   */
  demolishArea(area: Region): number {
    const w = this.sync();
    const specs = this.specsIn(w, area);
    if (area.rect === null) this.game.enqueue({ type: 'remove', ...area.box });
    else for (const p of specs) this.game.enqueue({ type: 'remove', x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    if (specs.length) this.undoStack.record({ type: 'demolish', plans: specs });
    this.changed();
    return specs.length;
  }

  /**
   * Delete / Backspace: demolish the building or ghost under the cursor, else the selected building, else clear
   * the dust boulder or the decoration piece under the cursor, else the decoration piece that was clicked.
   */
  demolishAtCursor(): void {
    const w = this.sync();
    const t = this._hover;
    if (t && this.demolishTile(w, t)) return;
    const sel = this.selected >= 0 ? w.byId.get(this.selected) : undefined;
    if (!t && sel && w.def(sel).behaviour !== 'core') {
      this.demolish({ x0: sel.x, y0: sel.y, x1: sel.x, y1: sel.y });
      this.selected = -1;
      this.changed();
    } else if (!(t && this.clearAt(w, t)) && this.selectedDeco) this.removeDeco(this.selectedDeco);
  }

  /** Demolishes the building (not the core) or the queued ghost on a tile. Whether there was one. */
  private demolishTile(w: World, t: Tile): boolean {
    const box = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
    if (!this.specsIn(w, Region.ofBox(box)).length) return false;
    this.demolish(box);
    return true;
  }

  /** Clears the dust boulder on a tile, else the decoration piece (it stays gone in this run). Whether it asked for anything. */
  private clearAt(w: World, t: Tile): boolean {
    if (!w.inBounds(t.x, t.y) || w.at(t.x, t.y)) return false;
    const { map } = w.state;
    if (map.boulder[t.y * map.w + t.x]) {
      this.game.enqueue({ type: 'clear-boulders', x0: t.x, y0: t.y, x1: t.x, y1: t.y });
      return true;
    }
    if (probes.decoAt && !probes.decoAt(t.x, t.y)) return false;
    this.removeDeco(t);
    return true;
  }

  /** Asks the sim to take the decoration piece on a tile away; the deco layer lays its cables anew around the gap. */
  private removeDeco(t: Tile): void {
    this.game.enqueue({ type: 'remove-deco', x: t.x, y: t.y });
    if (this.selectedDeco && this.selectedDeco.x === t.x && this.selectedDeco.y === t.y) {
      this.selectedDeco = null;
      this.changed();
    }
  }

  /* ---------- Right mouse button (no tool in hand) ---------- */

  private readonly secondary: SecondarySink = {
    tap: (x, y) => {
      if (this.mode.kind !== 'none') return false;
      const w = this.sync();
      // what is under the pointer goes: a ghost or building first (undo brings it back), else a boulder or decoration
      if (!this.demolishTile(w, { x, y })) this.clearAt(w, { x, y });
      if (this.selected >= 0 || this.selectedDeco) {
        this.selected = -1;
        this.selectedDeco = null;
        this.changed();
      }
      return true;
    },
    dragStart: (x, y, at) => {
      if (this.mode.kind !== 'none') return false;
      this.drag = { kind: 'sweep', from: { x, y }, fromAt: at ?? null, xFirst: null };
      this.point(x, y, at);
      return true;
    },
    drag: (x, y, at) => this.point(x, y, at),
    dragEnd: (x, y, at) => {
      const d = this.drag;
      this.drag = null;
      if (d?.kind !== 'sweep') return;
      this.sweepBoulders(Region.ofDrag(d.from, d.fromAt, { x, y }, at ?? null, ...this.mapSize()));
      this.point(x, y, at);
      this.rev++;
    },
  };

  /** Clears the dust boulders an area covers: a box is one command, an area on the screen one per row run of boulder tiles. */
  private sweepBoulders(area: Region): void {
    if (area.tooBig) return;
    if (area.rect === null) return this.game.enqueue({ type: 'clear-boulders', ...area.box });
    const { map } = this.sync().state;
    for (const run of rowRuns(area.tiles().filter((t) => map.boulder[t.y * map.w + t.x]))) this.game.enqueue({ type: 'clear-boulders', ...run });
  }

  private mapSize(): [number, number] {
    const { map } = this.sync().state;
    return [map.w, map.h];
  }

  /** The pointer is at a tile and (when known) a world point; a new point inside the same tile still changes an area. */
  private point(x: number, y: number, at: WorldPt | undefined): void {
    this.hover = { x, y };
    const next = at ?? null;
    if (next?.x === this._hoverAt?.x && next?.y === this._hoverAt?.y) return;
    this._hoverAt = next;
    this.rev++;
  }

  /* ---------- Pointer (tile coordinates, from the renderer) ---------- */

  hoverAt(x: number, y: number, at?: WorldPt): void {
    this.point(x, y, at);
    this.followDrag();
    this.tickBelt();
  }

  /** While a belt line is dragged, each new tile ticks (audio cue; pitch rises with the length). */
  private beltLength = 0;
  private tickBelt(): void {
    const def = this.def();
    const length = this.drag?.kind === 'place' && def && isLineDef(def) ? this.preview().length : 0;
    if (length > this.beltLength) emitCue({ type: 'belt-tick', length });
    this.beltLength = length;
  }

  /** The line's axis is decided once the pointer has moved a little. */
  private followDrag(): void {
    const d = this.drag;
    const h = this._hover;
    if (d?.kind !== 'place' || d.xFirst !== null || !h) return;
    const dx = Math.abs(h.x - d.from.x);
    const dy = Math.abs(h.y - d.from.y);
    if (Math.max(dx, dy) >= AXIS_LOCK) d.xFirst = dx >= dy;
  }

  /** A click without dragging. */
  tap(x: number, y: number): void {
    const w = this.sync();
    this.hover = { x, y };
    const box = { x0: x, y0: y, x1: x, y1: y };
    switch (this.mode.kind) {
      case 'place':
        return this.commitPlace();
      case 'paste':
        return this.commitPaste();
      case 'remove':
        this.demolish(box);
        return;
      case 'select':
        return this.finishSelect(Region.ofBox(box));
      default:
        this.select(w, x, y);
    }
  }

  /** A plain click with no tool: a building, else a decoration piece (easter-egg hook), else a wreck to salvage. */
  private select(w: World, x: number, y: number): void {
    const b = w.at(x, y);
    const deco = !b && probes.decoAt?.(x, y) === true;
    this.selected = b?.id ?? -1;
    this.selectedDeco = deco ? { x, y } : null;
    if (deco) probes.decoTap?.(x, y);
    else if (!b && wreckAt(w, x, y)) this.game.enqueue({ type: 'salvage', x, y });
    this.changed();
  }

  /** A left drag starts: the tools take it (line, rectangle); without a tool (or with a blueprint in hand) the camera pans. */
  dragStart(x: number, y: number, at?: WorldPt): boolean {
    const kind = ({ place: 'place', remove: 'remove', select: 'select' } as Record<string, DragKind | undefined>)[this.mode.kind];
    if (!kind) return false;
    this.drag = { kind, from: { x, y }, fromAt: at ?? null, xFirst: null };
    this.point(x, y, at);
    return true;
  }

  dragEnd(x: number, y: number, at?: WorldPt): void {
    const d = this.drag;
    this.point(x, y, at);
    if (!d) return;
    this.followDrag();
    if (d.kind === 'remove') this.demolishArea(this.dragArea('remove') ?? Region.ofBox({ x0: x, y0: y, x1: x, y1: y }));
    else if (d.kind === 'select') this.finishSelect(this.dragArea('select') ?? Region.ofBox({ x0: x, y0: y, x1: x, y1: y }));
    else if (d.kind === 'place') this.commitPlace();
    this.drag = null;
    this.rev++;
  }

  /** The area being demolished (a box of tiles, or in iso a rectangle on the screen), or null. */
  removeArea(): Region | null {
    return this.dragArea('remove');
  }

  /** The area being selected for copying, or null. */
  selectArea(): Region | null {
    return this.dragArea('select');
  }

  /** The area being swept clear of boulders (right drag), or null. */
  sweepArea(): Region | null {
    return this.dragArea('sweep');
  }

  /** A Shift-drag fills an area: while the drag runs, else null. */
  fillArea(): Region | null {
    return this.mods.shift ? this.dragArea('place') : null;
  }

  /** The tile box around the area being demolished (inclusive tiles), or null. */
  removeRect(): TileBox | null {
    return this.removeArea()?.box ?? null;
  }

  /** The tile box around the area being selected for copying, or null. */
  selectRect(): TileBox | null {
    return this.selectArea()?.box ?? null;
  }

  /** The tile box around the area being swept, or null. */
  sweepRect(): TileBox | null {
    return this.sweepArea()?.box ?? null;
  }

  /** The tile box around a Shift-fill, or null. */
  fillRect(): TileBox | null {
    return this.fillArea()?.box ?? null;
  }

  /** The outline of the blueprint in hand at the cursor (inclusive tiles), or null. */
  pasteBox(): TileBox | null {
    const bp = this.clip;
    const t = this._hover;
    if (this.mode.kind !== 'paste' || !bp || !t) return null;
    const at = pasteCorner(bp, t.x, t.y);
    return { x0: at.x, y0: at.y, x1: at.x + bp.w - 1, y1: at.y + bp.h - 1 };
  }

  /** Whether a pole line is being dragged (the layer draws the lasers between the poles). */
  isPoleDrag(): boolean {
    return this.drag?.kind === 'place' && this.def()?.behaviour === 'power-node' && !this.mods.shift;
  }

  /** The area the running drag of this kind covers, from where it began to where the pointer is now (cached per pointer move). */
  private dragArea(kind: DragKind): Region | null {
    const d = this.drag;
    const h = this._hover;
    if (d?.kind !== kind || !h) return null;
    const at = this._hoverAt;
    const key = `${d.from.x},${d.from.y},${d.fromAt?.x},${d.fromAt?.y},${h.x},${h.y},${at?.x},${at?.y},${this.world.state.map.w}`;
    if (this.regionCache?.key !== key) this.regionCache = { key, region: Region.ofDrag(d.from, d.fromAt, h, at, ...this.mapSize()) };
    return this.regionCache.region;
  }

  /* ---------- Committing ---------- */

  private finishSelect(area: Region): void {
    const bp = captureBlueprint(this.sync(), area, '');
    this.drag = null;
    if (bp) this.pasteBlueprint(bp);
  }

  private commitPlace(): void {
    const w = this.sync();
    const def = this.def();
    const ghosts = this.preview().filter((g) => g.ok);
    if (!def || !ghosts.length) return;
    const turned = ghosts.filter((g) => g.replace !== undefined && w.byId.get(g.replace)?.rot !== g.rot);
    const fresh = ghosts.filter((g) => g.replace === undefined);
    const kindOfTool = this.game.content.buildings.indexOf(def.id);
    const entries: UndoEntry[] = [];
    if (fresh.length) {
      // a ghost may be another kind than the tool (a junction where a belt line crosses a belt)
      const plans = fresh.map((g) => spec(w.defs[g.kind]?.id ?? def.id, g.x, g.y, g.rot, g.kind === kindOfTool ? this.toolConfig : -1));
      this.game.enqueue({ type: 'place-many', plans });
      entries.push({ type: 'place', plans });
    }
    for (const g of turned) {
      const b = w.byId.get(g.replace!)!;
      this.game.enqueue({ type: 'rotate', id: b.id, rot: g.rot });
      entries.push({ type: 'rotate', id: b.id, from: b.rot, to: g.rot });
    }
    emitCue(isLineDef(def) ? { type: 'belt-done', length: ghosts.length } : { type: 'ghost', count: ghosts.length });
    this.afterPlacing(entries);
  }

  private commitPaste(): void {
    const bp = this.clip;
    const t = this._hover;
    if (!bp || !t) return;
    const w = this.sync();
    const at = pasteCorner(bp, t.x, t.y);
    const ok = new Set(pastePreview(w, bp, t).filter((g) => g.ok).map((g) => `${g.x},${g.y}`));
    const plans = blueprintPlans(bp, at.x, at.y).filter((p) => ok.has(`${p.x},${p.y}`));
    if (plans.length) {
      this.game.enqueue({ type: 'place-many', plans });
      emitCue({ type: 'ghost', count: plans.length });
      this.afterPlacing([{ type: 'place', plans }]);
    }
  }

  /** Remembers the action for undo; drops the tool unless the player keeps it (setting) or holds Shift. */
  private afterPlacing(entries: UndoEntry[]): void {
    if (entries.length) this.undoStack.record(entries.length === 1 ? entries[0]! : { type: 'group', entries });
    if (!toolSettings.get().keepTool && !this.mods.shift) this.cancel();
    else this.changed();
  }

  /** Enqueues raw commands (the UI's buttons). */
  send(c: Command): void {
    this.game.enqueue(c);
  }

  /* ---------- Preview ---------- */

  /** Ghosts to draw under the cursor (one, a dragged line, a filled rectangle, a pasted blueprint). Cached until something changes. */
  preview(): PreviewGhost[] {
    const w = this.sync();
    const c = this.cache;
    if (c && c.rev === this.rev && c.layout === w.layout && c.world === w) return c.ghosts;
    const ghosts = this.computePreview(w);
    this.cache = { rev: this.rev, layout: w.layout, world: w, ghosts };
    return ghosts;
  }

  private computePreview(w: World): PreviewGhost[] {
    const t = this._hover;
    if (!t) return [];
    if (this.mode.kind === 'paste' && this.clip) return pastePreview(w, this.clip, t);
    const def = this.def();
    if (!def) return [];
    const kind = this.game.content.buildings.indexOf(def.id);
    const d = this.drag?.kind === 'place' ? ({ from: this.drag.from, xFirst: this.drag.xFirst, area: this.mods.shift ? this.dragArea('place') : null } satisfies PlaceDrag) : null;
    return placePreview(w, def, kind, d ? t : this.centreTile(def, t), d, this.rot, this.mods, this.autoTurn);
  }

  /** The tile topLeftFor centres on: the hovered one, or for an even size the one that puts the footprint around the corner. */
  private centreTile(def: BuildingDef, t: Tile): Tile {
    const c = this._corner;
    if (def.size % 2 !== 0 || !c || Math.abs(c.x - t.x) > 1 || Math.abs(c.y - t.y) > 1) return t;
    const shift = def.size / 2 - Math.floor((def.size - 1) / 2);
    return { x: c.x - shift, y: c.y - shift };
  }

  /** Whether the building tool drags lines (for hints). */
  isLine(def: BuildingDef): boolean {
    return isLineDef(def);
  }
}

function spec(kind: Id, x: number, y: number, rot: Dir, config = -1): PlanSpec {
  return config >= 0 ? { kind, x, y, rot, config } : { kind, x, y, rot };
}

/** The building, or else the queued ghost, covering a tile (what Q picks). */
function thingAt(w: World, t: Tile): { kind: number; rot: Dir; config: number } | null {
  const b = w.at(t.x, t.y);
  if (b) return b;
  const covers = (p: { kind: number; x: number; y: number }): boolean => {
    const s = w.defs[p.kind]!.size;
    return t.x >= p.x && t.y >= p.y && t.x < p.x + s && t.y < p.y + s;
  };
  return w.state.plans.find(covers) ?? null;
}
