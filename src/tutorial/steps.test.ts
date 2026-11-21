import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { beltLine, paint, placeNow, testWorld } from '../sim/dev';
import { touches } from '../sim/grid';
import { run } from '../sim/tick';
import { isLate, reach } from './progress';
import { firstOpen, poweredFromCore, smeltersAtIron, STEPS, theSmelter, type StepContext } from './steps';
import { TutorialStore } from './store';

function field() {
  const w = testWorld(content, 60, 60);
  placeNow(w, 'core-shard', 28, 28);
  paint(w, 'ore-copper', 40, 26, 6, 6);
  paint(w, 'ore-iron', 26, 40, 5, 5);
  return w;
}

const ctx = (w: ReturnType<typeof field>, copied = false): StepContext => ({ world: w, copied });
const open = (w: ReturnType<typeof field>, copied = false): string => STEPS[firstOpen(ctx(w, copied))]?.id ?? 'end';

describe('the tutorial steps', () => {
  it('asks for what the brief lists, in order', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['copper-drill', 'copper-belt', 'iron-drill', 'smelter', 'iron-belt', 'power', 'unloader', 'blueprint']);
  });

  it('every building a step points at exists and is there from the start', () => {
    for (const s of STEPS) {
      if (!s.pick) continue;
      expect(content.buildings.find(s.pick)?.unlock, s.id).toBe('start');
    }
  });

  it('walks from an empty map to the copied blueprint', () => {
    const w = field();
    expect(open(w)).toBe('copper-drill');
    expect(STEPS[0]!.spots(ctx(w))[0]).toBeDefined();

    placeNow(w, 'mechanical-drill', 41, 27);
    expect(open(w)).toBe('copper-belt');
    expect(STEPS[1]!.spots(ctx(w)).map((s) => s.label)).toEqual(['Drill', 'Core']);

    w.state.stats.delivered[content.materials.indexOf('copper-ore')] = 2;
    expect(open(w)).toBe('iron-drill');
    const ironSpot = STEPS[2]!.spots(ctx(w))[0]!;
    expect(w.state.map.floor[ironSpot.y * 60 + ironSpot.x]).toBe(content.floors.indexOf('ore-iron') + 1);

    placeNow(w, 'mechanical-drill', ironSpot.x, ironSpot.y);
    expect(open(w)).toBe('smelter');
    const smelterSpot = STEPS[3]!.spots(ctx(w))[0]!;
    expect(smelterSpot.label).toBe('Smelter here');

    placeNow(w, 'smelter', smelterSpot.x, smelterSpot.y);
    expect(smeltersAtIron(w)).toHaveLength(1);
    expect(open(w)).toBe('iron-belt');

    w.state.stats.delivered[content.materials.indexOf('iron-bar')] = 1;
    expect(open(w)).toBe('power');
    const powerSpot = STEPS[5]!.spots(ctx(w))[0]!;
    expect(powerSpot.label).toBe('Powered here');
    const mill = placeNow(w, 'wire-mill', powerSpot.x, powerSpot.y);
    expect(poweredFromCore(w)).toHaveLength(1);
    expect(open(w)).toBe('unloader');

    // the unloader goes where it touches both the core and the mill
    const unloaderSpot = STEPS[6]!.spots(ctx(w))[0]!;
    expect(unloaderSpot.label).toBe('Unloader here');
    expect(touches({ x: unloaderSpot.x, y: unloaderSpot.y, size: 1 }, w.rect(w.core!))).toBe(true);
    expect(touches({ x: unloaderSpot.x, y: unloaderSpot.y, size: 1 }, w.rect(mill))).toBe(true);
    placeNow(w, 'unloader', unloaderSpot.x, unloaderSpot.y);
    expect(open(w)).toBe('unloader'); // standing is not enough: the wire has to arrive
    w.state.stock[content.materials.indexOf('copper-ore')] = 200;
    run(w, 20 * 15);
    expect(w.state.stats.delivered[content.materials.indexOf('copper-wire')]).toBeGreaterThan(0);
    expect(open(w)).toBe('blueprint');
    expect(STEPS[7]!.spots(ctx(w))[0]).toMatchObject({ label: 'Copy this' });

    expect(open(w, true)).toBe('end');
  });

  it('any finished smelter ends the smelter step (the autopilot builds its own way); the later steps prefer the one on iron', () => {
    const w = field();
    placeNow(w, 'mechanical-drill', 27, 41);
    expect(open(w)).toBe('copper-drill');
    placeNow(w, 'mechanical-drill', 41, 27);
    placeNow(w, 'mechanical-drill', 27, 40);
    placeNow(w, 'smelter', 10, 10);
    expect(smeltersAtIron(w)).toHaveLength(0);
    expect(theSmelter(w)).toBeDefined();
    expect(STEPS[3]!.done(ctx(w))).toBe(true);
    const beside = placeNow(w, 'smelter', 29, 40);
    expect(smeltersAtIron(w)).toEqual([beside]);
    expect(theSmelter(w)).toBe(beside);
  });

  it('a wire mill away from the core is not powered', () => {
    const w = field();
    placeNow(w, 'wire-mill', 10, 20);
    expect(poweredFromCore(w)).toHaveLength(0);
  });

  it('a drill on iron does not count as a copper drill and the other way round', () => {
    const w = field();
    placeNow(w, 'mechanical-drill', 27, 41);
    expect(open(w)).toBe('copper-drill');
  });

  it('notices a ghost or a site the drone has for the step, and only one that would mine the right ore', () => {
    const w = field();
    const drill = content.buildings.indexOf('mechanical-drill');
    expect(STEPS[0]!.queued(ctx(w))).toBe(false);
    w.state.plans.push({ kind: drill, x: 10, y: 10, rot: 0, config: -1 }); // on bare ground
    expect(STEPS[0]!.queued(ctx(w))).toBe(false);
    w.state.plans.push({ kind: drill, x: 41, y: 27, rot: 0, config: -1 });
    expect(STEPS[0]!.queued(ctx(w))).toBe(true);
    expect(STEPS[2]!.queued(ctx(w))).toBe(false); // a copper ghost is not an iron one
  });

  it('the ring does not hop to the next patch once the drone has the ghost', () => {
    const w = field();
    const before = STEPS[0]!.spots(ctx(w))[0]!;
    w.state.plans.push({ kind: content.buildings.indexOf('mechanical-drill'), x: before.x, y: before.y, rot: 0, config: -1 });
    expect(STEPS[0]!.spots(ctx(w))).toEqual([]);
    w.state.plans.length = 0;
    expect(STEPS[0]!.spots(ctx(w))[0]).toEqual(before);
  });

  it('every spot step hides its ring while its ghost is queued', () => {
    const w = field();
    placeNow(w, 'mechanical-drill', 41, 27);
    w.state.stats.delivered[content.materials.indexOf('copper-ore')] = 2;
    placeNow(w, 'mechanical-drill', 26, 41);
    const smelterSpot = STEPS[3]!.spots(ctx(w))[0]!;
    expect(smelterSpot).toBeDefined();
    w.state.plans.push({ kind: content.buildings.indexOf('smelter'), x: smelterSpot.x, y: smelterSpot.y, rot: 0, config: -1 });
    expect(STEPS[3]!.spots(ctx(w))).toEqual([]);
  });

  it('copper really delivered by a drill and a belt ends step two', () => {
    const w = field();
    placeNow(w, 'mechanical-drill', 41, 27);
    beltLine(w, 40, 28, 2, 10);
    run(w, 20 * 30);
    expect(w.state.stats.delivered[content.materials.indexOf('copper-ore')]).toBeGreaterThan(0);
    expect(open(w)).toBe('iron-drill');
  });
});

