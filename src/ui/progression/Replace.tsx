import { useEffect, useState } from 'react';
import type { SlotInfo } from '../../save/slots';
import type { RunOptions } from '../../sim/newgame';
import { useServices } from '../context';
import { savedWhen, slotFacts } from './view';

/** A new round that has to wait for the player's word: what to start, and the saves it may replace. */
export interface Ask {
  opts: RunOptions;
  choices: SlotInfo[];
}

interface Props {
  ask: Ask;
  onPick: (slot: number) => void;
  onCancel: () => void;
}

/**
 * Every slot holds a round and a new one needs room: the player picks which save goes, or keeps them all. Nothing is
 * ever replaced without this. The oldest save is chosen to start with; Esc and "Keep my saves" change nothing.
 */
export function ReplaceDialog({ ask, onPick, onCancel }: Props) {
  const { game } = useServices();
  const [slot, setSlot] = useState(ask.choices[0]?.slot ?? 1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  return (
    <div className="replace k-enter" data-from="pop" role="dialog" aria-modal="true" aria-labelledby="replace-title" aria-describedby="replace-text">
      <h2 id="replace-title" className="replace-title">
        Which save should go?
      </h2>
      <p id="replace-text" className="muted replace-text">
        Every slot holds a round, and the new one needs room. Pick the save it replaces. That round is gone for good.
      </p>
      <fieldset className="replace-list">
        <legend className="visually-hidden">Save to replace</legend>
        {ask.choices.map((c, i) => (
          <label key={c.slot} className="seg-option opt-card replace-slot">
            <input type="radio" name="replace-slot" checked={slot === c.slot} onChange={() => setSlot(c.slot)} />
            <span className="k-plaque replace-num num">{c.slot}</span>
            <span className="opt-body">
              <span className="opt-name">
                Slot {c.slot}
                {i === 0 && ask.choices.length > 1 ? <span className="k-chip opt-soon">Oldest</span> : null}
              </span>
              {c.summary && (
                <ul className="slot-facts" aria-label="Round facts">
                  {slotFacts(game.content, c.summary).map((f) => (
                    <li key={f} className="k-chip">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <span className="opt-sub">Saved {savedWhen(c.savedAt)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="replace-actions">
        <button type="button" className="button button-quiet" onClick={onCancel} autoFocus>
          Keep my saves
        </button>
        <button type="button" className="button button-danger-go" onClick={() => onPick(slot)}>
          Replace Slot {slot}
        </button>
      </div>
    </div>
  );
}
