import type { FloorDef } from '../../content/types';
import type { Building } from '../../sim/state';
import { beltItems } from '../../sim/belts';
import { drillInfo, drillRate, recipeOf } from '../../sim/blocks/production';
import { netOfMember } from '../../sim/liquids';
import { powerFactor, powerGraph } from '../../sim/power';
import { storageInfo } from '../../sim/storage';
import type { World } from '../../sim/world';
import { wreckAt } from '../../sim/wrecks';
import { beltFront, type BeltFront } from './belt';
import { num, recipeFact, type RecipeFact } from './facts';

export type Tone = 'good' | 'warn' | 'bad' | 'plain';

export interface InspectLine {
  label: string;
  value: string;
  tone?: Tone;
}

/** What is under the mouse, as data for the hover card. */
export interface Inspection {
  kind: 'building' | 'site' | 'ghost' | 'ore' | 'liquid' | 'boulder' | 'ridge' | 'wreck' | 'deco';
  title: string;
  /** Material, liquid or sprite id for the card's icon: `icon-iron-ore`, `building-conveyor`. */
  icon?: string;
  /** Short status line with a tone (Working, No power ...). */
  status?: { text: string; tone: Tone };
  lines: InspectLine[];
  /** Items lying on a belt, held by a machine, or kept in storage, by name. */
  stacks: { id: string; name: string; n: number }[];
  recipe?: RecipeFact;
  /** A key hint ("Backspace to remove"). */
  hint?: string;
  /** Footprint in tiles, so the renderer can highlight the object. */
  rect: { x: number; y: number; w: number; h: number };
}

/** An extra inspector (render-world adds decoration this way); the first one that answers wins. */
export type Inspector = (w: World, x: number, y: number) => Inspection | null;
const extra: Inspector[] = [];

/** Registers an inspector run before the built-in ones. Returns the remover. */
export function registerInspector(fn: Inspector): () => void {
  extra.unshift(fn);
  return () => {
    const i = extra.indexOf(fn);
    if (i >= 0) extra.splice(i, 1);
  };
}

const line = (label: string, value: string, tone: Tone = 'plain'): InspectLine => ({ label, value, tone });

function matName(w: World, i: number): string {
  return w.content.materials.list[i]?.name ?? '?';
}

function heldStacks(w: World, b: Building): Inspection['stacks'] {
  const out: Inspection['stacks'] = [];
  b.items.forEach((n, i) => {
    if (n > 0) out.push({ id: w.content.materials.list[i]!.id, name: matName(w, i), n });
  });
  return out;
}

function beltStacks(w: World, b: Building): Inspection['stacks'] {
  const counts = new Map<number, number>();
  for (const [item] of beltItems(w.state.belts, b.slot)) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].map(([i, n]) => ({ id: w.content.materials.list[i]!.id, name: matName(w, i), n }));
}

