import { describe, expect, it } from 'vitest';
import { MARGIN, OFFSET, placeCard, type Rect } from './hover-place';

const VW = 1440;
const VH = 900;
const W = 200;
const H = 100;
const box = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });

describe('placeCard', () => {
  it('goes right below the pointer when nothing is in the way', () => {
    expect(placeCard(500, 400, W, H, VW, VH, [])).toEqual({ x: 500 + OFFSET, y: 400 + OFFSET });
  });

  it('flips to the left and above at the window edges', () => {
    expect(placeCard(1400, 400, W, H, VW, VH, []).x).toBe(1400 - OFFSET - W);
    expect(placeCard(500, 880, W, H, VW, VH, []).y).toBe(880 - OFFSET - H);
  });

  it('keeps off the hint bar and the quick bar at the bottom left', () => {
    const bar = box(0, 790, 460, 100);
    const spot = placeCard(100, 700, W, H, VW, VH, [bar]);
    expect(spot.y + H).toBeLessThanOrEqual(790); // above the bar, not on it
    expect(spot.x).toBeGreaterThanOrEqual(MARGIN);
  });

  it('takes the spot that covers least when every one touches a plate', () => {
    const wall = box(0, 0, VW, VH);
    const small = box(0, 0, 50, 50);
    expect(placeCard(500, 400, W, H, VW, VH, [wall])).toEqual({ x: 500 + OFFSET, y: 400 + OFFSET });
    expect(placeCard(30, 30, W, H, VW, VH, [small])).toEqual({ x: 30 + OFFSET, y: 30 + OFFSET }); // right below clears the small plate
  });

  it('a card that fits nowhere is pushed into the window', () => {
    const spot = placeCard(100, 100, 2000, 2000, VW, VH, []);
    expect(spot.x).toBe(MARGIN);
    expect(spot.y).toBe(MARGIN);
  });
});
