import type { Interaction } from './interaction';

/** Whether a key event belongs to a text field (typing a seed must not rotate belts). */
export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

type Run = (e: KeyboardEvent) => void;

/** Keys without a modifier (Shift may change what they do). */
function plainKeys(i: Interaction): Record<string, Run> {
  return {
    r: (e) => i.rotate(e.shiftKey ? -1 : 1),
    f: () => i.flip(),
    q: () => i.pipette(),
    escape: () => i.cancel(),
    x: () => (i.getView().mode.kind === 'remove' ? i.cancel() : i.startRemoving()),
    b: () => (i.getView().mode.kind === 'select' ? i.cancel() : i.startSelecting()),
    delete: () => i.demolishAtCursor(),
    backspace: () => i.demolishAtCursor(),
  };
}

/** Ctrl (or Cmd) combinations: undo, redo, copy an area, paste. */
function chordKeys(i: Interaction): Record<string, Run> {
  return {
    z: (e) => (e.shiftKey ? i.redo() : i.undo()),
    y: () => i.redo(),
    c: () => i.startSelecting(),
    v: () => i.pasteBlueprint(),
  };
}

/**
 * World hotkeys (PC first): R rotate (Shift+R back), F mirror a blueprint, Q pipette, X demolish tool,
 * Delete/Backspace demolish under the cursor (or clear a boulder / decoration), B or Ctrl+C copy an area,
 * Ctrl+V paste, Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo, Escape stop. Shift and Ctrl are also tracked for
 * the drag tools. 1-9 pick from the palette or hotbar (handled there, which knows its tab or slots).
 */
export function attachHotkeys(interaction: Interaction): () => void {
  const plain = plainKeys(interaction);
  const chord = chordKeys(interaction);
  const mods = (e: KeyboardEvent | PointerEvent): void => interaction.setModifiers(e.shiftKey, e.ctrlKey || e.metaKey);
  const onKey = (e: KeyboardEvent): void => {
    mods(e);
    if (e.type !== 'keydown' || isTextEntry(e.target) || e.altKey) return;
    const table = e.ctrlKey || e.metaKey ? chord : plain;
    const run = table[e.key.toLowerCase()];
    if (!run) return;
    run(e);
    e.preventDefault();
  };
  const reset = (): void => interaction.setModifiers(false, false);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('pointermove', mods, { passive: true });
  window.addEventListener('pointerdown', mods, { passive: true });
  window.addEventListener('blur', reset);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('pointermove', mods);
    window.removeEventListener('pointerdown', mods);
    window.removeEventListener('blur', reset);
  };
}
