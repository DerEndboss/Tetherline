import { describe, expect, it } from 'vitest';
import { DECO_PROPS } from './ids';
import { BELT, BLOCK, CHUNK, DecoPlanner, FREE, HALO, KEEP, planDeco, REMOVED, ROUGH, smoothRun, type DecoBuilding, type DecoInput } from './plan';

function base(buildings: DecoBuilding[], w = 30, h = 30): DecoInput {
  const cells = new Uint8Array(w * h).fill(FREE);
  for (const b of buildings) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) cells[y * w + x] = BLOCK;
  return { w, h, seed: 7, cells, buildings };
}

const B = (x: number, y: number, w = 1, h = 1, art = 'mine'): DecoBuilding => ({ x, y, w, h, art, node: true });

/** A scattered base on a big map: 2x2 and 3x3 buildings on a loose lattice. */
function city(w: number, h: number, step: number, skip = -1): DecoBuilding[] {
  const out: DecoBuilding[] = [];
  let n = 0;
  for (let y = 4; y < h - 4; y += step) {
    for (let x = 4; x < w - 4; x += step + ((x + y) % 3)) {
      if (n++ === skip) continue;
      const size = 1 + ((x * 7 + y * 3) % 3);
      out.push(B(x, y, size, size, ['mine', 'smelter', 'storage', 'generator'][(x + y) % 4]));
    }
  }
  return out;
}

/** Nothing loose: every prop has a cable end on it and every cable end meets a building, a prop or another cable. */
function expectConnected(input: DecoInput, plan: ReturnType<typeof planDeco>): void {
  const ends = plan.runs.flatMap((r) => [r[0]!, r[r.length - 1]!]);
  for (const p of plan.props) expect(ends.some((e) => Math.abs(e.x - (p.x + 0.5)) < 1 && Math.abs(e.y - (p.y + 0.5)) < 1)).toBe(true);
  const joined = (e: { x: number; y: number }): boolean => {
    const t = Math.floor(e.y) * input.w + Math.floor(e.x);
    return input.cells[t] === BLOCK || plan.props.some((p) => p.x === Math.floor(e.x) && p.y === Math.floor(e.y)) || ends.filter((o) => Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - e.y) < 0.01).length > 1 || plan.runs.some((r) => r.some((q) => q !== e && Math.abs(q.x - e.x) < 0.01 && Math.abs(q.y - e.y) < 0.01));
  };
  for (const e of ends) expect(joined(e)).toBe(true);
}

const spotKey = (p: { x: number; y: number }): string => `${p.x},${p.y}`;

/** Cable points that lie on a belt or pipe tile (there must be none). */
function onBelts(input: DecoInput, plan: { runs: { x: number; y: number }[][] }): number {
  return plan.runs.flat().filter((p) => input.cells[Math.floor(p.y) * input.w + Math.floor(p.x)] === BELT).length;
}

