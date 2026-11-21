import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { hashValue } from '../sim/hash';
import { createRun } from '../sim/newgame';
import { run } from '../sim/tick';
import { fromSaveRecord, recordToText, saveKind, textToRecord, toSaveRecord } from './serialize';
import { listSlots, readSlot, writeSlot } from './slots';

describe('saves', () => {
  it('a run goes through a file and comes back the same', () => {
    const w = createRun(content, { seed: 5 });
    run(w, 100);
    const back = fromSaveRecord(textToRecord(recordToText(toSaveRecord(w, 1))), content)!;
    expect(back.state.map.floor).toBeInstanceOf(Uint8Array);
    const flat = (s: typeof w.state) => hashValue({ ...s, map: [...s.map.floor, ...s.map.ground], belts: [...s.belts.item] });
    expect(flat(back.state)).toBe(flat(w.state));
    run(back, 100);
    run(w, 100);
    expect(back.state.stock).toEqual(w.state.stock);
  });

  it('saves of another format version are recognised and not loaded', () => {
    expect(saveKind({ version: 6, state: {} })).toBe('old');
    expect(fromSaveRecord({ version: 6, state: {} }, content)).toBeNull();
    expect(saveKind(undefined)).toBe('none');
  });

  it('three slots in IndexedDB', async () => {
    const w = createRun(content, { seed: 9 });
    await writeSlot(2, toSaveRecord(w, 123));
    const slots = await listSlots();
    expect(slots.map((s) => s.summary !== null)).toEqual([false, true, false]);
    expect(fromSaveRecord(await readSlot(2), content)?.state.seed).toBe(9);
  });
});
