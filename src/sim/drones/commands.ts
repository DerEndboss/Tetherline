import type { Command } from '../commands';
import { clearBoulders } from '../construction';
import { registerCommand } from '../tick';
import type { World } from '../world';
import type { TickContext } from '../blocks/types';
import { canSupply } from './haul';
import { boulderAt } from './jobs';
import { canAfford, helperPrice, MAX_LEVEL, nextPrice, opsOf, pay, techOf } from './tech';
import type { DroneCommands } from './types';

/**
 * The drone commands. This module imports tick.ts, so it must be imported by whoever sends the commands
 * (src/ui/drones, tests, headless runs) and never by tick.ts itself: it registers on load.
 */

type DroneHandler<K extends keyof DroneCommands> = (w: World, c: DroneCommands[K], ctx: TickContext) => void;

/** Registers a drone command (cast until tick.ts's handler table accepts modules' own commands). */
function on<K extends keyof DroneCommands>(type: K, handler: DroneHandler<K>): void {
  (registerCommand as unknown as (t: string, h: unknown) => void)(type, handler);
}

/** Builds a drone command for `game.enqueue`. */
export function droneCommand<K extends keyof DroneCommands>(type: K, payload: DroneCommands[K]): Command {
  return { type, ...payload } as unknown as Command;
}

function normal(r: { x0: number; y0: number; x1: number; y1: number }) {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}

registerCommand('clear-boulders', (w, c) => {
  const r = normal(c);
  const queue = opsOf(w).boulders;
  const { map } = w.state;
  for (let y = Math.max(0, r.y0); y <= Math.min(map.h - 1, r.y1); y++) {
    for (let x = Math.max(0, r.x0); x <= Math.min(map.w - 1, r.x1); x++) {
      const tile = y * map.w + x;
      if (boulderAt(w, tile) && !queue.includes(tile)) queue.push(tile);
    }
  }
  // no drone to do it (test worlds): clear at once, like before
  if (w.state.drones.length === 0) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) clearBoulders(w, x, y, 1);
});

on('drone-upgrade', (w, c, ctx) => {
  const price = nextPrice(w, c.track);
  const tech = techOf(w);
  if (!price || tech[c.track] >= MAX_LEVEL || !canAfford(w, price)) return;
  pay(w, price);
  tech[c.track]++;
  ctx.events.push({ type: 'drone-upgraded', track: c.track, level: tech[c.track] });
});

on('drone-add', (w, _c, ctx) => {
  const price = helperPrice(w);
  const core = w.core;
  if (!price || !core || !canAfford(w, price)) return;
  pay(w, price);
  const id = Math.max(-1, ...w.state.drones.map((d) => d.id)) + 1;
  const size = w.def(core).size;
  w.state.drones.push({ id, x: core.x + size / 2, y: core.y + size / 2, task: 'idle', target: -1, waiting: '', act: 'idle' });
  ctx.events.push({ type: 'drone-added', id });
});

on('drone-focus', (w, c) => {
  opsOf(w).focus = c.on ? { x: c.x, y: c.y } : null;
});

on('drone-supply', (w, c) => {
  const ops = opsOf(w);
  if (c.id < 0) {
    ops.supply = [];
    return;
  }
  const b = w.byId.get(c.id);
  if (!b || !canSupply(w, b)) return;
  ops.supply = ops.supply.includes(c.id) ? ops.supply.filter((id) => id !== c.id) : [...ops.supply, c.id];
});

on('drone-mine', (w, c) => {
  opsOf(w).mine = c.item === 'auto' ? -1 : c.item === 'off' ? -2 : w.content.materials.indexOf(c.item);
});
