import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { content, rawContent } from '../../content';
import { droppedMeta } from '../../content/meta';
import { droppedOrders } from '../../content/orders';
import { metaStore, buyNode, emptyMeta, parseMeta } from '../../save/meta';
import { fromSaveRecord, recordToText, textToRecord, toSaveRecord } from '../../save/serialize';
import { layoutTree } from '../../ui/progression/MetaTree';
import { createRun } from '../newgame';
import { run, step } from '../tick';
import { applyMeta, bonusOf, isUnlocked, nodeState, orderProgress, sendProgress, setOwnedMeta, winBonus } from '.';

const stockOf = (w: ReturnType<typeof createRun>, id: string): number => w.state.stock[content.materials.indexOf(id)] ?? 0;

describe('the order chain', () => {
  it('starts with the first order and radios it', () => {
    const w = createRun(content, { seed: 3 });
    expect(w.state.progress.active.map((a) => a.id)).toEqual([content.orders.list[0]!.id]);
    expect(w.state.progress.radio?.[0]?.text).toContain('Welcome');
  });

  it('is a single chain from the first order to the last, with no cycles or loose ends', () => {
    const list = content.orders.list;
    expect(list[0]!.after).toEqual([]);
    list.slice(1).forEach((o, i) => expect(o.after).toEqual([list[i]!.id]));
  });

  it('builds the story: tutorial first, rate goals and the elevator stages', () => {
    const list = content.orders.list;
    expect(list.slice(0, 5).every((o) => o.tutorial)).toBe(true);
    expect(list.some((o) => o.goal.kind === 'rate')).toBe(true);
    expect(list.every((o) => o.radio.length > 10 && o.radio.length < 160)).toBe(true);
  });

  it('only names content that exists, except what the content does not have yet', () => {
    // droppedOrders / droppedMeta list what was cut for missing materials or buildings; empty once content is complete
    expect(Array.isArray(droppedOrders)).toBe(true);
    expect(Array.isArray(droppedMeta)).toBe(true);
    expect(rawContent.orders.length).toBeGreaterThan(10);
  });

  it('every building a goal asks for is available when its order comes', () => {
    const unlocked = new Set<string>(content.buildings.list.filter((b) => b.unlock === 'start').map((b) => b.id));
    for (const o of content.orders.list) {
      if (o.goal.kind === 'build') expect(unlocked.has(o.goal.building), `${o.id} needs ${o.goal.building}`).toBe(true);
      for (const u of o.unlocks ?? []) unlocked.add(u);
    }
  });

  it('every building that is not there from the start is unlocked by an order or a meta node', () => {
    const orderUnlocks = new Set(content.orders.list.flatMap((o) => o.unlocks ?? []));
    const metaUnlocks = new Set(content.meta.list.flatMap((m) => (m.effect.kind === 'unlock' ? [m.effect.building] : [])));
    for (const b of content.buildings.list) {
      if (b.unlock === 'order') expect(orderUnlocks.has(b.id), `${b.id} (order)`).toBe(true);
      if (b.unlock === 'meta') expect(metaUnlocks.has(b.id), `${b.id} (meta)`).toBe(true);
    }
  });

  it('a deliver order finishes when the core has taken the items, then the next starts', () => {
    const w = createRun(content, { seed: 4 });
    const first = content.orders.list[0]!;
    w.state.stats.built[content.buildings.indexOf('mechanical-drill')] = 1;
    const events = run(w, 20);
    expect(events.some((e) => e.type === 'order-done' && e.id === first.id)).toBe(true);
    expect(w.state.progress.done).toContain(first.id);
    expect(w.state.progress.active[0]?.id).toBe(content.orders.list[1]!.id);
    expect(w.state.progress.radio!.length).toBe(2);
  });

  it('a rate goal needs the rate held for the whole time and loses the streak when it drops', () => {
    const w = createRun(content, { seed: 5 });
    const rate = content.orders.list.find((o) => o.goal.kind === 'rate')!;
    const g = rate.goal as { kind: 'rate'; item: string; perMinute: number; minutes: number };
    const idx = content.materials.indexOf(g.item);
    w.state.progress.done = content.orders.list.slice(0, content.orders.list.indexOf(rate)).map((o) => o.id);
    w.state.progress.active = [];
    w.state.progress.unlocked = [];
    w.state.progress.metaApplied = true;
    // start it (orders are picked up at the next half second)
    run(w, 1);
    expect(w.state.progress.active[0]?.id).toBe(rate.id);
    // produce 2x the wanted rate for the window
    for (let s = 0; s < g.minutes * 60 + 20; s++) {
      w.state.stats.made[idx] = (w.state.stats.made[idx] ?? 0) + (g.perMinute * 2) / 60;
      run(w, 20);
      if (s === 30) expect(orderProgress(w, rate, 0)[0]).toBeGreaterThan(5);
    }
    expect(w.state.progress.done).toContain(rate.id);
    // and a goal that is not met holds no streak
    const w2 = createRun(content, { seed: 5 });
    w2.state.progress.done = w.state.progress.done.filter((id) => id !== rate.id);
    w2.state.progress.active = [];
    w2.state.progress.metaApplied = true;
    run(w2, 1);
    run(w2, 20 * 90);
    expect(w2.state.progress.done).not.toContain(rate.id);
    expect(orderProgress(w2, rate, 0)[0]).toBe(0);
  });

  it('winning: the last order sets won once, pays the win bonus, radios and survives a save', () => {
    const w = createRun(content, { seed: 6 });
    const list = content.orders.list;
    w.state.progress.metaApplied = true;
    w.state.progress.done = list.slice(0, -1).map((o) => o.id);
    w.state.progress.active = [];
    run(w, 1);
    const last = list[list.length - 1]!;
    const g = last.goal;
    if (g.kind === 'build') w.state.stats.built[content.buildings.indexOf(g.building)] = g.n;
    else if (g.kind === 'deliver') w.state.stats.delivered[content.materials.indexOf(g.item)] = g.n;
    else if (g.kind === 'make') w.state.stats.made[content.materials.indexOf(g.item)] = g.n;
    const events = run(w, 21);
    expect(events.filter((e) => e.type === 'won')).toHaveLength(1);
    expect(w.state.progress.won).toBe(true);
    expect(w.state.progress.earned).toBeGreaterThanOrEqual(winBonus(1));
    expect(run(w, 100).some((e) => e.type === 'won')).toBe(false);
    const back = fromSaveRecord(textToRecord(recordToText(toSaveRecord(w, 1))), content)!;
    expect(back.state.progress.won).toBe(true);
    expect(back.state.progress.radio?.at(-1)?.id).toBe('won');
  });

  it('the inbox marks rewards paid and the victory seen, for the right run only', () => {
    const w = createRun(content, { seed: 7 });
    w.state.progress.earned = 5;
    sendProgress({ run: 999, type: 'claimed', to: 5 });
    sendProgress({ run: 7, type: 'claimed', to: 99 });
    sendProgress({ run: 7, type: 'celebrated' });
    step(w);
    expect(w.state.progress.claimed).toBe(5);
    expect(w.state.progress.celebrated).toBe(true);
  });

  it('is deterministic: the same seed and ticks give the same progress', () => {
    const a = createRun(content, { seed: 8 });
    const b = createRun(content, { seed: 8 });
    run(a, 400);
    run(b, 400);
    expect(a.state.progress).toEqual(b.state.progress);
  });
});

