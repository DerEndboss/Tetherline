import { useEffect, useState } from 'react';
import { inspectTile } from '../../game/inspect/inspect';
import { Icon } from '../components/Icon';
import { useLastDefined, usePresence } from '../components/Presence';
import { useInteraction, useServices } from '../context';
import './deco-card.css';

/**
 * Whether the last press on the page came from a finger or a pen. The mouse has the hover card and the right
 * click; only touch needs a card to tap (and a button to press) for decoration.
 */
function useTouchLast(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const on = (e: PointerEvent): void => setTouch(e.pointerType !== 'mouse');
    window.addEventListener('pointerdown', on, true);
    return () => window.removeEventListener('pointerdown', on, true);
  }, []);
  return touch;
}

/**
 * The card for a decoration piece the player tapped on a touch screen:
 * its name and a clear Remove button, bottom centre like the pause badge. A long press on the piece removes it too
 * (render/input.ts); with a mouse the hover card and Backspace / right click do all of this. It rises in and sinks
 * away with the selection (Presence), keeping the name while it leaves.
 */
export function DecoCard() {
  const { game, interaction } = useServices();
  const { decoSelected } = useInteraction();
  const touch = useTouchLast();
  const open = decoSelected !== null && touch;
  // the inspector answers while the piece stands; the name stays on the card while it sinks away
  const name = decoSelected ? (inspectTile(game.world, decoSelected.x, decoSelected.y)?.title ?? 'Decoration') : undefined;
  const shown = useLastDefined(open ? name : undefined);
  const { mounted, attrs } = usePresence(open, 'up');
  if (!mounted || !shown) return null;
  return (
    <div className="hud-card deco-card" role="group" aria-label={shown} {...attrs}>
      <span className="deco-icon k-plaque">
        <Icon name="info" size={20} />
      </span>
      <div className="deco-text">
        <span className="deco-name">{shown}</span>
        <span className="deco-sub">Decoration, no effect</span>
      </div>
      <button type="button" className="button button-danger-go deco-remove" onClick={() => interaction.removeSelectedDeco()}>
        Remove
      </button>
      <button type="button" className="button button-quiet deco-close" aria-label="Close" onClick={() => interaction.cancel()}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
