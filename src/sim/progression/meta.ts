import type { ContentRegistry } from '../../content/registry';
import type { BuildingDef, Id, MetaNodeDef } from '../../content/types';
import { storeInCore } from '../storage';
import type { World } from '../world';

/**
 * The meta tree's effect on a run. The tree itself (what is owned, the points) is saved across runs by the UI side
 * (src/save/meta.ts); the sim only sees the owned node ids at the start of a run and turns them into run state.
 */

/** Which meta nodes the player owns, as the sim sees them. Set by the UI once the meta save is loaded. */
let ownedProvider: () => readonly Id[] = () => [];

/** The one bridge from the saved meta tree into the sim: read once per run, at its first tick. */
export function setOwnedMeta(provider: () => readonly Id[]): void {
  ownedProvider = provider;
}

/** Whether a node can be bought: not owned, requirements owned. */
export function nodeState(node: MetaNodeDef, owned: readonly Id[], points: number): 'owned' | 'locked' | 'poor' | 'ready' {
  if (owned.includes(node.id)) return 'owned';
  if (!node.requires.every((r) => owned.includes(r))) return 'locked';
  return points >= node.cost ? 'ready' : 'poor';
}

const STAT_KEY = { 'build-speed': 'build', 'drill-speed': 'drill', 'core-capacity': 'capacity', 'belt-speed': 'belt', power: 'power' } as const;

/** The run bonuses (multipliers) of a set of owned nodes. */
export function bonusOf(content: ContentRegistry, owned: readonly Id[]): World['state']['bonus'] {
  const bonus = { build: 1, drill: 1, capacity: 1, belt: 1, power: 1 };
  for (const node of content.meta.list) {
    if (owned.includes(node.id) && node.effect.kind === 'bonus') bonus[STAT_KEY[node.effect.stat]] += node.effect.value;
  }
  return bonus;
}

/** Buildings a set of owned nodes unlocks. */
export function unlocksOf(content: ContentRegistry, owned: readonly Id[]): Id[] {
  const out: Id[] = [];
  for (const node of content.meta.list) if (owned.includes(node.id) && node.effect.kind === 'unlock') out.push(node.effect.building);
  return out;
}

/** Applies the owned meta nodes to a fresh run: bonuses, start items, unlocked buildings. Safe to call once. */
export function applyMeta(w: World, owned: readonly Id[]): void {
  const p = w.state.progress;
  if (p.metaApplied) return;
  p.metaApplied = true;
  w.state.bonus = bonusOf(w.content, owned);
  for (const id of unlocksOf(w.content, owned)) if (!p.unlocked.includes(id)) p.unlocked.push(id);
  for (const node of w.content.meta.list) {
    if (!owned.includes(node.id) || node.effect.kind !== 'start-items') continue;
    for (const s of node.effect.items) {
      const i = w.content.materials.indexOf(s.item);
      if (i >= 0) storeInCore(w, i, s.n);
    }
  }
}

/** First tick of a run: apply the owned meta nodes. A save made before this existed is only marked, never changed. */
export function startMeta(w: World): void {
  if (w.state.progress.metaApplied !== undefined) return;
  if (w.state.tick > 1) w.state.progress.metaApplied = true;
  else applyMeta(w, ownedProvider());
}

/** Whether the player may place a building now: from the start, or unlocked by the meta tree, an order or a wreck. */
export function isUnlocked(w: World, def: BuildingDef): boolean {
  return def.unlock === 'start' || w.state.progress.unlocked.includes(def.id);
}

/** Meta currency for finishing a round: a base plus a bonus for each full 5 minutes under 90. */
export const WIN_BASE = 10;
export function winBonus(seconds: number): number {
  const fast = Math.max(0, Math.floor((90 * 60 - seconds) / 300));
  return WIN_BASE + Math.min(8, fast);
}