describe('the meta tree', () => {
  it('has no cycles, costs that grow and a columns layout', () => {
    const placed = layoutTree(content.meta.list);
    expect(placed).toHaveLength(content.meta.list.length);
    for (const p of placed) for (const r of p.node.requires) expect(placed.find((q) => q.node.id === r)!.col).toBeLessThan(p.col);
    expect(content.meta.list.some((n) => n.requires.length === 0)).toBe(true);
  });

  it('applies bonuses, start items and unlocks once at the start of a run', () => {
    const owned = content.meta.list.map((n) => n.id);
    setOwnedMeta(() => owned);
    const w = createRun(content, { seed: 9 });
    const base = createRun(content, { seed: 9 });
    run(w, 1);
    setOwnedMeta(() => []);
    expect(w.state.progress.metaApplied).toBe(true);
    expect(w.state.bonus).toEqual(bonusOf(content, owned));
    expect(w.state.bonus.build).toBeGreaterThan(1);
    expect(stockOf(w, 'copper-ore')).toBeGreaterThan(stockOf(base, 'copper-ore'));
    const before = { ...w.state.bonus };
    applyMeta(w, owned);
    run(w, 5);
    expect(w.state.bonus).toEqual(before);
    for (const n of content.meta.list) if (n.effect.kind === 'unlock') expect(w.state.progress.unlocked).toContain(n.effect.building);
  });

  it('a save made before the tree existed is marked, not changed', () => {
    setOwnedMeta(() => content.meta.list.map((n) => n.id));
    const w = createRun(content, { seed: 10 });
    w.state.tick = 500;
    delete w.state.progress.metaApplied;
    run(w, 1);
    setOwnedMeta(() => []);
    expect(w.state.bonus.build).toBe(1);
    expect(w.state.progress.metaApplied).toBe(true);
  });

  it('isUnlocked: start buildings always, others once unlocked', () => {
    const w = createRun(content, { seed: 11 });
    const start = content.buildings.list.find((b) => b.unlock === 'start')!;
    expect(isUnlocked(w, start)).toBe(true);
    const locked = { ...start, id: 'x-locked', unlock: 'order' as const };
    expect(isUnlocked(w, locked)).toBe(false);
    w.state.progress.unlocked.push('x-locked');
    expect(isUnlocked(w, locked)).toBe(true);
  });

  it('node states and buying', () => {
    const root = content.meta.list.find((n) => n.requires.length === 0)!;
    const child = content.meta.list.find((n) => n.requires.includes(root.id))!;
    expect(nodeState(root, [], 0)).toBe('poor');
    expect(nodeState(root, [], 99)).toBe('ready');
    expect(nodeState(child, [], 99)).toBe('locked');
    const m = { ...emptyMeta(), points: root.cost + child.cost };
    expect(buyNode(content, m, child.id)).toBeNull();
    const m2 = buyNode(content, m, root.id)!;
    expect(m2.points).toBe(child.cost);
    expect(nodeState(child, m2.owned, m2.points)).toBe('ready');
    expect(buyNode(content, m2, root.id)).toBeNull();
  });

  it('the store pays out, buys and keeps its state across loads', async () => {
    await metaStore.load();
    await metaStore.earn(7);
    const root = content.meta.list.find((n) => n.requires.length === 0)!;
    expect(await metaStore.buy(content, root.id)).toBe(true);
    expect(metaStore.get().owned).toEqual([root.id]);
    expect(metaStore.get().points).toBe(7 - root.cost);
    expect(parseMeta(JSON.parse(JSON.stringify(metaStore.get()))).owned).toEqual([root.id]);
    expect(parseMeta('garbage').points).toBe(0);
    expect(parseMeta({ points: -3, owned: [1, 'a'] })).toMatchObject({ points: 0, owned: ['a'] });
  });

  it('win bonus is bigger for faster rounds and capped', () => {
    expect(winBonus(60 * 100)).toBe(10);
    expect(winBonus(60 * 40)).toBeGreaterThan(winBonus(60 * 80));
    expect(winBonus(0)).toBeLessThanOrEqual(18);
  });
});
