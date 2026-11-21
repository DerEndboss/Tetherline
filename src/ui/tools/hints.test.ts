import { describe, expect, it } from 'vitest';
import type { InteractionView } from '../../game/interaction';
import { hintOf } from './hints';

const view = (mode: InteractionView['mode'], clip: InteractionView['clip'] = null): InteractionView => ({ mode, clip }) as InteractionView;

describe('tool hints', () => {
  it('lists the idle keys when no tool is in hand', () => {
    const h = hintOf(view({ kind: 'none' }), '', 'row');
    expect(h.lead).toBeUndefined();
    expect(h.items.map((i) => i.k)).toEqual(['X', 'Q', 'H', 'P', 'WASD']);
  });

  it('names the building being placed and how to drag it', () => {
    const h = hintOf(view({ kind: 'place', building: 'conveyor' }), 'Conveyor', 'line');
    expect(h.lead).toBe('Placing Conveyor');
    expect(h.items.some((i) => i.t === 'Drag for a line')).toBe(true);
  });

  it('shows the size of the blueprint in hand', () => {
    const h = hintOf(view({ kind: 'paste' }, { name: '', w: 4, h: 2, count: 3 }), '', 'row');
    expect(h.lead).toBe('Blueprint 4x2');
    expect(h.items.map((i) => i.k).filter(Boolean)).toEqual(['R', 'F', 'Esc']);
  });

  it('every tool says how to stop', () => {
    for (const kind of ['remove', 'select', 'paste'] as const) {
      const keys = hintOf(view({ kind }), '', 'row').items.map((i) => i.k);
      expect(keys).toContain('Esc');
    }
  });
});
