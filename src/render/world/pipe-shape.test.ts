import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { beltLine, placeNow, testWorld } from '../../sim/dev';
import { netOfMember } from '../../sim/liquids';
import type { Dir } from '../../sim/state';
import { ARM_E, ARM_N, ARM_S, ARM_W, flowReversed, PIPE_SHAPES, pipeArms, pipeGeometry, pipeShape } from './pipe-shape';

const near = (a: readonly number[], b: readonly number[]): boolean => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < 1e-9;

describe('pipeShape', () => {
  it('draws no arm or one arm as the straight of its axis', () => {
    expect(PIPE_SHAPES[pipeShape(0, 0)]).toBe(ARM_E | ARM_W);
    expect(PIPE_SHAPES[pipeShape(0, 3)]).toBe(ARM_N | ARM_S);
    expect(PIPE_SHAPES[pipeShape(ARM_E, 1)]).toBe(ARM_E | ARM_W);
    expect(PIPE_SHAPES[pipeShape(ARM_N, 0)]).toBe(ARM_N | ARM_S);
  });

  it('keeps straights, bends, tees and the cross as they are, and every mask lands on a shape', () => {
    for (const m of PIPE_SHAPES) expect(PIPE_SHAPES[pipeShape(m, 0)]).toBe(m);
    for (let m = 0; m < 16; m++) for (const rot of [0, 1, 2, 3] as Dir[]) expect(pipeShape(m, rot)).toBeGreaterThanOrEqual(0);
  });
});

describe('pipeGeometry', () => {
  it('runs a straight edge to edge and a bend as a quarter circle between the middles of its two edges', () => {
    const east = pipeGeometry(0);
    expect(near(east.main[0]!, [-0.5, 0])).toBe(true);
    expect(near(east.main.at(-1)!, [0.5, 0])).toBe(true);
    const bend = pipeGeometry(PIPE_SHAPES.indexOf(ARM_E | ARM_S));
    expect(near(bend.main[0]!, [0.5, 0])).toBe(true);
    expect(near(bend.main.at(-1)!, [0, 0.5])).toBe(true);
    // round, not a mitre: the middle of the arc is nearer the tile corner's circle than a straight cut would be
    const mid = bend.main[Math.floor(bend.main.length / 2)]!;
    expect(Math.hypot(mid[0] - 0.5, mid[1] - 0.5)).toBeCloseTo(0.5, 5);
  });

  it('gives a tee one branch to the middle and a cross two, all of them inside the tile', () => {
    const tee = pipeGeometry(PIPE_SHAPES.indexOf(ARM_E | ARM_S | ARM_W));
    expect(tee.stubs).toHaveLength(1);
    expect(near(tee.stubs[0]![0]!, [0, 0.5])).toBe(true);
    expect(near(tee.stubs[0]!.at(-1)!, [0, 0])).toBe(true);
    const cross = pipeGeometry(PIPE_SHAPES.indexOf(ARM_E | ARM_S | ARM_W | ARM_N));
    expect(cross.stubs).toHaveLength(2);
    for (let i = 0; i < PIPE_SHAPES.length; i++) {
      const g = pipeGeometry(i);
      for (const p of [...g.main, ...g.stubs.flat()]) expect(Math.max(Math.abs(p[0]), Math.abs(p[1]))).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(g.arms.reduce<number>((m, d) => m | (1 << d), 0)).toBe(PIPE_SHAPES[i]);
    }
  });

  it('flows against its canonical direction when the pipe heads to the arm the flow starts at', () => {
    const eastWest = pipeShape(ARM_E | ARM_W, 0);
    expect(flowReversed(eastWest, 0)).toBe(false);
    expect(flowReversed(eastWest, 2)).toBe(true);
    const northSouth = pipeShape(ARM_N | ARM_S, 1);
    expect(flowReversed(northSouth, 1)).toBe(false);
    expect(flowReversed(northSouth, 3)).toBe(true);
  });
});

describe('pipeArms', () => {
  it('joins a conduit to its neighbours along its axis only', () => {
    const w = testWorld(content);
    const line = beltLine(w, 5, 10, 0, 3, 'conduit');
    expect(pipeArms(w, line[0]!)).toBe(ARM_E);
    expect(pipeArms(w, line[1]!)).toBe(ARM_E | ARM_W);
    expect(pipeArms(w, line[2]!)).toBe(ARM_W);
    expect(pipeArms(w, placeNow(w, 'conduit', 20, 20, 1))).toBe(0);
  });

  it('joins a conduit to the liquid members it points at, not to one beside it or to a belt', () => {
    const w = testWorld(content);
    const pipe = placeNow(w, 'conduit', 10, 10, 0);
    placeNow(w, 'tank', 11, 9);
    placeNow(w, 'conveyor', 10, 9, 0);
    placeNow(w, 'tank', 8, 11);
    expect(pipeArms(w, pipe)).toBe(ARM_E);
  });

  it('keeps parallel conduits apart and shows a bend or tee only where the liquid networks are one', () => {
    const w = testWorld(content);
    const upper = beltLine(w, 5, 10, 0, 3, 'conduit');
    const lower = beltLine(w, 5, 11, 0, 3, 'conduit');
    expect(pipeArms(w, upper[1]!)).toBe(ARM_E | ARM_W);
    expect(pipeArms(w, lower[1]!)).toBe(ARM_E | ARM_W);
    // a conduit that turns south, with the end of the upper line pointing into its side: the networks join
    const corner = placeNow(w, 'conduit', 8, 10, 1);
    expect(netOfMember(w, corner)).toBe(netOfMember(w, upper[2]!));
    expect(pipeArms(w, corner) & ARM_W).not.toBe(0);
    // the lower line starts right below the corner and runs east: still its own pipe
    expect(pipeArms(w, lower[2]!) & ARM_N).toBe(0);
  });

  it('draws an L-line as a bend and a T as a tee, with the arms where the liquid really joins', () => {
    const w = testWorld(content);
    const east = beltLine(w, 5, 10, 0, 3, 'conduit');
    const south = beltLine(w, 8, 10, 1, 3, 'conduit'); // the corner (8, 10) turns south
    expect(PIPE_SHAPES[pipeShape(pipeArms(w, east[2]!), east[2]!.rot)]).toBe(ARM_E | ARM_W);
    expect(PIPE_SHAPES[pipeShape(pipeArms(w, south[0]!), south[0]!.rot)]).toBe(ARM_W | ARM_S);
    expect(PIPE_SHAPES[pipeShape(pipeArms(w, south[1]!), south[1]!.rot)]).toBe(ARM_N | ARM_S);
    // a branch from the north that ends at (6, 9) points into the side of (6, 10): a tee
    placeNow(w, 'conduit', 6, 8, 1);
    placeNow(w, 'conduit', 6, 9, 1);
    expect(PIPE_SHAPES[pipeShape(pipeArms(w, east[1]!), east[1]!.rot)]).toBe(ARM_E | ARM_W | ARM_N);
  });
});
