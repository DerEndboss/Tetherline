import { Graphics } from 'pixi.js';
import type { Interaction } from '../../game/interaction';
import type { Region } from '../../game/tools/region';
import type { TileBox } from '../../sim/commands';
import type { World } from '../../sim/world';
import { gridToWorld, worldX, worldY } from '../iso';
import { footprintCentre } from './geometry';

const SELECT = 0x7ff0e8;
const REMOVE = 0xff7a6a;
const SWEEP = 0xe8c98a;
const FILL = 0xb8f0c8;
const POLE = 0xffd36b;
/** Most captured tiles marked one by one (a bigger area shows just its rectangle and the buildings it takes). */
const MARK_LIMIT = 1500;
/** How far a tile mark is inset from the tile's edges, in tiles. */
const MARK_INSET = 0.22;

/**
 * The tools' lines over the world (every frame): the demolish rectangle with the buildings it would take,
 * the copy rectangle, the boulder sweep, the rectangle of a Shift-fill, the blueprint's outline in hand, the
 * pole line, the selection outline. Drag areas are rectangles on the screen in the iso view (axis-aligned, left to
 * right) with a mark on every tile they capture; in the top-down views they are the box of tiles, as ever. Ghosts themselves are drawn by the objects layer from `interaction.preview()`.
 */
export class ToolsLayer {
  readonly layer = new Graphics();

  update(w: World, interaction: Interaction): void {
    const g = this.layer;
    g.clear();
    const remove = interaction.removeArea();
    if (remove) this.demolishArea(g, w, remove);
    else if (interaction.getView().mode.kind === 'remove') this.hoverTarget(g, w, interaction);
    this.area(g, interaction.selectArea(), SELECT);
    this.area(g, interaction.sweepArea(), SWEEP);
    this.area(g, interaction.fillArea(), FILL);
    this.box(g, interaction.pasteBox(), SELECT, 0.05);
    this.poleLine(g, w, interaction);
    this.selection(g, w, interaction.selected);
  }

  private box(g: Graphics, r: TileBox | null, color: number, fill = 0.12): void {
    if (!r) return;
    const pts = [gridToWorld(r.x0, r.y0), gridToWorld(r.x1 + 1, r.y0), gridToWorld(r.x1 + 1, r.y1 + 1), gridToWorld(r.x0, r.y1 + 1)];
    g.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color, alpha: fill }).stroke({ width: 2, color, alpha: 0.9 });
  }

  /** A drag area: the screen rectangle (iso) with a small mark on each captured tile, or the box of tiles. */
  private area(g: Graphics, a: Region | null, color: number, fill = 0.12): void {
    if (!a) return;
    const r = a.rect;
    if (!r) return this.box(g, a.box, color, fill);
    g.rect(r.left, r.top, r.right - r.left, r.bottom - r.top).fill({ color, alpha: fill * 0.6 }).stroke({ width: 2, color, alpha: 0.9 });
    if (a.count > MARK_LIMIT) return;
    for (const t of a.tiles()) {
      const pts = [gridToWorld(t.x + MARK_INSET, t.y + MARK_INSET), gridToWorld(t.x + 1 - MARK_INSET, t.y + MARK_INSET), gridToWorld(t.x + 1 - MARK_INSET, t.y + 1 - MARK_INSET), gridToWorld(t.x + MARK_INSET, t.y + 1 - MARK_INSET)];
      g.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color, alpha: 0.3 });
    }
  }

  private outline(g: Graphics, x: number, y: number, size: number, color: number, width = 2.5): void {
    const pts = [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
    ];
    g.poly(pts.flatMap(([px, py]) => [worldX(px!, py!), worldY(px!, py!)])).stroke({ width, color, alpha: 0.9 });
  }

  /** The area and an outline on every building (and queued ghost) it takes. */
  private demolishArea(g: Graphics, w: World, a: Region): void {
    this.area(g, a, REMOVE);
    for (const b of w.state.buildings) {
      const size = w.def(b).size;
      if (w.def(b).behaviour !== 'core' && a.hasFootprint(b.x, b.y, size)) this.outline(g, b.x, b.y, size, REMOVE);
    }
    for (const p of w.state.plans) if (a.hasFootprint(p.x, p.y, w.defs[p.kind]!.size)) this.outline(g, p.x, p.y, w.defs[p.kind]!.size, REMOVE, 1.5);
  }

  /** With the demolish tool in hand: the building under the cursor is outlined red. */
  private hoverTarget(g: Graphics, w: World, interaction: Interaction): void {
    const t = interaction.hover;
    const b = t ? w.at(t.x, t.y) : undefined;
    if (b && w.def(b).behaviour !== 'core') this.outline(g, b.x, b.y, w.def(b).size, REMOVE);
    else if (t) this.outline(g, t.x, t.y, 1, REMOVE, 1.5);
  }

  /** A thin dashed-looking laser between the poles of a dragged pole line. */
  private poleLine(g: Graphics, w: World, interaction: Interaction): void {
    if (!interaction.isPoleDrag()) return;
    const ghosts = interaction.preview();
    for (let i = 1; i < ghosts.length; i++) {
      const a = ghosts[i - 1]!;
      const b = ghosts[i]!;
      const pa = footprintCentre(a.x, a.y, w.defs[a.kind]!.size);
      const pb = footprintCentre(b.x, b.y, w.defs[b.kind]!.size);
      g.moveTo(pa.x, pa.y - 40).lineTo(pb.x, pb.y - 40).stroke({ width: 1.5, color: POLE, alpha: 0.7 });
    }
  }

  private selection(g: Graphics, w: World, id: number): void {
    const b = id >= 0 ? w.byId.get(id) : undefined;
    if (b) this.outline(g, b.x, b.y, w.def(b).size, SELECT);
  }
}