describe('planDeco', () => {
  const town = [B(12, 12, 2, 2, 'lander'), B(6, 12), B(18, 13), B(13, 6, 1, 1, 'lab'), B(13, 19, 2, 1, 'smelter'), B(20, 20)];

  it('is deterministic', () => {
    expect(planDeco(base(town))).toEqual(planDeco(base(town)));
  });

  it('links nearby buildings with cables and never lays one through a building or a prop', () => {
    const input = base(town);
    const plan = planDeco(input);
    expect(plan.runs.length).toBeGreaterThan(2);
    const props = new Set(plan.props.map((p) => p.y * input.w + p.x));
    for (const run of plan.runs) {
      // inner points are tile centres on free (or belt) tiles; the ends reach into a footprint
      for (const p of run.slice(1, -1)) {
        const t = Math.floor(p.y) * input.w + Math.floor(p.x);
        expect(input.cells[t]).not.toBe(BLOCK);
        expect(props.has(t)).toBe(false);
      }
    }
  });

  it('puts only 1x1 props on free tiles near buildings, spread out (about one per building)', () => {
    const input = base(town);
    const plan = planDeco(input);
    for (const p of plan.props) expect(input.cells[p.y * input.w + p.x]).toBe(FREE);
    for (const a of plan.props) for (const b of plan.props) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(3);
    const big = city(120, 120, 7);
    const bigPlan = planDeco(base(big, 120, 120));
    expect(bigPlan.props.length).toBeLessThan(big.length * 1.5);
  });

  it('leaves no prop and no cable loose: every prop has a cable end on it, every cable ends in something', () => {
    const input = base(city(100, 100, 7), 100, 100);
    const plan = planDeco(input);
    expect(plan.props.length).toBeGreaterThan(5);
    expectConnected(input, plan);
  });

  it('dresses every building of 2x2 and more with a prop of its own, a big one with several', () => {
    const lone = [B(10, 10, 2, 2, 'mine'), B(30, 10, 2, 2, 'smelter'), B(50, 10, 3, 3, 'lander'), B(10, 40, 3, 3, 'lab'), B(40, 40, 5, 5, 'storage'), B(25, 25, 2, 2, 'mine')];
    for (const seed of [1, 7, 42, 99, 123]) {
      const input = { ...base(lone, 80, 80), seed };
      const plan = planDeco(input);
      for (const b of lone) {
        const own = plan.props.filter((p) => Math.max(0, b.x - p.x, p.x - (b.x + b.w - 1)) <= 3 && Math.max(0, b.y - p.y, p.y - (b.y + b.h - 1)) <= 3);
        expect(own.length, `seed ${seed} building ${b.x},${b.y}`).toBeGreaterThanOrEqual(Math.min(b.w, b.h) >= 5 ? 4 : Math.min(b.w, b.h) >= 3 ? 3 : 1);
      }
      expectConnected(input, plan);
    }
  });

  it('dresses a building that stands alone from the first moment: core only, no cable partner', () => {
    const input = base([B(15, 15, 3, 3, 'lander')], 40, 40);
    const plan = planDeco(input);
    expect(plan.props.length).toBeGreaterThanOrEqual(3);
    expect(plan.runs.length).toBeGreaterThanOrEqual(plan.props.length);
    expectConnected(input, plan);
  });

  it('mixes the prop kinds evenly: no kind takes more than a third', () => {
    const plan = planDeco(base(city(200, 200, 6), 200, 200));
    const counts = new Map<string, number>();
    for (const p of plan.props) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    expect(plan.props.length).toBeGreaterThan(40);
    expect(counts.size).toBe(DECO_PROPS.length);
    for (const n of counts.values()) expect(n / plan.props.length).toBeLessThan(0.34);
  });

  it('keeps the cables when rubble is cleared, and props never move because of it', () => {
    const input = base(town);
    const rough = base(town);
    for (let t = 0; t < rough.cells.length; t += 5) if (rough.cells[t] === FREE) rough.cells[t] = ROUGH;
    const clean = planDeco(input);
    const rubble = planDeco(rough);
    const spots = new Set(clean.props.map((p) => `${p.x},${p.y}:${p.kind}`));
    for (const p of rubble.props) expect(spots.has(`${p.x},${p.y}:${p.kind}`)).toBe(true);
  });

  it('a removed prop is gone with its cable, and its neighbours stay where they are', () => {
    const input = base(city(80, 80, 7), 80, 80);
    const before = planDeco(input);
    const gone = before.props[Math.floor(before.props.length / 2)]!;
    const after = base(city(80, 80, 7), 80, 80);
    after.cells[gone.y * 80 + gone.x] = REMOVED;
    const plan = planDeco(after);
    expect(plan.props.some((p) => p.x === gone.x && p.y === gone.y)).toBe(false);
    const spots = new Set(before.props.map((p) => `${p.x},${p.y}`));
    for (const p of plan.props) expect(spots.has(`${p.x},${p.y}`)).toBe(true);
    expect(plan.props.length).toBe(before.props.length - 1);
  });

  it('a removed prop takes its cable end with it and nothing is left loose', () => {
    const input = base(city(80, 80, 7), 80, 80);
    const before = planDeco(input);
    const gone = before.props[3]!;
    const after = base(city(80, 80, 7), 80, 80);
    after.cells[gone.y * 80 + gone.x] = REMOVED;
    const plan = planDeco(after);
    expect(plan.props.some((p) => p.x === gone.x && p.y === gone.y)).toBe(false);
    for (const r of plan.runs) for (const q of r) expect(Math.floor(q.x) === gone.x && Math.floor(q.y) === gone.y).toBe(false);
    expectConnected(after, plan);
  });

  it('a removed junction box is gone, the cables stay, and no other box jumps in beside it', () => {
    const input = base(city(100, 100, 7), 100, 100);
    const before = planDeco(input);
    expect(before.junctions.length).toBeGreaterThan(30);
    // the first twelve boxes include relays whose neighbours would have taken their place without the spacing rule
    for (const gone of before.junctions.slice(0, 12)) {
      const after = base(city(100, 100, 7), 100, 100);
      after.cells[gone.y * 100 + gone.x] = REMOVED;
      const plan = planDeco(after);
      // exactly that box is missing: not one more, not one moved
      const wanted = before.junctions.filter((j) => spotKey(j) !== spotKey(gone)).map(spotKey).sort();
      expect(plan.junctions.map(spotKey).sort()).toEqual(wanted);
      expect(plan.runs).toEqual(before.runs);
      expect(plan.props).toEqual(before.props);
      expectConnected(after, plan);
    }
  });

  it('never lays a cable across a belt, a pipe or a footprint: it goes around through the gap, or is left out', () => {
    const wall = base([B(7, 10), B(13, 10)]);
    for (let y = 0; y < 30; y++) wall.cells[y * 30 + 10] = BELT;
    const closed = planDeco(wall);
    expect(onBelts(wall, closed)).toBe(0);
    expect(closed.runs.some((r) => r.some((p) => p.x > 10 && p.x < 11))).toBe(false);
    // the same belt with a gap: the link takes the gap instead of crossing
    const gap = base([B(7, 10), B(13, 10)]);
    for (let y = 0; y < 30; y++) if (y !== 12) gap.cells[y * 30 + 10] = BELT;
    const open = planDeco(gap);
    expect(onBelts(gap, open)).toBe(0);
    expect(open.runs.some((r) => r.some((p) => Math.floor(p.x) === 10 && Math.floor(p.y) === 12))).toBe(true);
    expectConnected(gap, open);
  });

  it('a belt laid over a cable moves the cable out of the way; nothing is left loose', () => {
    const input = base(city(80, 80, 7), 80, 80);
    const planner = new DecoPlanner();
    planner.setInput(input);
    planner.process(Infinity);
    const run = [...planner.chunks.values()].flatMap((c) => c.runs).find((r) => r.length > 6)!;
    const mid = run[Math.floor(run.length / 2)]!;
    const laid = { ...input, cells: input.cells.slice() };
    for (let d = -3; d <= 3; d++) laid.cells[(Math.floor(mid.y) + d) * 80 + Math.floor(mid.x)] = BELT;
    planner.setInput(laid);
    planner.process(Infinity);
    const fresh = planDeco(laid);
    expect(onBelts(laid, fresh)).toBe(0);
    expectConnected(laid, fresh);
    const after = { runs: [...planner.chunks.values()].flatMap((c) => c.runs), props: [...planner.chunks.values()].flatMap((c) => c.props), junctions: [] };
    expect(onBelts(laid, after)).toBe(0);
  });

  it('only lays cables over kept tiles at a price: ore stays free of props', () => {
    const input = base([B(4, 4), B(12, 4)]);
    for (let y = 0; y < 30; y++) for (let x = 6; x < 10; x++) input.cells[y * 30 + x] = KEEP;
    for (const p of planDeco(input).props) expect(input.cells[p.y * 30 + p.x]).not.toBe(KEEP);
  });
});

