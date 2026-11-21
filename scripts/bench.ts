/**
 * Simulation speed with the stress scene (src/sim/stress.ts): ms per tick for N buildings and M items.
 *   npm run bench [-- --buildings 3000 --items 10000 --ticks 400]
 * The budget at 20 Hz and 60 fps: the sim may use a few ms per tick; drawing gets the rest of the 16.7 ms.
 */
import { parseArgs } from 'node:util';
import { content } from '../src/content';
import { stressWorld } from '../src/sim/stress';
import { step } from '../src/sim/tick';

const { values } = parseArgs({ options: { buildings: { type: 'string', default: '3000' }, items: { type: 'string', default: '10000' }, ticks: { type: 'string', default: '400' } } });
const w = stressWorld(content, { buildings: Number(values.buildings), items: Number(values.items) });
let onBelts = 0;
for (const b of w.state.buildings) if (b.slot >= 0) onBelts += w.state.belts.count[b.slot] ?? 0;
for (let i = 0; i < 40; i++) step(w);
const ticks = Number(values.ticks);
const t0 = performance.now();
for (let i = 0; i < ticks; i++) step(w);
const ms = (performance.now() - t0) / ticks;
console.log(JSON.stringify({ buildings: w.state.buildings.length, itemsOnBelts: onBelts, msPerTick: Math.round(ms * 1000) / 1000, msPerSecondAt20Hz: Math.round(ms * 20 * 100) / 100 }));
