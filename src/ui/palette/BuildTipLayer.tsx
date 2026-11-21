import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePresence, useLastDefined } from '../components/Presence';
import { useServices } from '../context';
import { BuildTooltip } from './Tooltip';
import { tipStore, useTip } from './tip-store';
import { isUnlocked } from './unlock';

/**
 * Draws the palette tooltip for tip-store.ts. It comes in from the side it hangs on and leaves quicker (Presence); while
 * it is shown, moving to another entry swaps the content and glides the card across (see BuildTooltip).
 */
export function BuildTipLayer() {
  const { game } = useServices();
  const { shown } = useTip();
  const last = useLastDefined(shown);
  const open = shown !== null;
  // Escape, a scroll, another window or a press on the map send the tooltip away.
  useEffect(() => {
    if (!open) return;
    const away = (): void => tipStore.dismiss();
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') away();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', away);
    document.addEventListener('scroll', away, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', away);
      document.removeEventListener('scroll', away, { capture: true });
    };
  }, [open]);
  const { mounted, attrs } = usePresence(open, last?.side === 'left' ? 'right' : 'up');
  if (!mounted || !last) return null;
  // a portal: the tutorial's layer lies outside the HUD (above it), so a tip inside the HUD would sit under its ring and card
  return createPortal(<BuildTooltip view={last} locked={!isUnlocked(game.world, last.def)} {...attrs} />, document.body);
}
