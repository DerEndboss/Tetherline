import type { InteractionView } from '../../game/interaction';

export interface HintItem {
  k?: string;
  t: string;
}

export interface HintData {
  lead?: string;
  items: HintItem[];
}

const IDLE: HintData = {
  items: [
    { k: 'X', t: 'Demolish' },
    { k: 'Q', t: 'Pick' },
    { k: 'H', t: 'Home' },
    { k: 'P', t: 'Pause' },
    { k: 'WASD', t: 'Move' },
  ],
};

/** What the tool in hand does: a lead line and the keys that matter now. */
export function hintOf(view: InteractionView, name: string, drag: string): HintData {
  switch (view.mode.kind) {
    case 'place':
      return { lead: `Placing ${name}`, items: [{ k: 'R', t: 'Rotate' }, { t: `Drag for a ${drag}` }, { k: 'Shift', t: 'Fill' }, { t: 'Right click to stop' }] };
    case 'remove':
      return { lead: 'Demolishing', items: [{ t: 'Drag a rectangle' }, { t: 'Materials come back' }, { k: 'Esc', t: 'Stop' }] };
    case 'select':
      return { lead: 'Copy', items: [{ t: 'Drag a rectangle over your build' }, { k: 'Esc', t: 'Stop' }] };
    case 'paste':
      return { lead: `Blueprint ${view.clip ? `${view.clip.w}x${view.clip.h}` : ''}`.trim(), items: [{ t: 'Click to place' }, { k: 'R', t: 'Turn' }, { k: 'F', t: 'Mirror' }, { k: 'Esc', t: 'Stop' }] };
    default:
      return IDLE;
  }
}

