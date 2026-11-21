import { describe, expect, it } from 'vitest';
import type { SlotInfo } from '../../save/slots';
import type { SlotSummary } from '../../save/serialize';
import { freeSlot, landing, replaceable } from './launch';

const summary = { theme: 'rust-desert', size: 'medium', seconds: 420, ordersDone: 3, buildings: 12 } as unknown as SlotSummary;
const saved = (slot: number, savedAt: number): SlotInfo => ({ slot, summary, savedAt });
const empty = (slot: number): SlotInfo => ({ slot, summary: null, savedAt: 0 });

describe('where a new round lands', () => {
  it('takes the first empty slot and wipes nothing', () => {
    const slots = [saved(1, 10), empty(2), saved(3, 30)];
    expect(freeSlot(slots)).toBe(2);
    expect(landing(slots)).toEqual({ slot: 2, replaces: null });
  });

  it('with every slot taken it names the save it would replace: the oldest', () => {
    const slots = [saved(1, 300), saved(2, 100), saved(3, 200)];
    const l = landing(slots);
    expect(l.slot).toBe(2);
    expect(l.replaces?.slot).toBe(2);
  });

  it('never lands on the round in play, even when it is the oldest save', () => {
    const slots = [saved(1, 100), saved(2, 200), saved(3, 300)];
    expect(landing(slots, 1).slot).toBe(2);
  });

  it('an unsaved slot of the round in play stays out of it', () => {
    const slots = [empty(1), saved(2, 200), saved(3, 300)];
    expect(landing(slots, 1).slot).toBe(2);
  });
});

describe('which saves the player may give up', () => {
  it('lists the filled slots but the one in play, the oldest first', () => {
    const slots = [saved(1, 300), saved(2, 100), saved(3, 200)];
    expect(replaceable(slots).map((s) => s.slot)).toEqual([2, 3, 1]);
    expect(replaceable(slots, 2).map((s) => s.slot)).toEqual([3, 1]);
  });

  it('skips empty slots', () => {
    expect(replaceable([empty(1), saved(2, 5), empty(3)]).map((s) => s.slot)).toEqual([2]);
  });
});
