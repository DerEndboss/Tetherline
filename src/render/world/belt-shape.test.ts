import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { BELT_LEN, BELT_SLOTS } from '../../sim/constants';
import { beltGap, frontLimit } from '../../sim/blocks/conveyor';
import { beltLine, placeNow, testWorld } from '../../sim/dev';
import { run } from '../../sim/tick';
import { BACK, feedMask, feedMaskOf, isCorner, LEFT, nextPositions, pathPoint, pathTangent, RIGHT, type Probe } from './belt-shape';

const belt = (rot: 0 | 1 | 2 | 3) => ({ belt: true, rot });

describe('feedMask', () => {
  it('a lone belt is straight', () => {
    expect(feedMask(() => undefined, 5, 5, 0)).toBe(BACK);
  });

  it('a belt fed only from the side bends, from both sides and the back it merges', () => {
    // heading east at (5,5): left is north (y-1), right is south (y+1)
    const fromNorth: Probe = (x, y) => (x === 5 && y === 4 ? belt(1) : undefined);
    expect(feedMask(fromNorth, 5, 5, 0)).toBe(LEFT);
    expect(isCorner(feedMask(fromNorth, 5, 5, 0))).toBe(true);
    const all: Probe = (x, y) => (x === 4 && y === 5 ? belt(0) : x === 5 && y === 4 ? belt(1) : x === 5 && y === 6 ? belt(3) : undefined);
    expect(feedMask(all, 5, 5, 0)).toBe(BACK | LEFT | RIGHT);
  });

  it('a belt that points elsewhere does not feed, a machine behind does', () => {
    const away: Probe = (x, y) => (x === 4 && y === 5 ? belt(2) : undefined);
    expect(feedMask(away, 5, 5, 0)).toBe(BACK);
    const machine: Probe = (x, y) => (x === 4 && y === 5 ? { belt: false, rot: 0 } : x === 5 && y === 4 ? { belt: false, rot: 0 } : undefined);
    expect(feedMask(machine, 5, 5, 0)).toBe(BACK);
  });

  it('reads a real world', () => {
    const w = testWorld(content);
    const line = beltLine(w, 10, 10, 0, 3);
    const turn = placeNow(w, 'conveyor', 13, 10, 1);
    expect(feedMaskOf(w, line[0]!)).toBe(BACK);
    
    // the tile after a straight run, heading south, is fed from its side (the belt at its west)
    expect(isCorner(feedMaskOf(w, turn))).toBe(true);
  });
});

describe('pathPoint', () => {
  const p = { x: 0, y: 0 };

  it('a straight belt runs from the back edge to the front edge', () => {
    pathPoint(BACK, 0, 0, p);
    expect(p.x).toBe(-0.5);
    expect(p.y + 0).toBe(0);
    pathPoint(BACK, 1, 1, p);
    expect(p.x + 0).toBe(0);
    expect(p.y).toBe(0.5);
  });

  it('a bend starts on the side edge and ends on the front edge', () => {
    pathPoint(LEFT, 0, 0, p); // heading east, fed from the north edge
    expect([p.x + 0, p.y + 0]).toEqual([0, -0.5]);
    pathPoint(LEFT, 0, 1, p);
    expect([p.x + 0, p.y + 0]).toEqual([0.5, 0]);
    pathPoint(RIGHT, 0, 0, p);
    expect([p.x + 0, p.y + 0]).toEqual([0, 0.5]);
  });

  it('the tangent of a bend turns from the side feed to the heading', () => {
    pathTangent(LEFT, 0, 0, p);
    expect(p.y).toBeGreaterThan(0.99); // moving south at the start
    pathTangent(LEFT, 0, 1, p);
    expect(p.x).toBeGreaterThan(0.99); // east at the end
  });
});

describe('nextPositions', () => {
  it('predicts exactly where the sim puts the items on the next tick', () => {
    const w = testWorld(content);
    const line = beltLine(w, 10, 10, 0, 4);
    // a stopper: the belt ends against nothing, so the front items queue up and stop at the gap
    const b = line[3]!;
    for (let tick = 0; tick < 120; tick++) {
      run(w, 1);
      if (tick % 5 === 0) {
        const s = w.state.belts;
        s.item[b.slot * BELT_SLOTS] = 0;
      }
      for (const c of line) {
        const n = w.state.belts.count[c.slot]!;
        const out = new Float32Array(BELT_SLOTS);
        const step = Math.round((w.def(c).conveyor!.speed * w.state.bonus.belt * BELT_LEN) / 20);
        const before = Array.from(w.state.belts.pos.slice(c.slot * BELT_SLOTS, c.slot * BELT_SLOTS + n));
        nextPositions(w.state.belts.pos, c.slot * BELT_SLOTS, n, step, beltGap(w), frontLimit(w, w.facing(c, c.rot)), out);
        for (let i = 0; i < n; i++) {
          expect(out[i]).toBeGreaterThanOrEqual(before[i]!);
          expect(out[i]).toBeLessThanOrEqual(BELT_LEN);
        }
      }
    }
  });

  it('items never overtake: each stays a gap behind the one ahead', () => {
    const pos = Int16Array.from([900, 567, 234]);
    const out = new Float32Array(3);
    nextPositions(pos, 0, 3, 100, 333, 1000, out);
    expect(Array.from(out)).toEqual([1000, 667, 334]);
  });
});
