import { describe, expect, it } from 'vitest';
import { markerStyles } from './Markers';
import { clearOf, freePoint, place, type Cover } from './view';

const INSET = { left: 48, top: 56, right: 48, bottom: 48 };
const vp = { w: 1440, h: 900 };

describe('marker styles', () => {
  it('puts a visible spot at its own place with a ring a little bigger than its box', () => {
    const box = { cx: 700, cy: 400, w: 200, h: 100 };
    const st = markerStyles(box, place(box, vp.w, vp.h, INSET));
    expect(st.pos).toBe('700px 400px');
    expect(st.off).toBe('false');
    expect(st.w).toBe('210px');
    expect(st.h).toBe('105px');
  });

  it('is the same string for the same box, so a steady camera writes nothing', () => {
    const box = { cx: 700.2, cy: 400.1, w: 200.1, h: 100.2 };
    const a = markerStyles(box, place(box, vp.w, vp.h, INSET));
    const b = markerStyles({ ...box, cx: 700.24 }, place({ ...box, cx: 700.24 }, vp.w, vp.h, INSET));
    expect(b).toEqual(a);
  });

  it('turns the arrow toward a spot that is off screen and sits on the edge', () => {
    const box = { cx: 3000, cy: 450, w: 40, h: 20 };
    const at = place(box, vp.w, vp.h, INSET);
    const st = markerStyles(box, at);
    expect(st.off).toBe('true');
    expect(st.pos).toBe(`${vp.w - INSET.right}px 450px`);
    expect(st.pin).toContain('rotate(-90deg)');
  });

  it('never makes a tiny ring smaller than its minimum', () => {
    const box = { cx: 500, cy: 500, w: 4, h: 2 };
    const st = markerStyles(box, place(box, vp.w, vp.h, INSET));
    expect(st.w).toBe('40px');
    expect(st.h).toBe('24px');
  });
});

describe('markers that are off screen keep out from under the HUD', () => {
  const palette: Cover = { left: 990, top: 560, right: 1430, bottom: 890 }; // bottom right, as on a desktop
  const card: Cover = { left: 510, top: 12, right: 930, bottom: 250 }; // the tutorial card, top centre

  it('stays where it is when nothing covers the spot', () => {
    expect(clearOf({ x: 100, y: 300 }, [palette, card], vp.w, vp.h)).toEqual({ x: 100, y: 300 });
  });

  it('slides along its edge past a panel: on the right edge it goes up above the palette', () => {
    const at = clearOf({ x: vp.w - INSET.right, y: 700 }, [palette, card], vp.w, vp.h);
    expect(at.x).toBe(vp.w - INSET.right);
    expect(at.y).toBeLessThan(palette.top);
  });

  it('on the top edge it goes sideways past the card, and a marker below the card stays on the same side', () => {
    const at = clearOf({ x: 700, y: INSET.top }, [palette, card], vp.w, vp.h);
    expect(at.y).toBe(INSET.top);
    expect(at.x < card.left || at.x > card.right).toBe(true);
  });

  it('place() uses the covers only for a marker that is off screen', () => {
    const near = { cx: 700, cy: 600, w: 100, h: 50 };
    expect(place(near, vp.w, vp.h, INSET, [{ left: 600, top: 500, right: 800, bottom: 700 }]).x).toBe(700); // on screen: its own place
    const far = { cx: 5000, cy: 800, w: 40, h: 20 };
    const at = place(far, vp.w, vp.h, INSET, [palette]);
    expect(at.off).toBe(true);
    expect(at.y).toBeLessThan(palette.top);
    expect(at.angle).toBeGreaterThan(0); // the arrow still points down and right toward the spot
  });

  it('gives the point back when no free place exists', () => {
    const wall: Cover = { left: 0, top: 0, right: vp.w, bottom: vp.h };
    expect(clearOf({ x: 300, y: 300 }, [wall], vp.w, vp.h)).toEqual({ x: 300, y: 300 });
  });
});

describe('where the camera puts what it shows', () => {
  it('the middle of the screen while nothing covers it', () => {
    const p = freePoint(vp.w, vp.h, [])!;
    expect(Math.abs(p.x - vp.w / 2)).toBeLessThanOrEqual(24);
    expect(Math.abs(p.y - vp.h / 2)).toBeLessThanOrEqual(24);
  });

  it('a free strip beside a card that lies across the middle of a phone on its side', () => {
    const w = 844;
    const h = 390;
    const card: Cover = { left: 8, top: 68, right: 468, bottom: 240 };
    const palette: Cover = { left: 500, top: 168, right: 836, bottom: 382 };
    const p = freePoint(w, h, [card, palette])!;
    expect(p).not.toBeNull();
    for (const c of [card, palette]) expect(p.x < c.left || p.x > c.right || p.y < c.top || p.y > c.bottom).toBe(true);
  });

  it('null when the whole screen is covered', () => {
    expect(freePoint(400, 300, [{ left: 0, top: 0, right: 400, bottom: 300 }])).toBeNull();
  });
});
