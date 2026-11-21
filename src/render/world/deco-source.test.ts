import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { Interaction } from '../../game/interaction';
import { beltLine, placeNow, testWorld } from '../../sim/dev';
import { BELT, BLOCK, FREE, REMOVED } from '../deco/plan';
import { decoInput, decoSource } from './deco-source';

const at = (input: ReturnType<typeof decoInput>, x: number, y: number): number => input.cells[y * input.w + x]!;

describe('the deco input of a world', () => {
  it('walls off footprints and belts, and counts the machines (not belts, sorters or power nodes) as the network', () => {
    const w = testWorld(content, 40, 40);
    placeNow(w, 'smelter', 10, 10);
    placeNow(w, 'battery', 20, 10);
    placeNow(w, 'combustion-generator', 22, 10);
    placeNow(w, 'sorter', 24, 10);
    placeNow(w, 'power-node', 26, 10);
    beltLine(w, 10, 20, 0, 5);
    const input = decoInput(w);
    expect(at(input, 11, 11)).toBe(BLOCK);
    expect(at(input, 20, 10)).toBe(BLOCK);
    expect(at(input, 12, 20)).toBe(BELT);
    expect(at(input, 15, 15)).toBe(FREE);
    expect(input.buildings.map((b) => `${b.x},${b.y}`).sort()).toEqual(['10,10', '20,10', '22,10']);
  });

  it('keeps queued ghosts clear: deco steps aside the moment a ghost is queued, belts and pipes as belts', () => {
    const w = testWorld(content, 40, 40);
    const before = decoSource(() => w, {} as Interaction, '#fff').key();
    w.state.plans.push({ kind: content.buildings.indexOf('container'), x: 8, y: 8, rot: 0, config: -1 });
    w.state.plans.push({ kind: content.buildings.indexOf('conveyor'), x: 14, y: 8, rot: 0, config: -1 });
    const input = decoInput(w);
    expect(at(input, 9, 9)).toBe(BLOCK);
    expect(at(input, 14, 8)).toBe(BELT);
    expect(at(input, 16, 8)).toBe(FREE);
    expect(input.buildings).toEqual([]);
    expect(decoSource(() => w, {} as Interaction, '#fff').key()).not.toBe(before);
  });

  it('marks the tiles of removed pieces', () => {
    const w = testWorld(content, 40, 40);
    w.state.deco.removed.push(5 * 40 + 6);
    expect(at(decoInput(w), 6, 5)).toBe(REMOVED);
  });
});
