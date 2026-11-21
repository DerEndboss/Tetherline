import type { UiSound } from './types';

/**
 * Every control of the HUD makes a small sound, without each component knowing about audio: one listener on the
 * UI root reads what was pressed. A control can name its sound with `data-sound` (or `none`); otherwise its role
 * decides: dock tabs open and close, sub-tabs tick, the one primary action confirms, toggles click up or down,
 * close buttons blip down, disabled actions knock, sliders tick at a pitch that follows the value.
 */
export function uiSoundFor(el: Element): UiSound | null {
  const named = el.getAttribute('data-sound');
  if (named === 'none') return null;
  if (named) return named as UiSound;
  for (const rule of RULES) {
    const kind = rule(el);
    if (kind) return kind;
  }
  return 'click';
}

/** In order: the first rule that names a sound wins. */
const RULES: ((el: Element) => UiSound | null)[] = [
  (el) => (el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled ? 'disabled' : null),
  (el) => {
    const expanded = el.getAttribute('aria-expanded');
    return expanded === null ? null : expanded === 'true' ? 'close' : 'open';
  },
  (el) => (el.getAttribute('role') === 'tab' ? 'tab' : null),
  (el) => {
    const pressed = el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked');
    return pressed === null ? null : pressed === 'true' ? 'toggle-off' : 'toggle-on';
  },
  (el) => (/^close\b/i.test(el.getAttribute('aria-label') ?? '') ? 'close' : null),
  (el) => (el.classList.contains('button-primary') ? 'confirm' : null),
];

export function attachUiSounds(root: HTMLElement, play: (kind: UiSound, value?: number) => void): () => void {
  // Capture phase: the control's state (aria-expanded, aria-pressed) is read before React flips it.
  const onClick = (e: MouseEvent): void => {
    const el = (e.target as Element | null)?.closest('button, [role="tab"], [role="switch"], a[href]');
    if (!el || !root.contains(el)) return;
    const kind = uiSoundFor(el);
    if (kind) play(kind);
  };
  const onInput = (e: Event): void => {
    const el = e.target as HTMLInputElement | null;
    if (!el || el.type !== 'range' || el.getAttribute('data-sound') === 'none') return;
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    play('slide', max > min ? (Number(el.value) - min) / (max - min) : 0.5);
  };
  root.addEventListener('click', onClick, true);
  root.addEventListener('input', onInput, true);
  return () => {
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('input', onInput, true);
  };
}
