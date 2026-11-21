import { useRef, useState, type CSSProperties } from 'react';
import { fromSaveRecord, recordToText, textToRecord, type SlotSummary } from '../../save/serialize';
import { deleteSlot, readSlot, writeSlot, type SlotInfo } from '../../save/slots';
import { Icon } from '../components/Icon';
import { useServices } from '../context';
import { PIcon } from './icons';
import { continueSlot } from './launch';
import { savedWhen, slotFacts } from './view';

async function exportSlot(slot: number): Promise<void> {
  const raw = await readSlot(slot);
  if (!raw) return;
  const blob = new Blob([recordToText(raw as Parameters<typeof recordToText>[0])], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tetherline-slot-${slot}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** The Import button and its hidden file input, shared by the empty slot (a file becomes this slot's round). */
function ImportButton({ slot, onChange }: { slot: number; onChange: () => void }) {
  const services = useServices();
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const importFile = async (f: File): Promise<void> => {
    try {
      const raw = textToRecord(await f.text());
      if (!fromSaveRecord(raw, services.game.content)) throw new Error('not a Tetherline save');
      await writeSlot(slot, raw as Parameters<typeof writeSlot>[1]);
      setError('');
      onChange();
    } catch {
      setError('That file is not a Tetherline save.');
    }
  };
  return (
    <>
      <button type="button" className="button button-quiet" data-tip="Load a round from a .json file" onClick={() => file.current?.click()}>
        <PIcon name="import" size={16} />
        Import
      </button>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importFile(f);
        }}
      />
      {error && (
        <p className="slot-error k-enter" data-from="up" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </>
  );
}

function ExportButton({ slot }: { slot: number }) {
  return (
    <button type="button" className="button button-quiet" data-tip="Save this round as a .json file" onClick={() => void exportSlot(slot)}>
      <PIcon name="export" size={16} />
      Export
    </button>
  );
}

/**
 * The round in play: the big Resume button at the top of the menu is the one way back, so this row has none. It can save
 * on the spot and export. No Delete: the round is still running and the next autosave would write it again.
 */
function RunningActions({ info, onChange }: { info: SlotInfo; onChange: () => void }) {
  const { saveNow } = useServices();
  return (
    <div className="slot-actions">
      <button type="button" className="button button-quiet" data-tip="Save this round now" onClick={() => void saveNow().then(onChange)}>
        <Icon name="check" size={16} />
        Save now
      </button>
      {info.summary && <ExportButton slot={info.slot} />}
    </div>
  );
}

function EmptyActions({ slot, onChange, onNew }: { slot: number; onChange: () => void; onNew: () => void }) {
  return (
    <div className="slot-actions">
      <button type="button" className="button" onClick={onNew}>
        New
      </button>
      <ImportButton slot={slot} onChange={onChange} />
    </div>
  );
}

function SavedActions({ info, summary, onChange }: { info: SlotInfo; summary: SlotSummary; onChange: () => void }) {
  const services = useServices();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="slot-actions">
      <button type="button" className="button button-go" onClick={() => void continueSlot(services, info.slot, summary.theme)}>
        <Icon name="play" size={16} />
        Continue
      </button>
      <ExportButton slot={info.slot} />
      {!confirm && (
        <button type="button" className="button button-quiet" data-tip="Delete this round" onClick={() => setConfirm(true)}>
          <PIcon name="trash" size={16} />
          Delete
        </button>
      )}
      {confirm && (
        <>
          <button type="button" className="button button-danger k-enter" data-from="right" onClick={() => void deleteSlot(info.slot).then(onChange)}>
            Delete for good
          </button>
          <button type="button" className="button button-quiet k-enter" data-from="right" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </>
      )}
    </div>
  );
}

function SlotActions({ info, current, onChange, onNew }: { info: SlotInfo; current: boolean; onChange: () => void; onNew: () => void }) {
  if (current) return <RunningActions info={info} onChange={onChange} />;
  if (!info.summary) return <EmptyActions slot={info.slot} onChange={onChange} onNew={onNew} />;
  return <SavedActions info={info} summary={info.summary} onChange={onChange} />;
}

function SlotRow({ info, index, onChange, onNew }: { info: SlotInfo; index: number; onChange: () => void; onNew: (slot: number) => void }) {
  const { game } = useServices();
  const s = info.summary;
  const current = game.slot === info.slot && game.world.state.tick > 0;
  const empty = !s && !current;
  return (
    <li className="slot k-enter" data-from="up" data-current={current} data-empty={empty} style={{ ['--k-delay' as string]: `${index * 40}ms` } as CSSProperties}>
      <span className="slot-num k-plaque num">{info.slot}</span>
      <div className="slot-text">
        <p className="slot-name">
          {empty ? 'Empty slot' : `Slot ${info.slot}`}
          {current ? <span className="slot-tag">Playing</span> : null}
        </p>
        {s ? (
          <ul className="slot-facts" aria-label="Round facts">
            {slotFacts(game.content, s).map((f) => (
              <li key={f} className="k-chip">
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted slot-sub">{current ? 'This round, saving soon' : 'Start a round here or import one'}</p>
        )}
        {s && <p className="muted slot-when">Saved {savedWhen(info.savedAt)}</p>}
      </div>
      <SlotActions info={info} current={current} onChange={onChange} onNew={() => onNew(info.slot)} />
    </li>
  );
}

/** The three save slots (autosave keeps the running one up to date, see save/autosave.ts). */
export function Slots({ slots, onChange, onNew }: { slots: SlotInfo[]; onChange: () => void; onNew: (slot: number) => void }) {
  return (
    <ul className="slots">
      {slots.map((s, i) => (
        <SlotRow key={s.slot} info={s} index={i} onChange={onChange} onNew={onNew} />
      ))}
    </ul>
  );
}
