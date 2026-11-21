import { gapBetween, sideOf, touches } from '../sim/grid';
import type { Building } from '../sim/state';
import type { World } from '../sim/world';
import { coreRect, type Spot } from './spots';

/** What went wrong with something the player built, in a word. */
export type Fault = 'beside-core' | 'short' | 'blocked' | 'detached' | 'backwards' | 'unfed' | 'misplaced';

/** A hint for a step the player is stuck on: what to say, and the one piece on the map to put the ring on. */
export interface Help {
  fault: Fault;
  /** Stable while the same fault sits on the same piece (the guide waits a moment before it speaks up). */
  key: string;
  text: string;
  spot: Spot;
  /** The fix is at the piece itself (turn it, move it): the guide shows that piece alone, without the step's other marks or the palette ring. */
  quiet: boolean;
}

/** How long (sim seconds) a fault must stand unchanged before the guide mentions it: the player may still be building. */
export const HELP_DELAY_SECONDS = 4;

/** Buildings that take nothing from a belt, so a belt ending against one is stuck. */
const WALLS: ReadonlySet<string> = new Set(['drill', 'pump', 'solar', 'battery', 'power-node', 'conduit', 'liquid-junction', 'liquid-router', 'tank', 'liquid-bridge', 'unloader']);

const LABEL: Record<Fault, string> = {
  'beside-core': 'Press R here',
  short: 'Belt ends here',
  blocked: 'Stuck here',
  detached: 'Start here',
  backwards: 'Wrong way',
  unfed: 'No iron here',
  misplaced: 'Move this',
};

const QUIET: ReadonlySet<Fault> = new Set(['beside-core', 'blocked', 'unfed', 'misplaced']);

function helpAt(fault: Fault, at: { x: number; y: number; w?: number; h?: number }, text: string): Help {
  const spot: Spot = { x: at.x, y: at.y, w: at.w ?? 1, h: at.h ?? 1, label: LABEL[fault] };
  return { fault, key: `${fault}:${spot.x},${spot.y}`, text, spot, quiet: QUIET.has(fault) };
}

const isBelt = (w: World, b: Building | undefined): b is Building => b !== undefined && w.def(b).behaviour === 'conveyor';

/** Whether the drone still has a belt to build (a ghost or an unfinished site): the line is not finished, so it is not wrong yet. */
function beltsPending(w: World): boolean {
  return w.state.plans.some((p) => w.defs[p.kind]?.behaviour === 'conveyor') || w.state.buildings.some((b) => b.build < 1 && !b.removing && isBelt(w, b));
}

/** How a line of belts ends. `ahead` is what its last piece faces. */
interface Run {
  end: Building;
  ahead: Building | undefined;
  /** The piece ahead is a belt that faces back at the end (or the line runs in a circle). */
  headOn: boolean;
  length: number;
}

/** Follows a belt from one piece to where it ends (belts that join are followed on, a circle stops at the repeat). */
function follow(w: World, start: Building): Run {
  const seen = new Set<number>();
  let cur = start;
  for (;;) {
    seen.add(cur.id);
    const next = w.facing(cur, cur.rot);
    if (!isBelt(w, next)) return { end: cur, ahead: next, headOn: false, length: seen.size };
    if (seen.has(next.id) || sideOf(w.rect(next), w.rect(cur)) === next.rot) return { end: cur, ahead: next, headOn: true, length: seen.size };
    cur = next;
  }
}

/** Belts that touch `source` and take what it dumps (not ones that face it). */
function leaving(w: World, source: Building): Building[] {
  return w.neighbours(source).filter((n) => isBelt(w, n) && sideOf(w.rect(n), w.rect(source)) !== n.rot);
}

/** The fault of a run, or null when it is fine (it reaches the core, a building that may take it, or is still being built). */
function faultOf(w: World, run: Run, core: Building | undefined): Fault | null {
  if (run.headOn) return 'blocked';
  const { ahead, end } = run;
  if (ahead) return ahead.id === core?.id || !w.ready(ahead) || !WALLS.has(w.def(ahead).behaviour) ? null : 'blocked';
  const rect = coreRect(w);
  return rect && touches(w.rect(end), rect) ? 'beside-core' : 'short';
}