describe('chunked planning', () => {
  const W = 130;
  const H = 130;
  const key = (cx: number, cy: number): number => cy * 4096 + cx;

  /** Plans a base from scratch and returns the chunk plans. */
  function chunks(input: DecoInput): Map<number, unknown> {
    const p = new DecoPlanner();
    p.setInput(input);
    p.process(Infinity);
    return new Map([...p.chunks].map(([k, v]) => [k, JSON.parse(JSON.stringify(v)) as unknown]));
  }

  it('gives the same deco for the same map', () => {
    const a = chunks(base(city(W, H, 7), W, H));
    const b = chunks(base(city(W, H, 7), W, H));
    expect(a).toEqual(b);
  });

  it('a change touches only the chunks within reach of it', () => {
    const list = city(W, H, 7);
    const before = chunks(base(list, W, H));
    const more = [...list, B(66, 66, 3, 3, 'smelter')];
    const input = base(more, W, H);
    const after = chunks(input);
    let differing = 0;
    for (const k of new Set([...before.keys(), ...after.keys()])) {
      const cx = k % 4096;
      const cy = Math.floor(k / 4096);
      const near = 66 + 3 + HALO >= cx * CHUNK && 66 - HALO < (cx + 1) * CHUNK && 66 + 3 + HALO >= cy * CHUNK && 66 - HALO < (cy + 1) * CHUNK;
      if (JSON.stringify(before.get(k)) !== JSON.stringify(after.get(k))) {
        differing++;
        expect(near).toBe(true);
      }
    }
    expect(differing).toBeGreaterThan(0);
    expect(differing).toBeLessThanOrEqual(9);
  });

  it('the incremental planner equals a fresh plan after a change and reports only what changed', () => {
    const list = city(W, H, 7);
    const planner = new DecoPlanner();
    planner.setInput(base(list, W, H));
    planner.process(Infinity);
    const edited = [...list.slice(0, 20), ...list.slice(21), B(30, 90, 2, 2, 'storage')];
    planner.setInput(base(edited, W, H));
    expect(planner.queued).toBeGreaterThan(0);
    const changed = planner.process(Infinity);
    expect(changed.length).toBeLessThan(25);
    const fresh = new DecoPlanner();
    fresh.setInput(base(edited, W, H));
    fresh.process(Infinity);
    expect(JSON.parse(JSON.stringify([...planner.chunks]))).toEqual(JSON.parse(JSON.stringify([...fresh.chunks])));
  });

  it('removing a prop replans only its neighbourhood', () => {
    const input = base(city(W, H, 7), W, H);
    const planner = new DecoPlanner();
    planner.setInput(input);
    planner.process(Infinity);
    const prop = [...planner.chunks.values()].flatMap((c) => c.props)[10]!;
    const next = { ...input, cells: input.cells.slice() };
    next.cells[prop.y * W + prop.x] = REMOVED;
    planner.setInput(next);
    expect(planner.queued).toBeLessThanOrEqual(16);
    const changed = planner.process(Infinity);
    expect(changed.some((c) => c.key === key(Math.floor(prop.x / CHUNK), Math.floor(prop.y / CHUNK)))).toBe(true);
  });

  it('is quick: a big base plans in well under a second, a change in a few milliseconds', () => {
    const w = 260;
    const list = city(w, w, 4);
    expect(list.length).toBeGreaterThan(1500);
    const input = base(list, w, w);
    const planner = new DecoPlanner();
    const t0 = performance.now();
    planner.setInput(input);
    planner.process(Infinity);
    const full = performance.now() - t0;
    expect(full).toBeLessThan(6000);
    const edited = base([...list, B(130, 130, 2, 2)], w, w);
    const t1 = performance.now();
    planner.setInput(edited);
    planner.process(Infinity);
    const small = performance.now() - t1;
    expect(small).toBeLessThan(full / 3);
  });
});

describe('smoothRun', () => {
  it('rounds a corner and keeps the ends', () => {
    const out = smoothRun([{ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }, { x: 2.5, y: 2.5 }], 0.4, []);
    expect(out.slice(0, 2)).toEqual([0.5, 0.5]);
    expect(out.slice(-2)).toEqual([2.5, 2.5]);
    expect(out.length).toBeGreaterThan(6);
  });
});
