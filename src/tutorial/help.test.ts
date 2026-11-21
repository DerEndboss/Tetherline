import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { beltLine, paint, placeNow, testWorld } from '../sim/dev';
import { beltHelp, lostUnloader, starvedSmelter } from './help';
import { drillsOn, smeltersAtIron } from './steps';

/** A 60x60 flat map, the core at (28, 28), a copper field to the east: the drill stands at (41, 27), the core's east edge is at x = 31. */
function field() {
  const w = testWorld(content, 60, 60);
  placeNow(w, 'core-shard', 28, 28);
  paint(w, 'ore-copper', 40, 26, 6, 6);
  paint(w, 'ore-iron', 26, 40, 5, 5);
  const drill = placeNow(w, 'mechanical-drill', 41, 27);
  const core = w.rect(w.core!);
  return { w, drill, core, east: core.x + core.size };
}

describe('help for the belt to the core', () => {
  it('stays quiet while the belt reaches the core, and while nothing is laid yet', () => {
    const { w, drill, east } = field();
    expect(beltHelp(w, drill, 'drill')).toBeNull();
    beltLine(w, 40, 28, 2, 40 - east + 1);
    expect(beltHelp(w, drill, 'drill')).toBeNull();
  });

  it('a belt that ends beside the core without pointing in: press R on its last piece', () => {
    const { w, drill, east } = field();
    beltLine(w, 40, 28, 2, 40 - east); // down to x = east + 1
    placeNow(w, 'conveyor', east, 28, 1); // touches the core, runs along its edge
    const help = beltHelp(w, drill, 'drill')!;
    expect(help.fault).toBe('beside-core');
    expect(help.spot).toMatchObject({ x: east, y: 28, w: 1, h: 1 });
    expect(help.text).toMatch(/press R/i);
  });

  it('a belt that stops in the open says so and marks its end', () => {
    const { w, drill } = field();
    beltLine(w, 40, 28, 2, 5);
    const help = beltHelp(w, drill, 'drill')!;
    expect(help.fault).toBe('short');
    expect(help.spot).toMatchObject({ x: 36, y: 28 });
  });

  it('turning the last piece mends it', () => {
    const { w, drill, east } = field();
    beltLine(w, 40, 28, 2, 40 - east);
    const last = placeNow(w, 'conveyor', east, 28, 1);
    expect(beltHelp(w, drill, 'drill')?.fault).toBe('beside-core');
    last.rot = 2;
    expect(beltHelp(w, drill, 'drill')).toBeNull();
  });

  it('a belt that runs into a building that takes nothing, or into a belt that faces it, is blocked', () => {
    const { w, drill } = field();
    placeNow(w, 'mechanical-drill', 36, 27); // another drill, in the way
    beltLine(w, 40, 28, 2, 4); // 40..37, faces the drill at x = 36
    expect(beltHelp(w, drill, 'drill')).toMatchObject({ fault: 'blocked', spot: { x: 37, y: 28 } });
    expect(beltHelp(w, drill, 'drill')?.text).toContain('Mechanical Drill');

    const other = field();
    beltLine(other.w, 40, 28, 2, 2); // 40, 39 facing west
    placeNow(other.w, 'conveyor', 38, 28, 0); // faces back east
    expect(beltHelp(other.w, other.drill, 'drill')?.fault).toBe('blocked');
  });

  it('waits while the drone still has belts to build', () => {
    const { w, drill } = field();
    beltLine(w, 40, 28, 2, 5);
    w.state.plans.push({ kind: content.buildings.indexOf('conveyor'), x: 35, y: 28, rot: 2, config: -1 });
    expect(beltHelp(w, drill, 'drill')).toBeNull();
    w.state.plans.length = 0;
    expect(beltHelp(w, drill, 'drill')?.fault).toBe('short');
  });

  it('belts that do not touch the drill, or point at it, get their own words', () => {
    const { w, drill } = field();
    beltLine(w, 20, 10, 0, 5); // somewhere else
    expect(beltHelp(w, drill, 'drill')).toMatchObject({ fault: 'detached', spot: { x: 41, y: 27, w: 2, h: 2 } });

    const back = field();
    placeNow(back.w, 'conveyor', 40, 28, 0); // touches the drill and faces it
    expect(beltHelp(back.w, back.drill, 'drill')?.fault).toBe('backwards');
  });

  it('says nothing when there is no source yet', () => {
    const { w } = field();
    expect(beltHelp(w, undefined, 'drill')).toBeNull();
  });

  it('is the same fault with the same key while nothing changes, a different one when the end moves', () => {
    const { w, drill } = field();
    beltLine(w, 40, 28, 2, 5);
    const a = beltHelp(w, drill, 'drill')!;
    expect(beltHelp(w, drill, 'drill')!.key).toBe(a.key);
    placeNow(w, 'conveyor', 35, 28, 2);
    expect(beltHelp(w, drill, 'drill')!.key).not.toBe(a.key);
  });
});

describe('help for the iron smelter and the unloader', () => {
  it('a smelter that touches no iron drill and has no belt in is starved', () => {
    const { w } = field();
    placeNow(w, 'mechanical-drill', 27, 41);
    const far = placeNow(w, 'smelter', 10, 10);
    expect(starvedSmelter(w, far, drillsOn(w, 'iron-ore'))).toMatchObject({ fault: 'unfed', spot: { x: 10, y: 10, w: 2, h: 2 } });
    const beside = placeNow(w, 'smelter', 29, 40);
    expect(smeltersAtIron(w)).toEqual([beside]);
    expect(starvedSmelter(w, beside, drillsOn(w, 'iron-ore'))).toBeNull();
  });

  it('a belt that leads into the smelter feeds it', () => {
    const { w } = field();
    const far = placeNow(w, 'smelter', 10, 10);
    placeNow(w, 'conveyor', 12, 10, 2); // touches the smelter's east side, faces it
    expect(starvedSmelter(w, far, [])).toBeNull();
  });

  it('an unloader that touches only the core, or only the mill, is misplaced', () => {
    const { w, core } = field();
    const mill = placeNow(w, 'wire-mill', core.x + core.size, core.y);
    const lonely = placeNow(w, 'unloader', core.x - 1, core.y);
    expect(lostUnloader(w, [lonely], [mill])).toMatchObject({ fault: 'misplaced', spot: { x: core.x - 1, y: core.y } });
    const good = placeNow(w, 'unloader', core.x + core.size, core.y + 2); // under the mill, against the core
    expect(lostUnloader(w, [lonely, good], [mill])).toBeNull();
    expect(lostUnloader(w, [], [mill])).toBeNull();
  });
});
