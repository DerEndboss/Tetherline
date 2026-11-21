import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { placeNow, testWorld } from '../../sim/dev';
import { step } from '../../sim/tick';
import { UndoStack } from './undo';

describe('undo', () => {
  it('undoes a placed ghost and redoes it', () => {
    const w = testWorld(content);
    const plans = [{ kind: 'conveyor', x: 3, y: 3, rot: 0 as const }];
    step(w, [{ type: 'place-many', plans }]);
    expect(w.state.plans).toHaveLength(1);
    const u = new UndoStack();
    u.record({ type: 'place', plans });
    step(w, u.undo(w));
    expect(w.state.plans).toHaveLength(0);
    step(w, u.redo(w));
    expect(w.state.plans).toHaveLength(1);
  });

  it('undoing a placement leaves a different building on that spot alone', () => {
    const w = testWorld(content);
    placeNow(w, 'conveyor', 3, 3, 1);
    const u = new UndoStack();
    u.record({ type: 'place', plans: [{ kind: 'smelter', x: 3, y: 3, rot: 0 }] });
    expect(u.undo(w)).toEqual([]);
  });

  it('undoes a demolition by placing the buildings again, and a rotation by turning back', () => {
    const w = testWorld(content);
    const b = placeNow(w, 'conveyor', 5, 5, 0);
    const u = new UndoStack();
    u.record({ type: 'rotate', id: b.id, from: 0, to: 2 });
    step(w, [{ type: 'rotate', id: b.id, rot: 2 }]);
    step(w, u.undo(w));
    expect(b.rot).toBe(0);
    u.record({ type: 'demolish', plans: [{ kind: 'conveyor', x: 5, y: 5, rot: 0 }] });
    step(w, u.undo(w));
    expect(w.state.plans.some((p) => p.x === 5 && p.y === 5)).toBe(true);
  });

  it('a new action clears the redo history', () => {
    const w = testWorld(content);
    const u = new UndoStack();
    u.record({ type: 'place', plans: [] });
    u.undo(w);
    expect(u.redoCount).toBe(1);
    u.record({ type: 'place', plans: [] });
    expect(u.redoCount).toBe(0);
  });
});
