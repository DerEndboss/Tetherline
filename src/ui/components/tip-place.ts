/** Where the kit tooltip goes (pure, see TipLayer.tsx): next to its anchor, inside the screen, arrow on the anchor. */
export type TipSide = 'top' | 'bottom' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TipPlace {
  x: number;
  y: number;
  side: TipSide;
  /** Arrow position along the tip's edge, px from its left (top/bottom) or top (left/right). */
  arrow: number;
}

const GAP = 10;
const MARGIN = 8;
const ARROW_INSET = 14;

const OPPOSITE: Record<TipSide, TipSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Room on one side of the anchor for a tip of this size. */
function fits(side: TipSide, a: Box, w: number, h: number, vw: number, vh: number): boolean {
  if (side === 'top') return a.top - GAP - h >= MARGIN;
  if (side === 'bottom') return a.top + a.height + GAP + h <= vh - MARGIN;
  if (side === 'left') return a.left - GAP - w >= MARGIN;
  return a.left + a.width + GAP + w <= vw - MARGIN;
}

/** Wanted side first, then its opposite, then the others; the wanted one when none has room. */
export function pickSide(want: TipSide, a: Box, w: number, h: number, vw: number, vh: number): TipSide {
  const order: TipSide[] = [want, OPPOSITE[want], ...(['top', 'bottom', 'right', 'left'] as const).filter((s) => s !== want && s !== OPPOSITE[want])];
  return order.find((s) => fits(s, a, w, h, vw, vh)) ?? want;
}

function along(center: number, size: number, limit: number): { pos: number; arrow: number } {
  const pos = clamp(center - size / 2, MARGIN, Math.max(MARGIN, limit - MARGIN - size));
  return { pos, arrow: clamp(center - pos, ARROW_INSET, Math.max(ARROW_INSET, size - ARROW_INSET)) };
}

export function placeTip(want: TipSide, a: Box, w: number, h: number, vw: number, vh: number): TipPlace {
  const side = pickSide(want, a, w, h, vw, vh);
  if (side === 'top' || side === 'bottom') {
    const { pos, arrow } = along(a.left + a.width / 2, w, vw);
    const y = side === 'top' ? a.top - GAP - h : a.top + a.height + GAP;
    return { x: pos, y: clamp(y, MARGIN, Math.max(MARGIN, vh - MARGIN - h)), side, arrow };
  }
  const { pos, arrow } = along(a.top + a.height / 2, h, vh);
  const x = side === 'left' ? a.left - GAP - w : a.left + a.width + GAP;
  return { x: clamp(x, MARGIN, Math.max(MARGIN, vw - MARGIN - w)), y: pos, side, arrow };
}
