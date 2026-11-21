import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { beltLine, paint, placeNow, testWorld } from './dev';
import { netOfMember } from './liquids';
import { step } from './tick';
import type { World } from './world';

const OIL = content.liquids.indexOf('oil');

/** An oil pump at (2, 10) with a conduit line running east from it. */
function pumpWorld(): { w: World; line: ReturnType<typeof beltLine> } {
  const w = testWorld(content);
  paint(w, 'oil', 2, 10, 1, 1);
  placeNow(w, 'mechanical-pump', 2, 10);
  return { w, line: beltLine(w, 3, 10, 0, 5, 'conduit') };
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < seconds * 20; i++) step(w);
}

describe('conduit bends and tees', () => {
  it('an L-line is one pipe: the liquid goes round the corner into the second leg', () => {
    const { w, line } = pumpWorld();
    // the second leg starts at the east end of the first and runs south; its first tile is the corner
    const leg = beltLine(w, 8, 10, 1, 4, 'conduit');
    expect(netOfMember(w, leg[0]!)).toBe(netOfMember(w, line[4]!));
    expect(netOfMember(w, leg[3]!)).toBe(netOfMember(w, line[0]!));
    run(w, 12);
    for (const b of [...line, ...leg]) expect(b.liquidId, `conduit at ${b.x},${b.y}`).toBe(OIL);
    expect(leg[3]!.liquid).toBeGreaterThan(1);
  });

  it('a T is one pipe: a branch pointing into the side of a line takes liquid from it and gives to it', () => {
    const { w, line } = pumpWorld();
    // the stem runs north from (5, 13) to (5, 11), so its end points into the side of (5, 10)
    const stem = [13, 12, 11].map((y) => placeNow(w, 'conduit', 5, y, 3));
    expect(netOfMember(w, stem[0]!)).toBe(netOfMember(w, line[2]!));
    run(w, 12);
    for (const b of stem) expect(b.liquidId).toBe(OIL);
  });

  it('a parallel line or a conduit that points away stays apart', () => {
    const { w, line } = pumpWorld();
    const beside = beltLine(w, 3, 11, 0, 5, 'conduit'); // parallel, same heading: not a join
    expect(netOfMember(w, beside[2]!)).not.toBe(netOfMember(w, line[2]!));
    // a conduit that points away from the line is not joined either
    const away = placeNow(w, 'conduit', 5, 9, 3);
    expect(netOfMember(w, away)).not.toBe(netOfMember(w, line[2]!));
  });

  it('a tank joins a conduit at its front or back, not at its side', () => {
    const front = testWorld(content);
    const pipe = placeNow(front, 'conduit', 10, 10, 0);
    expect(netOfMember(front, placeNow(front, 'tank', 11, 9))).toBe(netOfMember(front, pipe));
    const side = testWorld(content);
    const lone = placeNow(side, 'conduit', 10, 10, 0);
    expect(netOfMember(side, placeNow(side, 'tank', 9, 7))).not.toBe(netOfMember(side, lone));
  });
});
