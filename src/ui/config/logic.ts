import { num } from '../../game/inspect/facts';
import type { BuildingDef, MaterialDef, RecipeDef } from '../../content/types';
import { recipeOf } from '../../sim/blocks/production';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';

/**
 * What the configuration panel asks of the world, as plain data (no React): which buildings can be set, the
 * options with the current one marked, why an option is dim, what happens to the items already inside, and where
 * the panel sits next to the building. Everything is read from content and the sim, nothing is made up here.
 */

/** `recipe`: a crafter with several recipes; `sorter` / `unloader`: one item (or none / any). */
export type ConfigKind = 'recipe' | 'sorter' | 'unloader';

/** Whether a building type can be set by the player, and how. Staged mega buildings use `config` as a counter: never. */
export function configKind(def: BuildingDef): ConfigKind | null {
  if (def.behaviour === 'sorter' || def.behaviour === 'unloader') return def.behaviour;
  if (def.behaviour === 'crafter' && !def.stages && (def.recipes?.length ?? 0) > 1) return 'recipe';
  return null;
}

/** The kind of a finished building by id, or null (no such building, a site, not settable). */
export function configKindOf(w: World, id: number): ConfigKind | null {
  const b = w.byId.get(id);
  return b && b.build >= 1 && !b.removing ? configKind(w.def(b)) : null;
}

/** One amount in an option: an item with its material, or a liquid with its colour. */
export interface Amount {
  id: string;
  name: string;
  n: number;
  /** The item's material (icon), absent for liquids. */
  item?: MaterialDef;
  /** Liquid colour for the chip. */
  color?: string;
}

export interface ConfigOption {
  /** The `config` value the click sends. */
  value: number;
  key: string;
  /** Item or recipe name; "None" / "Any" for the empty sorter / unloader choice. */
  label: string;
  /** Material whose icon represents the option (an item, or the main product of a recipe). */
  item?: MaterialDef;
  /** Chip colour when there is no item icon (a liquid-only recipe, the empty choice). */
  color?: string;
  empty?: boolean;
  /** Recipes only. */
  inputs: Amount[];
  outputs: Amount[];
  seconds?: number;
  active: boolean;
  /** Why it is dim (still selectable: the player may plan ahead), or null. */
  reason: string | null;
}

/** Whether the run has had this item at all: in the core, made by a machine or delivered to the core. */
export function seen(w: World, item: number): boolean {
  const s = w.state;
  return (s.stock[item] ?? 0) > 0 || (s.stats.made[item] ?? 0) > 0 || (s.stats.delivered[item] ?? 0) > 0;
}

function itemAmounts(w: World, list: { item: string; n: number }[]): Amount[] {
  return list.map((s) => {
    const item = w.content.materials.find(s.item);
    return { id: s.item, name: item?.name ?? s.item, n: s.n, ...(item ? { item } : {}) };
  });
}

function liquidAmounts(w: World, list: { liquid: string; n: number }[] | undefined): Amount[] {
  return (list ?? []).map((s) => {
    const liquid = w.content.liquids.find(s.liquid);
    return { id: s.liquid, name: liquid?.name ?? s.liquid, n: s.n, color: liquid?.color ?? 'currentColor' };
  });
}

/** The recipe index a crafter really runs (an unset or out-of-range `config` runs the first). */
export function activeRecipe(w: World, b: Building): number {
  const n = w.def(b).recipes?.length ?? 0;
  return b.config >= 0 && b.config < n ? b.config : 0;
}

/** The inputs of a recipe the run has never had: the reason it is dim, or null. */
function missingInputs(w: World, r: RecipeDef): string | null {
  const missing = r.inputs.filter((s) => !seen(w, w.content.materials.indexOf(s.item)));
  if (!missing.length) return null;
  return `Not found yet: ${missing.map((s) => w.content.materials.find(s.item)?.name ?? s.item).join(', ')}`;
}

export function recipeOptions(w: World, b: Building): ConfigOption[] {
  const active = activeRecipe(w, b);
  const ids = w.def(b).recipes ?? [];
  const out: ConfigOption[] = [];
  ids.forEach((id, value) => {
    const r = w.content.recipes.find(id);
    if (!r) return;
    const outputs = [...itemAmounts(w, r.outputs), ...liquidAmounts(w, (r.liquidOut ?? []).filter((l) => l.vent !== true))];
    const main = itemAmounts(w, r.outputs)[0]?.item;
    const colour = outputs[0]?.color;
    out.push({
      value,
      key: id,
      label: r.name,
      ...(main ? { item: main } : {}),
      ...(colour ? { color: colour } : {}),
      inputs: [...itemAmounts(w, r.inputs), ...liquidAmounts(w, r.liquidIn)],
      outputs,
      seconds: r.seconds,
      active: value === active,
      reason: missingInputs(w, r),
    });
  });
  return out;
}