/** The core: its stock, biggest first. */
function coreStacks(w: World): Inspection['stacks'] {
  return w.content.materials.list
    .map((m, i) => ({ id: m.id, name: m.name, n: Math.floor(w.state.stock[i] ?? 0) }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
}

/* ---------- Status ---------- */

type Status = NonNullable<Inspection['status']>;

function powerStatus(w: World, b: Building): Status | null {
  const def = w.def(b);
  if (!def.power?.use) return null;
  const f = powerFactor(w, b);
  if (f <= 0.001) return { text: 'No power', tone: 'bad' };
  if (f < 0.98) return { text: `Low power ${Math.round(f * 100)}%`, tone: 'warn' };
  return null;
}

function crafterStatus(w: World, b: Building): Status {
  const r = recipeOf(w, b);
  if (!r) return { text: 'No recipe', tone: 'warn' };
  const missing = r.inputs.find((s) => (b.items[w.content.materials.indexOf(s.item)] ?? 0) < s.n);
  if (missing) return { text: `Needs ${w.content.materials.find(missing.item)?.name ?? missing.item}`, tone: 'warn' };
  return b.work > 0 ? { text: 'Working', tone: 'good' } : { text: 'Output blocked', tone: 'warn' };
}

function drillStatus(w: World, b: Building): Status {
  const info = drillInfo(w, b);
  if (info.item < 0) return { text: 'No ore under it', tone: 'bad' };
  const full = (b.items[info.item] ?? 0) >= (w.def(b).items ?? 10);
  return full ? { text: 'Output blocked', tone: 'warn' } : { text: 'Mining', tone: 'good' };
}

/** A belt: running, backed up, or with nothing in front of it. */
function beltStatus(front: BeltFront): Status {
  if (front.kind === 'end') return { text: 'End of line', tone: 'warn' };
  if (front.kind === 'open') return { text: 'Running', tone: 'good' };
  return { text: 'Blocked', tone: 'warn' };
}

function statusOf(w: World, b: Building): Status {
  if (b.removing) return { text: 'Being removed', tone: 'warn' };
  const power = powerStatus(w, b);
  const def = w.def(b);
  if (def.behaviour === 'conveyor') return beltStatus(beltFront(w, b));
  if (def.behaviour === 'drill') return power ?? drillStatus(w, b);
  if (def.behaviour === 'crafter') return power ?? crafterStatus(w, b);
  if (def.behaviour === 'generator') return b.work > 0 ? { text: 'Burning', tone: 'good' } : { text: 'Needs fuel', tone: 'warn' };
  return power ?? { text: 'Running', tone: 'good' };
}

/* ---------- Lines per kind of building ---------- */

function drillLines(w: World, b: Building): InspectLine[] {
  const info = drillInfo(w, b);
  if (info.item < 0) return [];
  const perMin = drillRate(w, b) * 60;
  return [line('Ore', `${matName(w, info.item)}, ${info.count}/${info.area} tiles`), line('Rate', `${num(perMin)}/min`)];
}

function gridLine(w: World, b: Building): InspectLine[] {
  const g = powerGraph(w);
  const i = g.netOf.get(b.id);
  const net = i === undefined ? undefined : g.nets[i];
  if (!net) return [];
  return [line('Grid', `${num(net.made)} made, ${num(net.wanted)} wanted`, net.satisfaction < 0.98 ? 'warn' : 'plain')];
}

function powerLines(w: World, b: Building): InspectLine[] {
  const p = w.def(b).power;
  if (!p) return [];
  const out: InspectLine[] = [];
  if (p.use) out.push(line('Uses power', `${num(p.use)}/s`));
  if (p.make) out.push(line('Makes power', `${num(p.make)}/s`));
  if (p.store) out.push(line('Charge', `${Math.floor(b.charge)} / ${num(p.store)}`));
  if (p.laserRange) out.push(line('Links', `${b.links.length} / ${p.maxLinks ?? '-'}`));
  return [...out, ...gridLine(w, b)];
}

function liquidLines(w: World, b: Building): InspectLine[] {
  const net = netOfMember(w, b);
  if (!net || net.liquid < 0) return net ? [line('Liquid', 'empty')] : [];
  const name = w.content.liquids.list[net.liquid]?.name ?? '?';
  return [line('Liquid', `${name} ${Math.round(net.amount)} / ${Math.round(net.capacity)}`)];
}

/** The fact behind a belt's warning: what it points at, and the key that turns it. */
function beltFacts(front: BeltFront): InspectLine[] {
  if (front.kind === 'end') return [line('Ahead', 'Points at nothing, press R', 'warn')];
  if (front.kind === 'deaf') return [line('Ahead', `${front.name} takes no items, press R`, 'warn')];
  return [];
}

function behaviourLines(w: World, b: Building): InspectLine[] {
  const def = w.def(b);
  switch (def.behaviour) {
    case 'drill':
      return drillLines(w, b);
    case 'conveyor':
      return [line('Speed', `${num(def.conveyor?.speed ?? 0)} tiles/s`), ...beltFacts(beltFront(w, b))];
    case 'core':
    case 'storage':
      return [line('Capacity', `${num(storageInfo(w).capacity)} of each`)];
    case 'sorter':
    case 'unloader':
      return [line('Item', b.config >= 0 ? matName(w, b.config) : 'any')];
    default:
      return [];
  }
}

function crafterRecipe(w: World, b: Building): RecipeFact | undefined {
  if (w.def(b).behaviour !== 'crafter') return undefined;
  const r = recipeOf(w, b);
  return r ? recipeFact(w.content, r) : undefined;
}

function buildingInfo(w: World, b: Building): Inspection {
  const def = w.def(b);
  const base = { icon: `building-${def.id}`, rect: { x: b.x, y: b.y, w: def.size, h: def.size } };
  if (b.build < 1) {
    return { ...base, kind: 'site', title: def.name, status: { text: `Building ${Math.round(b.build * 100)}%`, tone: 'warn' }, lines: [], stacks: [] };
  }
  const stacks = def.behaviour === 'conveyor' && b.slot >= 0 ? beltStacks(w, b) : def.behaviour === 'core' ? coreStacks(w) : heldStacks(w, b);
  return {
    ...base,
    kind: 'building',
    title: def.name,
    status: statusOf(w, b),
    lines: [...behaviourLines(w, b), ...powerLines(w, b), ...liquidLines(w, b)],
    stacks,
    recipe: crafterRecipe(w, b),
    hint: def.behaviour === 'core' ? undefined : 'Right-click or Del to remove',
  };
}

/* ---------- Ground ---------- */

const RICH_RADIUS = 3;

/** How many tiles of the same floor lie in a 7x7 box around a tile: the patch's richness. */
function patchSize(w: World, x: number, y: number, floor: number): number {
  const { map } = w.state;
  let n = 0;
  for (let ty = y - RICH_RADIUS; ty <= y + RICH_RADIUS; ty++) {
    for (let tx = x - RICH_RADIUS; tx <= x + RICH_RADIUS; tx++) {
      if (w.inBounds(tx, ty) && map.floor[ty * map.w + tx] === floor) n++;
    }
  }
  return n;
}

function richness(n: number): string {
  if (n >= 25) return 'Rich';
  return n >= 12 ? 'Normal' : 'Sparse';
}

type Rect = Inspection['rect'];

function floorAt(w: World, x: number, y: number): { index: number; def: FloorDef | undefined } {
  const { map } = w.state;
  const index = map.floor[y * map.w + x] ?? 0;
  return { index, def: index > 0 ? w.content.floors.list[index - 1] : undefined };
}

function oreInfo(w: World, x: number, y: number, rect: Rect): Inspection | null {
  const { index, def } = floorAt(w, x, y);
  if (!def?.ore) return null;
  const n = patchSize(w, x, y, index);
  const lines = [line('Needs', `drill tier ${def.hardness ?? 1}`), line('Patch', `${richness(n)} (${n} tiles near)`)];
  return { kind: 'ore', title: def.name, icon: w.content.materials.find(def.ore)?.icon, lines, stacks: [], rect, hint: 'Build a drill on it' };
}

function liquidInfo(w: World, x: number, y: number, rect: Rect): Inspection | null {
  const def = floorAt(w, x, y).def;
  if (!def?.liquid) return null;
  const lines = [line('Liquid', w.content.liquids.find(def.liquid)?.name ?? def.liquid), line('Depth', def.deep ? 'deep: pumps only' : 'shallow')];
  return { kind: 'liquid', title: def.name, lines, stacks: [], rect, hint: 'Build a pump on it' };
}

function wreckInfo(w: World, x: number, y: number, rect: Rect): Inspection | null {
  const wreck = wreckAt(w, x, y);
  if (!wreck) return null;
  const name = w.content.buildings.find(wreck.building)?.name ?? wreck.building;
  return { kind: 'wreck', title: 'Wreck', lines: [line('Blueprint', name)], stacks: [], rect, hint: 'Click to salvage the blueprint' };
}

function rockInfo(w: World, x: number, y: number, rect: Rect): Inspection | null {
  const { map } = w.state;
  const i = y * map.w + x;
  if (map.ridge[i]) return { kind: 'ridge', title: 'Rock ridge', lines: [line('Build', 'blocked')], stacks: [], rect };
  if (map.boulder[i]) return { kind: 'boulder', title: 'Dust boulder', lines: [], stacks: [], rect, hint: 'Right click to clear, or build over it' };
  return null;
}

function groundInfo(w: World, x: number, y: number): Inspection | null {
  const rect = { x, y, w: 1, h: 1 };
  return oreInfo(w, x, y, rect) ?? liquidInfo(w, x, y, rect) ?? wreckInfo(w, x, y, rect) ?? rockInfo(w, x, y, rect);
}

function ghostInfo(w: World, x: number, y: number): Inspection | null {
  for (const p of w.state.plans) {
    const def = w.defs[p.kind]!;
    if (x < p.x || y < p.y || x >= p.x + def.size || y >= p.y + def.size) continue;
    const rect = { x: p.x, y: p.y, w: def.size, h: def.size };
    return { kind: 'ghost', title: def.name, icon: `building-${def.id}`, status: { text: 'Ghost, waiting for the drone', tone: 'warn' }, lines: [], stacks: [], rect, hint: 'Right-click or Del to cancel' };
  }
  return null;
}

/**
 * What is at a tile: a building (status, rate, power, what it holds), a belt (what lies on it), a ghost, an ore or
 * liquid field, a wreck, rock or a dust boulder. Null over empty ground. Read-only; safe to call at 10 Hz.
 */
export function inspectTile(w: World, x: number, y: number): Inspection | null {
  if (!w.inBounds(x, y)) return null;
  for (const fn of extra) {
    const hit = fn(w, x, y);
    if (hit) return hit;
  }
  const b = w.at(x, y);
  if (b) return buildingInfo(w, b);
  return ghostInfo(w, x, y) ?? groundInfo(w, x, y);
}
