import { describe, expect, it } from 'vitest';
import { placeTip } from './tip-place';

const VW = 1440;
const VH = 900;

describe('placeTip', () => {
  it('sits centred above its anchor with the arrow on the anchor', () => {
    const p = placeTip('top', { left: 700, top: 400, width: 40, height: 40 }, 100, 30, VW, VH);
    expect(p.side).toBe('top');
    expect(p.x).toBe(670);
    expect(p.y).toBe(400 - 10 - 30);
    expect(p.arrow).toBe(50);
  });

  it('flips below when the top edge has no room', () => {
    const p = placeTip('top', { left: 700, top: 12, width: 48, height: 48 }, 120, 30, VW, VH);
    expect(p.side).toBe('bottom');
    expect(p.y).toBe(12 + 48 + 10);
  });

  it('stays inside the screen at the right edge and keeps the arrow on the anchor', () => {
    const p = placeTip('top', { left: 1400, top: 400, width: 32, height: 32 }, 200, 30, VW, VH);
    expect(p.x + 200).toBeLessThanOrEqual(VW - 8);
    expect(p.x + p.arrow).toBeCloseTo(1416, 0);
  });

  it('places beside an anchor on request', () => {
    const p = placeTip('right', { left: 10, top: 300, width: 50, height: 50 }, 150, 40, VW, VH);
    expect(p.side).toBe('right');
    expect(p.x).toBe(70);
    expect(p.arrow).toBe(20);
  });
});
