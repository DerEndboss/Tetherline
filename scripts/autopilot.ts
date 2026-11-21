/**
 * Plays whole rounds with the autopilot, headless and as fast as the sim goes, and logs every game minute:
 * buildings, ghosts, orders, the running order's progress, key stocks, the bot's last step, how long its looks
 * took (worst per minute) and what the snapshot for the worker costs the main thread.
 *   npm run autopilot [-- --seeds 1,7,42 --minutes 90 --size medium --theme rust-desert --quiet --trace --map 20]
 * Ends a seed when the round is won. Exit code 1 when a seed went longer than --stall minutes without progress.
 */
import { parseArgs } from 'node:util';
import { content } from '../src/content';
import { thinkRequest } from '../src/game/autopilot-snapshot';
import { Round } from '../src/sim/bot-run';
import type { Command } from '../src/sim/commands';
import { powerMade, powerWanted } from '../src/sim/power';
import { orderProgress } from '../src/sim/progression';
import type { World } from '../src/sim/world';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '1,7,42' },
    minutes: { type: 'string', default: '90' },
    size: { type: 'string', default: 'medium' },
    theme: { type: 'string' },
    stall: { type: 'string', default: '10' },
    quiet: { type: 'boolean', default: false },
    trace: { type: 'boolean', default: false },
    map: { type: 'string', default: '0' },
  },
});

const KEY = ['copper-ore', 'copper-wire', 'coal', 'sand', 'iron-bar', 'graphite', 'silicon', 'glass', 'steel', 'titanium-plate', 'circuit', 'plastic', 'battery-cell', 'frame', 'motor', 'core-chip', 'star-alloy', 'singularity'];

const stockOf = (w: World, id: string): number => Math.floor(w.state.stock[w.content.materials.indexOf(id)] ?? 0);

function activeOrder(w: World): string {
  return w.state.progress.active
    .map((a) => {
      const [have, need] = orderProgress(w, w.content.orders.get(a.id), a.count);
      return `${a.id} ${Math.floor(have)}/${need}`;
    })
    .join(' ');
}

const GLYPH: Record<string, string> = {
  core: '#', storage: 'V', drill: 'd', conveyor: '-', junction: '+', router: 'r', sorter: 's', overflow: 'o', bridge: '=', unloader: 'u',
  'mass-driver': 'M', crafter: 'C', generator: 'G', solar: '*', battery: 'b', 'power-node': 'n', conduit: '~', pump: 'p', tank: 'T', mega: 'E',
};

function ghostAt(w: World, x: number, y: number): boolean {
  return w.state.plans.some((p) => x >= p.x && y >= p.y && x < p.x + w.defs[p.kind]!.size && y < p.y + w.defs[p.kind]!.size);
}

function glyph(w: World, x: number, y: number): string {
  const { map } = w.state;
  if (!w.inBounds(x, y)) return ' ';
  const b = w.at(x, y);
  if (b) return GLYPH[w.def(b).behaviour] ?? '?';
  if (ghostAt(w, x, y)) return '?';
  const i = y * map.w + x;
  if (!map.ground[i] || map.ridge[i]) return 'X';
  return map.floor[i] ? '.' : ' ';
}

/** The map around the core as text: one glyph per building tile, floors as '.', rock as 'X', ghosts as '?'. */
function asciiMap(w: World, radius: number): string {
  const c = w.core!;
  const rows: string[] = [];
  for (let y = c.y - radius; y <= c.y + radius; y++) {
    let row = '';
    for (let x = c.x - radius; x <= c.x + radius; x++) row += glyph(w, x, y);
    rows.push(row);
  }
  return rows.join('\n');
}

/** Power made and wanted over all buildings, and what the drones do (b build, s supply, i idle, m mine). */
function fleet(w: World): string {
  let made = 0;
  let wanted = 0;
  for (const b of w.state.buildings) {
    if (!w.ready(b)) continue;
    made += powerMade(w, b);
    wanted += powerWanted(w, b);
  }
  const acts = w.state.drones.map((d) => (d.task === 'build' || d.task === 'remove' ? 'b' : d.act === 'fetch' || d.act === 'deliver' ? 's' : d.act === 'mine' ? 'm' : 'i')).join('');
  return `power ${made.toFixed(0)}/${wanted.toFixed(0)} drones ${acts}`;
}

/** Worst look of the bot in the current minute. */
const timing = { max: 0, looks: 0, worst: 0 };

function timedLook(think: () => Command[]): Command[] {
  const t0 = performance.now();
  const out = think();
  const ms = performance.now() - t0;
  if (ms > 0.05) timing.looks++;
  timing.max = Math.max(timing.max, ms);
  timing.worst = Math.max(timing.worst, ms);
  return out;
}

/** What the worker snapshot costs the main thread (pack + structured clone with the transfer). */
function snapshotMs(w: World): number {
  const t0 = performance.now();
  const req = thinkRequest(w, 1, false);
  structuredClone(req, { transfer: [req.state.buildings.buffer] });
  return performance.now() - t0;
}

function report(r: Round): void {
  const w = r.world;
  const minute = Math.round(r.minute);
  if (!values.quiet) {
    const stocks = KEY.map((id) => [id, stockOf(w, id)] as const).filter(([, n]) => n > 0).map(([id, n]) => `${id}=${n}`).join(' ');
    const head = `s${r.opts.seed} m${String(minute).padStart(3)} b=${w.state.buildings.length} g=${w.state.plans.length} done=${w.state.progress.done.length}`;
    const cost = `look max ${timing.max.toFixed(0)} ms (${timing.looks}), snapshot ${snapshotMs(w).toFixed(2)} ms`;
    console.log(`${head} [${activeOrder(w)}] ${stocks} | ${fleet(w)} | ${r.bot.log.at(-1) ?? '-'} | ${cost}`);
  }
  if (minute === Number(values.map)) console.log(asciiMap(w, 34));
  if (values.trace && !values.quiet) for (const [k, v] of r.bot.trace) console.log(`    ${k}: ${v}`);
  timing.max = 0;
  timing.looks = 0;
}

const stallMax = Number(values.stall);
let bad = false;
for (const seed of values.seeds.split(',').map(Number)) {
  timing.worst = 0;
  const r = new Round(content, { seed, size: values.size, theme: values.theme, minutes: Number(values.minutes), onMinute: report, look: timedLook }).play();
  const total = content.orders.list.length;
  const where = `${values.size}${values.theme ? ' ' + values.theme : ''}`;
  console.log(`seed ${seed} (${where}): ${r.orders.length}/${total} orders, won ${r.won === null ? 'no' : `at ${r.won} min`}, longest stall ${r.longestStall.toFixed(1)} min, ${r.world.state.buildings.length} buildings, worst look ${timing.worst.toFixed(0)} ms`);
  console.log(`  ${r.orders.map((o) => `${o.id}@${o.minute}`).join(' ')}`);
  const kinds = [...new Set(r.world.state.buildings.map((b) => r.world.def(b).id))].sort();
  console.log(`  ${kinds.length} kinds of building: ${kinds.join(' ')}`);
  if (r.longestStall > stallMax) bad = true;
}
process.exit(bad ? 1 : 0);