/** Sorter and unloader: "none" / "any" first (the sim knows -1), then every material in content order. */
export function itemOptions(w: World, b: Building, kind: 'sorter' | 'unloader'): ConfigOption[] {
  const empty: ConfigOption = {
    value: -1,
    key: 'none',
    label: kind === 'sorter' ? 'None' : 'Any',
    empty: true,
    inputs: [],
    outputs: [],
    active: b.config < 0,
    reason: null,
  };
  const list = w.content.materials.list.map<ConfigOption>((m, value) => ({
    value,
    key: m.id,
    label: m.name,
    item: m,
    inputs: [],
    outputs: [],
    active: b.config === value,
    reason: seen(w, value) ? null : 'Not found yet',
  }));
  return [empty, ...list];
}

export function optionsFor(w: World, b: Building, kind: ConfigKind): ConfigOption[] {
  return kind === 'recipe' ? recipeOptions(w, b) : itemOptions(w, b, kind);
}

/** What the empty choice does, from what the sim does with `config < 0`. */
export function emptyMeaning(kind: 'sorter' | 'unloader'): string {
  return kind === 'sorter' ? 'None: every item goes to the sides, nothing goes straight on.' : 'Any: takes whatever the store holds, one kind after another.';
}

/** "4 Iron Ore" for every item the building holds that its current recipe neither uses nor makes. */
export function leftovers(w: World, b: Building): string[] {
  const r = recipeOf(w, b);
  const used = new Set<number>();
  for (const s of [...(r?.inputs ?? []), ...(r?.outputs ?? [])]) used.add(w.content.materials.indexOf(s.item));
  const out: string[] = [];
  b.items.forEach((n, i) => {
    if (n > 0 && !used.has(i)) out.push(`${n} ${w.content.materials.list[i]?.name ?? '?'}`);
  });
  return out;
}

/**
 * The honest line under a recipe grid. What the sim does on `configure`: only `config` changes. Items inside stay
 * where they are; a crafter takes only the inputs of its recipe and hands on only the outputs of its recipe, so
 * what the old recipe left waits until the old recipe is chosen again. Work in progress carries over.
 */
export function recipeNote(w: World, b: Building): string {
  const left = leftovers(w, b);
  const base = 'Items already inside stay. The new recipe takes only its own inputs; leftovers of the old one wait inside until you switch back.';
  return left.length ? `${base} Waiting now: ${left.join(', ')}.` : base;
}

/** One line "2 Iron Ore + 1 Graphite -> 1 Steel, 2.5 s" for screen readers and tests. */
export function describe(o: ConfigOption): string {
  const part = (list: Amount[]): string => list.map((a) => `${num(a.n)} ${a.name}`).join(' + ');
  const time = o.seconds === undefined ? '' : `, ${num(o.seconds)} s`;
  return o.inputs.length || o.outputs.length ? `${o.label}: ${part(o.inputs) || 'nothing'} to ${part(o.outputs) || 'nothing'}${time}` : o.label;
}

/* ---------- Keyboard ---------- */

/**
 * The tile a key moves to in a grid of `cols` columns and `n` tiles, or the same index for any other key. Sideways
 * keys wrap along the list; up and down stop at the edge of a grid (a single column wraps like a list).
 */
export function moveCursor(index: number, key: string, cols: number, n: number): number {
  if (n <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols } as Record<string, number | undefined>)[key];
  if (step === undefined) return index;
  const next = index + step;
  const wraps = key === 'ArrowLeft' || key === 'ArrowRight' || cols === 1;
  if (wraps) return (next + n) % n;
  return next < 0 || next >= n ? index : next;
}

/* ---------- Where the panel sits ---------- */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Size {
  w: number;
  h: number;
}

const touches = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

type Point = { x: number; y: number };

/**
 * The top-left corner of a panel of `size` beside a building's screen box: right of it, else left, below, above
 * (the first that fits the window and covers none of the `avoid` rects; a side may slide up or down past a rect),
 * else the first that at least fits the window, else clamped into it.
 */
export function placePanel(box: Rect, size: Size, vp: Size, avoid: Rect[] = [], margin = 8, gap = 24): Point {
  const clampX = (x: number): number => Math.max(margin, Math.min(x, vp.w - size.w - margin));
  const clampY = (y: number): number => Math.max(margin, Math.min(y, vp.h - size.h - margin));
  const midY = clampY((box.y0 + box.y1) / 2 - size.h / 2);
  const midX = clampX((box.x0 + box.x1) / 2 - size.w / 2);
  const inside = (p: Point): boolean => p.x >= margin && p.y >= margin && p.x + size.w <= vp.w - margin && p.y + size.h <= vp.h - margin;
  const clear = (p: Point): boolean => inside(p) && !avoid.some((r) => touches({ x0: p.x, y0: p.y, x1: p.x + size.w, y1: p.y + size.h }, r));
  const sides: Point[] = [
    { x: box.x1 + gap, y: midY },
    { x: box.x0 - gap - size.w, y: midY },
    { x: midX, y: box.y1 + gap },
    { x: midX, y: box.y0 - gap - size.h },
  ];
  // a side may slide up or down to get past a HUD rect
  const slid = sides.flatMap((p) => [p, ...avoid.flatMap((r) => [{ x: p.x, y: r.y0 - size.h - 4 }, { x: p.x, y: r.y1 + 4 }])]);
  return slid.find(clear) ?? sides.find(inside) ?? { x: clampX(box.x1 + gap), y: midY };
}