const SAYS: Record<'beside-core' | 'short', string> = {
  'beside-core': 'Your belt ends beside the core but does not point into it. Hover its last piece and press R until the arrow faces the core.',
  short: 'Your belt stops short of the core. Pick the Conveyor again and drag on from its last piece to the core.',
};

function blockedText(w: World, run: Run): string {
  if (run.headOn) return 'Two belts face each other here, so nothing passes. Hover the last piece and press R to turn it.';
  const name = run.ahead ? w.def(run.ahead).name : 'something';
  return `Your belt runs into the ${name}, which takes nothing. Hover its last piece and press R, or lay the belt round it.`;
}

function runHelp(w: World, run: Run, fault: Fault): Help {
  const text = fault === 'blocked' ? blockedText(w, run) : SAYS[fault as 'beside-core' | 'short'];
  return helpAt(fault, run.end, text);
}

/** A belt that points at the source instead of leaving it (dragged the wrong way round), if there is one. */
function backwards(w: World, source: Building): Building | undefined {
  return w.neighbours(source).find((n) => isBelt(w, n) && sideOf(w.rect(n), w.rect(source)) === n.rot);
}

/** Belts of any kind in the world (finished ones): a player who has laid none has not started yet. */
const hasBelts = (w: World): boolean => w.state.buildings.some((b) => isBelt(w, b) && w.ready(b));

/**
 * Why the belt from `source` (a drill or a smelter) to the core brings nothing. Null while it is fine, while the
 * drone still builds belts, or while the player has laid none. Looks at the belts only, never at the items, so it
 * answers the moment the line stands.
 */
export function beltHelp(w: World, source: Building | undefined, name: string): Help | null {
  if (!source || beltsPending(w)) return null;
  const core = w.core;
  const runs = leaving(w, source).map((start) => follow(w, start));
  if (runs.length === 0) return hasBelts(w) ? detached(w, source, name) : null;
  const faulty: { run: Run; fault: Fault }[] = [];
  for (const run of runs) {
    const fault = faultOf(w, run, core);
    if (!fault) return null;
    faulty.push({ run, fault });
  }
  const rect = coreRect(w);
  const gap = (r: Run): number => (rect ? gapBetween(w.rect(r.end), rect) : 0);
  const best = faulty.sort((a, b) => gap(a.run) - gap(b.run) || b.run.length - a.run.length)[0];
  return best ? runHelp(w, best.run, best.fault) : null;
}

function detached(w: World, source: Building, name: string): Help {
  const wrong = backwards(w, source);
  if (wrong) return helpAt('backwards', wrong, `This belt points at the ${name}. Drag the line from the ${name} to the core, or turn its pieces with R.`);
  return helpAt('detached', { x: source.x, y: source.y, w: w.def(source).size, h: w.def(source).size }, `No belt leaves the ${name} yet. The first piece has to touch it and point away from it.`);
}

/** Whether something hands the smelter ore: it touches a drill on iron (given), or a belt leads into it. */
function isFed(w: World, smelter: Building, ironDrills: ReadonlySet<number>): boolean {
  return w.neighbours(smelter).some((n) => ironDrills.has(n.id) || (isBelt(w, n) && sideOf(w.rect(n), w.rect(smelter)) === n.rot));
}

/** A smelter that has no iron coming in: it touches no iron drill and no belt leads into it. */
export function starvedSmelter(w: World, smelter: Building | undefined, ironDrills: readonly Building[]): Help | null {
  if (!smelter || beltsPending(w) || isFed(w, smelter, new Set(ironDrills.map((d) => d.id)))) return null;
  const size = w.def(smelter).size;
  return helpAt('unfed', { x: smelter.x, y: smelter.y, w: size, h: size }, 'This smelter has no iron to melt: it has to touch the iron drill (or have a belt from it).');
}

/** An unloader that does not touch both the core and a Wire Mill, so it feeds nothing. */
export function lostUnloader(w: World, unloaders: readonly Building[], mills: readonly Building[]): Help | null {
  const core = coreRect(w);
  if (!core || unloaders.length === 0) return null;
  const works = unloaders.some((u) => touches(w.rect(u), core) && mills.some((m) => touches(w.rect(u), w.rect(m))));
  const first = unloaders[0];
  if (works || !first) return null;
  return helpAt('misplaced', first, 'An Unloader has to touch the core and the Wire Mill at once: it takes copper from one and hands it to the other.');
}
