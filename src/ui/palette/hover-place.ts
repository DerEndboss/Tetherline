/** Where the hover card goes (pure, see HoverCard.tsx): beside the pointer, inside the window, off the HUD's plates. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CardSpot {
  x: number;
  y: number;
}

/** How far the card sits from the pointer, and the room it keeps to the window's edge. */
export const OFFSET = 18;
export const MARGIN = 8;

/** The four spots around the pointer, the usual one first: right below, left below, right above, left above. */
function around(px: number, py: number, w: number, h: number): CardSpot[] {
  return [
    { x: px + OFFSET, y: py + OFFSET },
    { x: px - OFFSET - w, y: py + OFFSET },
    { x: px + OFFSET, y: py - OFFSET - h },
    { x: px - OFFSET - w, y: py - OFFSET - h },
  ];
}

function inside(s: CardSpot, w: number, h: number, vw: number, vh: number): boolean {
  return s.x >= MARGIN && s.y >= MARGIN && s.x + w <= vw - MARGIN && s.y + h <= vh - MARGIN;
}

/** The area of the card at `s` that lies on the plates. */
function covered(s: CardSpot, w: number, h: number, plates: readonly Rect[]): number {
  let area = 0;
  for (const r of plates) {
    const dx = Math.min(s.x + w, r.right) - Math.max(s.x, r.left);
    const dy = Math.min(s.y + h, r.bottom) - Math.max(s.y, r.top);
    if (dx > 0 && dy > 0) area += dx * dy;
  }
  return area;
}

/**
 * The card's spot for a pointer at (px, py): the first of the four spots that lies in the window and clear of every HUD
 * plate (the quick bar, the hint bar, the palette ...), else the one that covers the least of them. A card that fits
 * nowhere is pushed into the window at its usual spot. It never takes the pointer, so this is about being read, not
 * about being clicked through (the card used to sit on the hint bar and the quick bar).
 */
export function placeCard(px: number, py: number, w: number, h: number, vw: number, vh: number, plates: readonly Rect[]): CardSpot {
  const fits = around(px, py, w, h).filter((s) => inside(s, w, h, vw, vh));
  let best: CardSpot | undefined;
  let least = Infinity;
  for (const s of fits) {
    const area = covered(s, w, h, plates);
    if (area === 0) return s;
    if (area < least) {
      least = area;
      best = s;
    }
  }
  if (best) return best;
  const usual = around(px, py, w, h)[0] as CardSpot;
  return { x: Math.max(MARGIN, Math.min(usual.x, vw - MARGIN - w)), y: Math.max(MARGIN, Math.min(usual.y, vh - MARGIN - h)) };
}