describe('progress', () => {
  it('never goes back to an earlier step once a later one was reached', () => {
    const w = field();
    expect(reach(w, 0)).toBe(0);
    expect(reach(w, 3)).toBe(3);
    expect(reach(w, 1)).toBe(3);
    expect(reach(field(), 1)).toBe(1); // another run starts over
  });

  it('a run older than the guide window ends it silently', () => {
    const w = field();
    expect(isLate(w)).toBe(false);
    w.state.tick = 20 * 60 * 16;
    expect(isLate(w)).toBe(true);
  });
});

describe('the store', () => {
  const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('is open at first, done after finish, and remembers it for the next page load', () => {
    const storage = memory();
    const a = new TutorialStore(() => storage);
    let calls = 0;
    a.subscribe(() => calls++);
    expect(a.isDone()).toBe(false);
    a.finish();
    a.finish();
    expect(a.isDone()).toBe(true);
    expect(calls).toBe(1);
    expect(new TutorialStore(() => storage).isDone()).toBe(true);
  });

  it('works without storage (blocked or missing): done for this page load only', () => {
    const a = new TutorialStore(() => null);
    a.finish();
    expect(a.isDone()).toBe(true);
    const broken = new TutorialStore(() => {
      throw new Error('blocked');
    });
    expect(broken.isDone()).toBe(false);
  });
});
