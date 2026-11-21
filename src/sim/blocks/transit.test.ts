import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { hashValue } from '../hash';
import { beltLine, placeNow, testWorld } from '../dev';
import { offer } from '../items';
import type { Building } from '../state';
import { run } from '../tick';
import type { World } from '../world';
import { HOP_KEEP, HOP_STRIDE, noteHop } from './transit';

const M = (id: string): number => content.materials.indexOf(id);

describe('hop log (visual only)', () => {
  it('appends records and drops the ones older than HOP_KEEP ticks, without holes in the queue', () => {
    const w = testWorld(content);
    const b = placeNow(w, 'sorter', 10, 10, 0, M('copper-ore'));
    noteHop(b, 0, 5, 1, 2, 3);
    noteHop(b, 0, 6, 1, 2, 3);
    expect(b.queue[0]).toEqual([5, 1, 2, 3, 6, 1, 2, 3]);
    noteHop(b, 0, 5 + HOP_KEEP + 1, 4, 0, 1);
    expect(b.queue[0]).toEqual([6, 1, 2, 3, 5 + HOP_KEEP + 1, 4, 0, 1]);
    // a log in slot 1 fills the slot before it, so queue 0 is never a hole
    const c = placeNow(w, 'bridge-conveyor', 12, 12, 0);
    c.queue.length = 0;
    noteHop(c, 1, 1, 1, 0, 0);
    expect(c.queue[0]).toEqual([]);
    expect(c.queue[1]).toEqual([1, 1, 0, 0]);
  });

  /** An ore line into a sorter, one into a bridge pair and one into a router, all run for a while. */
  function scene(): World {
    const w = testWorld(content, 60, 40);
    placeNow(w, 'core-shard', 30, 30);
    for (const [y, kind] of [[5, 'sorter'], [10, 'bridge-conveyor'], [15, 'router']] as const) {
      const line = beltLine(w, 2, y, 0, 4);
      placeNow(w, kind, 6, y, 0, kind === 'sorter' ? M('copper-ore') : -1);
      if (kind === 'bridge-conveyor') placeNow(w, kind, 9, y, 0);
      beltLine(w, kind === 'bridge-conveyor' ? 10 : 7, y, 0, 4);
      const first = line[0]!;
      // a stream of ore: copper and iron alternate
      for (let i = 0; i < 4; i++) offer(w, first, line[1]!, i % 2 ? M('iron-ore') : M('copper-ore'));
    }
    return w;
  }

  /** The hop log of a block: a sorter's in queue 0, a bridge's and a router's in queue 1; null for other blocks. */
  function logOf(w: World, b: Building): number[] | null {
    const beh = w.def(b).behaviour;
    if (beh === 'sorter') return b.queue[0] ?? [];
    return beh === 'bridge' || beh === 'router' ? (b.queue[1] ?? []) : null;
  }

  it('stays small however long the line runs and is plain numbers (saves as JSON)', () => {
    const w = scene();
    run(w, 400);
    const logs = w.state.buildings.map((b) => logOf(w, b)).filter((l): l is number[] => l !== null);
    expect(logs.length).toBeGreaterThanOrEqual(3);
    for (const log of logs) {
      expect(log.length % HOP_STRIDE).toBe(0);
      expect(log.length / HOP_STRIDE).toBeLessThanOrEqual(HOP_KEEP + 1);
    }
    const queues = w.state.buildings.map((b) => b.queue);
    expect(queues.flat(2).every(Number.isFinite)).toBe(true);
    expect(JSON.parse(JSON.stringify(queues))).toEqual(queues);
  });

  it('is deterministic: the same scene twice gives the same state', () => {
    const a = scene();
    const b = scene();
    run(a, 200);
    run(b, 200);
    expect(hashValue(a.state.buildings)).toBe(hashValue(b.state.buildings));
  });
});
