import type { Behaviour, BuildingDef } from '../../content/types';
import type { Interaction } from '../../game/interaction';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';
import type { DecoSource } from '../deco/view';
import { BELT, BLOCK, FREE, KEEP, REMOVED, ROUGH, type DecoBuilding, type DecoInput } from '../deco/plan';
import { worldSettings } from './settings';

/** Which props suit a building, by behaviour (keys of the planner's SUITS table; anything else suits nothing in particular). */
const ART_BY_BEHAVIOUR: Partial<Record<Behaviour, string>> = {
  core: 'lander',
  drill: 'mine',
  pump: 'mine',
  crafter: 'smelter',
  generator: 'generator',
  solar: 'solar',
  battery: 'storage',
  storage: 'storage',
  tank: 'storage',
  mega: 'lab',
  'mass-driver': 'lab',
};

/** Behaviours that never take part in the cable network (belts and conduits are flat, nodes have lasers). */
const FLAT = new Set<Behaviour>(['conveyor', 'conduit']);

/** 1x1 machines that are dressed and wired like the bigger ones (a lone generator or battery is a machine, a sorter is not). */
const SMALL_MACHINES = new Set<Behaviour>(['generator', 'battery', 'solar', 'pump']);

/** How often the sweep of dust boulders (no layout change) is looked for, ms. */
const BOULDER_CHECK_MS = 600;

/** Adapts the world to the deco layer: the planner input, the settings switch and the tiles ghosts cover. */
export function decoSource(getWorld: () => World, interaction: Interaction, tech: string): DecoSource {
  let boulders = 0;
  let checked = -1e9;
  return {
    tech,
    enabled: () => worldSettings().decoration,
    key: () => {
      const w = getWorld();
      const now = performance.now();
      if (now - checked > BOULDER_CHECK_MS) {
        checked = now;
        boulders = boulderCount(w);
      }
      return ((((w.layout * 31 + w.state.seed) * 31 + w.state.deco.removed.length) * 31 + boulders) * 31 + planSig(w)) | 0;
    },
    input: () => decoInput(getWorld()),
    hover: () => interaction.hover,
    selected: () => interaction.selectedDeco,
    hideKey: () => {
      const g = interaction.preview();
      return g.map((p) => `${p.x},${p.y}`).join(';');
    },
    hiddenAt: (x, y) => interaction.preview().some((p) => x >= p.x && y >= p.y && x < p.x + getWorld().defs[p.kind]!.size && y < p.y + getWorld().defs[p.kind]!.size),
  };
}

/** Changes whenever the queue of ghosts changes (deco steps aside as soon as a ghost is queued, not only once the drone starts it). */
function planSig(w: World): number {
  let h = w.state.plans.length;
  for (const p of w.state.plans) h = (Math.imul(h, 31) + p.x * 4099 + p.y * 7 + p.kind) | 0;
  return h;
}

function boulderCount(w: World): number {
  const b = w.state.map.boulder;
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i]) n++;
  return n;
}

function cellOf(map: World['state']['map'], i: number): number {
  if (!map.ground[i] || map.ridge[i]) return BLOCK;
  if (map.floor[i]) return KEEP;
  return map.boulder[i] ? ROUGH : FREE;
}

/** Whether a finished building takes part in the cable network. */
function isNode(w: World, b: Building, def: BuildingDef): boolean {
  return !FLAT.has(def.behaviour) && def.behaviour !== 'power-node' && (def.size > 1 || SMALL_MACHINES.has(def.behaviour)) && w.ready(b);
}

export function decoInput(w: World): DecoInput {
  const { map } = w.state;
  const cells = new Uint8Array(map.w * map.h);
  for (let i = 0; i < cells.length; i++) cells[i] = cellOf(map, i);
  // queued ghosts are spoken for: no prop and no cable under them, so the deco has already stepped aside when the drone starts
  for (const p of w.state.plans) wall(cells, map.w, p.x, p.y, w.defs[p.kind]!);
  const buildings: DecoBuilding[] = [];
  for (const b of w.state.buildings) {
    const def = w.def(b);
    wall(cells, map.w, b.x, b.y, def);
    if (isNode(w, b, def)) buildings.push({ x: b.x, y: b.y, w: def.size, h: def.size, art: ART_BY_BEHAVIOUR[def.behaviour] ?? 'other', node: true });
  }
  // tiles where the player removed a prop: free for cables, never a prop again (they still hold their place in the spacing)
  for (const i of w.state.deco.removed) if (cells[i] === FREE || cells[i] === ROUGH) cells[i] = REMOVED;
  return { w: map.w, h: map.h, seed: w.state.seed, cells, buildings };
}

/** A footprint is a wall to the deco; belts and pipes are belts (cables never cross them either, but props are not planned on them). */
function wall(cells: Uint8Array, w: number, x: number, y: number, def: BuildingDef): void {
  fillCells(cells, w, x, y, def.size, FLAT.has(def.behaviour) ? BELT : BLOCK);
}

function fillCells(cells: Uint8Array, w: number, x0: number, y0: number, size: number, c: number): void {
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) cells[y * w + x] = c;
}
