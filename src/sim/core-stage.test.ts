import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { placeNow, testWorld } from './dev';
import { placementProblem } from './placement';
import { step } from './tick';
import type { World } from './world';

/** The core shard used to stand in the palette as a second core for 400 copper. There is one core per run. */

function withCore(): World {
  const w = testWorld(content);
  placeNow(w, 'core-shard', 20, 20);
  return w;
}

const def = (id: string) => content.buildings.get(id);

describe('one core per run', () => {
  it('another core stage can not be placed; only the next stage may, and it upgrades the core in place', () => {
    const w = withCore();
    expect(placementProblem(w, def('core-shard'), 5, 5)).toBe('locked');
    expect(placementProblem(w, def('core-nucleus'), 5, 5)).toBe('locked');
    expect(placementProblem(w, def('core-foundation'), 5, 5)).toBeNull();
  });

  it('placing the shard queues nothing; placing the next stage starts the upgrade instead of a ghost', () => {
    const w = withCore();
    step(w, [{ type: 'place', kind: 'core-shard', x: 5, y: 5, rot: 0 }]);
    expect(w.state.plans).toHaveLength(0);
    step(w, [{ type: 'place', kind: 'core-foundation', x: 5, y: 5, rot: 0 }]);
    expect(w.state.plans).toHaveLength(0);
    expect(w.core!.upgrade?.kind).toBe(content.buildings.indexOf('core-foundation'));
    expect(w.state.buildings.filter((b) => w.def(b).behaviour === 'core')).toHaveLength(1);
  });
});
