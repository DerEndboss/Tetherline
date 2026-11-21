import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { beltLine, paint, placeNow, testWorld } from '../../sim/dev';
import { run } from '../../sim/tick';
import { storageInfo } from '../../sim/storage';
import { buildingFacts, num } from './facts';
import { inspectTile, registerInspector } from './inspect';

function world() {
  const w = testWorld(content);
  placeNow(w, 'core-shard', 20, 20);
  return w;
}

describe('inspectTile', () => {
  it('tells how to cancel a ghost and how to remove a building', () => {
    const w = world();
    w.state.plans.push({ kind: content.buildings.indexOf('container'), x: 8, y: 8, rot: 0, config: -1 });
    placeNow(w, 'smelter', 12, 8);
    expect(inspectTile(w, 8, 8)!.hint).toBe('Right-click or Del to cancel');
    expect(inspectTile(w, 12, 8)!.hint).toBe('Right-click or Del to remove');
    expect(inspectTile(w, 20, 20)!.hint).toBeUndefined();
  });

  it('is null over empty ground and outside the map', () => {
    const w = world();
    expect(inspectTile(w, 3, 3)).toBeNull();
    expect(inspectTile(w, -1, 0)).toBeNull();
  });

  it('describes an ore field with its richness', () => {
    const w = world();
    paint(w, 'ore-copper', 5, 5, 6, 6);
    const hit = inspectTile(w, 6, 6)!;
    expect(hit.kind).toBe('ore');
    expect(hit.title).toBe('Copper Ore');
    expect(hit.lines.some((l) => l.label === 'Patch' && l.value.startsWith('Rich'))).toBe(true);
  });

  it('shows a drill with its rate and what lies on a belt', () => {
    const w = world();
    paint(w, 'ore-copper', 10, 20, 2, 2);
    placeNow(w, 'mechanical-drill', 10, 20);
    beltLine(w, 12, 21, 0, 8);
    run(w, 200);
    const drill = inspectTile(w, 10, 20)!;
    expect(drill.kind).toBe('building');
    expect(drill.lines.find((l) => l.label === 'Rate')?.value).toMatch(/\/min$/);
    const belts = [12, 13, 14, 15, 16, 17, 18, 19].map((x) => inspectTile(w, x, 21)!);
    expect(belts.flatMap((b) => b.stacks).some((s) => s.name === 'Copper Ore')).toBe(true);
  });

  it('warns about a drill with no ore and a machine without power', () => {
    const w = world();
    placeNow(w, 'mechanical-drill', 4, 4);
    expect(inspectTile(w, 4, 4)!.status).toEqual({ text: 'No ore under it', tone: 'bad' });
    const mill = placeNow(w, 'wire-mill', 30, 30);
    expect(inspectTile(w, mill.x, mill.y)!.status?.text).toBe('No power');
  });

  it('lets another part register an inspector first', () => {
    const w = world();
    const off = registerInspector(() => ({ kind: 'deco', title: 'Rack', lines: [], stacks: [], rect: { x: 0, y: 0, w: 1, h: 1 } }));
    expect(inspectTile(w, 3, 3)?.title).toBe('Rack');
    off();
    expect(inspectTile(w, 3, 3)).toBeNull();
  });
});

describe('the status of a belt', () => {
  const statusAt = (w: ReturnType<typeof world>, x: number, y: number) => inspectTile(w, x, y)!.status;

  /** A copper drill with a belt (12..19, 21) running east into the core at (20, 20). */
  function feeding() {
    const w = world();
    paint(w, 'ore-copper', 10, 21, 2, 2);
    placeNow(w, 'mechanical-drill', 10, 21);
    beltLine(w, 12, 21, 0, 8);
    return w;
  }

  it('says Running for a belt that moves things into the core', () => {
    const w = feeding();
    run(w, 400);
    for (const x of [12, 15, 19]) expect(statusAt(w, x, 21)).toEqual({ text: 'Running', tone: 'good' });
  });

  it('says End of line, with the way to fix it, for a belt that points at nothing', () => {
    const w = world();
    beltLine(w, 5, 5, 0, 3);
    const hit = inspectTile(w, 7, 5)!;
    expect(hit.status).toEqual({ text: 'End of line', tone: 'warn' });
    expect(hit.lines.find((l) => l.label === 'Ahead')).toEqual({ label: 'Ahead', value: 'Points at nothing, press R', tone: 'warn' });
    expect(statusAt(w, 5, 5)).toEqual({ text: 'Running', tone: 'good' });
  });

  it('says Blocked for a belt facing a building that takes no items', () => {
    const w = world();
    beltLine(w, 5, 5, 0, 3);
    placeNow(w, 'mechanical-drill', 8, 5);
    const hit = inspectTile(w, 7, 5)!;
    expect(hit.status).toEqual({ text: 'Blocked', tone: 'warn' });
    expect(hit.lines.find((l) => l.label === 'Ahead')?.value).toBe('Mechanical Drill takes no items, press R');
  });

  it('is fine while the next piece is still a queued ghost, and when it faces a belt that takes it', () => {
    const w = world();
    beltLine(w, 5, 5, 0, 3);
    w.state.plans.push({ kind: w.content.buildings.indexOf('conveyor'), x: 8, y: 5, rot: 0, config: -1 });
    expect(statusAt(w, 7, 5)?.text).toBe('Running');
    beltLine(w, 8, 5, 0, 2);
    expect(statusAt(w, 7, 5)?.text).toBe('Running');
    const w2 = world();
    beltLine(w2, 5, 5, 0, 3);
    placeNow(w2, 'conveyor', 8, 5, 2); // a belt that faces the end of the line head-on takes nothing from it
    expect(statusAt(w2, 7, 5)?.text).toBe('Blocked');
  });

  it('keeps Running into a full core: the core burns what does not fit, and it all counts as delivered', () => {
    const w = feeding();
    run(w, 400);
    const copper = w.content.materials.indexOf('copper-ore');
    const cap = storageInfo(w).capacity;
    w.state.stock[copper] = cap;
    const before = w.state.stats.delivered[copper] ?? 0;
    run(w, 4000);
    expect(statusAt(w, 19, 21)?.text).toBe('Running');
    expect(statusAt(w, 12, 21)?.text).toBe('Running');
    expect(w.state.stock[copper]).toBe(cap);
    expect(w.state.stats.delivered[copper] ?? 0).toBeGreaterThan(before + 20);
  });
});

describe('buildingFacts', () => {
  it('says how far a bridge reaches without contradicting its description', () => {
    const bridge = buildingFacts(content, content.buildings.get('bridge-conveyor'));
    expect(bridge.lines.find((l) => l.label === 'Range')?.value).toMatch(/^4 tiles apart/);
    const driver = buildingFacts(content, content.buildings.get('mass-driver'));
    expect(driver.lines.find((l) => l.label === 'Range')?.value).toMatch(/^55 tiles,/);
  });

  it('lists cost, size, power and recipes', () => {
    const mill = buildingFacts(content, content.buildings.get('wire-mill'));
    expect(mill.size).toMatch(/^\dx\d$/);
    expect(mill.cost.length).toBeGreaterThan(0);
    expect(mill.recipes.length).toBeGreaterThan(0);
    expect(mill.lines.some((l) => l.label === 'Uses power')).toBe(true);
  });

  it('formats numbers without trailing zeros', () => {
    expect(num(1.5)).toBe('1.5');
    expect(num(4)).toBe('4');
    expect(num(0.333333)).toBe('0.33');
  });
});
