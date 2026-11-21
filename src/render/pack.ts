export interface PackItem {
  id: string;
  w: number;
  h: number;
}

export interface PackRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Packed {
  width: number;
  height: number;
  rects: Map<string, PackRect>;
}

/** Shelf packer for texture atlases: tallest first, left to right, new shelf when the row is full. */
export function packShelves(items: readonly PackItem[], maxWidth: number, padding: number): Packed {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w);
  const rects = new Map<string, PackRect>();
  let x = padding;
  let y = padding;
  let shelfH = 0;
  let width = 0;
  for (const it of sorted) {
    if (it.w + padding * 2 > maxWidth) throw new Error(`Sprite ${it.id} is wider than the atlas`);
    if (x + it.w + padding > maxWidth) {
      x = padding;
      y += shelfH + padding;
      shelfH = 0;
    }
    rects.set(it.id, { x, y, w: it.w, h: it.h });
    x += it.w + padding;
    shelfH = Math.max(shelfH, it.h);
    width = Math.max(width, x);
  }
  return { width, height: y + shelfH + padding, rects };
}

export interface PackedPage extends Packed {
  ids: string[];
}

/**
 * Splits items over as many atlas pages as needed so no page exceeds `maxWidth` x `maxHeight`
 * (GPU texture limits; 4096 px is safe on mid-range phones).
 */
export function packPages(items: readonly PackItem[], maxWidth: number, maxHeight: number, padding: number): PackedPage[] {
  const pages: PackedPage[] = [];
  let pending = [...items];
  while (pending.length > 0) {
    let take = pending.length;
    let packed = packShelves(pending.slice(0, take), maxWidth, padding);
    while (packed.height > maxHeight && take > 1) {
      take = Math.ceil(take / 2);
      packed = packShelves(pending.slice(0, take), maxWidth, padding);
    }
    pages.push({ ...packed, ids: pending.slice(0, take).map((it) => it.id) });
    pending = pending.slice(take);
  }
  return pages;
}

/**
 * Bake scale (texels per world px) for sprites whose visible parts cover `area` world px²: the wanted scale,
 * or less when that would need more than `budget` texels (0 = no budget). Never below 1.
 */
export function planScale(area: number, wanted: number, budget: number): number {
  if (budget <= 0 || area <= 0) return wanted;
  return Math.max(1, Math.min(wanted, Math.sqrt(budget / area)));
}
