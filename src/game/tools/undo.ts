import type { Command, PlanSpec } from '../../sim/commands';
import type { Dir } from '../../sim/state';
import type { World } from '../../sim/world';

/**
 * One undoable player action. Placing and demolishing are remembered as what they were (plan specs), not as
 * building ids, so they survive the drone building or removing things in between.
 */
export type UndoEntry =
  | { type: 'place'; plans: PlanSpec[] }
  | { type: 'demolish'; plans: PlanSpec[] }
  | { type: 'rotate'; id: number; from: Dir; to: Dir }
  | { type: 'group'; entries: UndoEntry[] };

const LIMIT = 100;

/** A building or ghost at this spot of exactly this kind (so undo never touches something else built there since). */
function standsThere(w: World, p: PlanSpec): boolean {
  const kind = w.content.buildings.indexOf(p.kind);
  const b = w.at(p.x, p.y);
  if (b && b.kind === kind && b.x === p.x && b.y === p.y) return true;
  return w.state.plans.some((o) => o.kind === kind && o.x === p.x && o.y === p.y);
}

function removeCommands(w: World, plans: PlanSpec[]): Command[] {
  return plans.filter((p) => standsThere(w, p)).map((p) => ({ type: 'remove', x0: p.x, y0: p.y, x1: p.x, y1: p.y }));
}

/** The commands that apply an entry forwards (`redo`) or backwards (`undo`) in this world. */
export function commandsFor(w: World, e: UndoEntry, forward: boolean): Command[] {
  switch (e.type) {
    case 'place':
      return forward ? [{ type: 'place-many', plans: e.plans }] : removeCommands(w, e.plans);
    case 'demolish':
      return forward ? removeCommands(w, e.plans) : [{ type: 'place-many', plans: e.plans }];
    case 'rotate':
      return [{ type: 'rotate', id: e.id, rot: forward ? e.to : e.from }];
    case 'group':
      return (forward ? e.entries : [...e.entries].reverse()).flatMap((x) => commandsFor(w, x, forward));
  }
}

/** Ctrl+Z / Ctrl+Shift+Z history of this run's build actions (cleared when another world is loaded). */
export class UndoStack {
  private past: UndoEntry[] = [];
  private future: UndoEntry[] = [];

  get undoCount(): number {
    return this.past.length;
  }

  get redoCount(): number {
    return this.future.length;
  }

  /** A new action: the redo history is gone. */
  record(e: UndoEntry): void {
    this.past.push(e);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }

  /** Steps back; returns the commands to send (empty when there is nothing to undo). */
  undo(w: World): Command[] {
    const e = this.past.pop();
    if (!e) return [];
    this.future.push(e);
    return commandsFor(w, e, false);
  }

  redo(w: World): Command[] {
    const e = this.future.pop();
    if (!e) return [];
    this.past.push(e);
    return commandsFor(w, e, true);
  }
}
