import { useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from 'react';
import type { Blueprint } from '../../game/tools/blueprint';
import { blueprintLibrary } from '../../game/tools/library';
import { Icon } from '../components/Icon';
import { Presence, usePresenceList } from '../components/Presence';
import { tip } from '../components/TipLayer';
import { useInteraction, useServices } from '../context';
import { useCompact } from './compact';
import { useEscapeClose } from './escape';
import { ToolIcon } from './icons';

/** The footprint of a blueprint as a tiny plan: machines in teal, belts and the rest in grey. */
function Footprint({ bp }: { bp: Blueprint }) {
  return (
    <svg className="bp-foot" viewBox={`0 0 ${bp.w} ${bp.h}`} preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges" aria-hidden="true">
      {bp.items.map((it, i) => (
        <rect key={i} className={it.size > 1 ? 'bp-cell big' : 'bp-cell'} x={it.x + 0.08} y={it.y + 0.08} width={it.size - 0.16} height={it.size - 0.16} rx={0.12} />
      ))}
    </svg>
  );
}

function Empty({ compact }: { compact: boolean }) {
  return (
    <div className="bp-empty k-well">
      <span className="k-plaque bp-empty-icon">
        <ToolIcon name="blueprint" size={22} />
      </span>
      <p>
        No blueprints yet. {compact ? 'Tap Copy' : <>Press <kbd className="keycap">B</kbd></>}, drag over your build, then save it here.
      </p>
    </div>
  );
}

function SaveForm() {
  const { interaction } = useServices();
  const view = useInteraction();
  const [name, setName] = useState('');
  const clip = view.clip;
  if (!clip) return null;
  const save = (): void => {
    if (!interaction.clip) return;
    blueprintLibrary.save(interaction.clip, name || blueprintLibrary.suggestName());
    setName('');
  };
  return (
    <form
      className="bp-save k-enter"
      data-from="up"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="bp-clip">
        <ToolIcon name="copy" size={16} />
        <span>
          Copied <b className="num">{clip.w}x{clip.h}</b> · {clip.count} {clip.count === 1 ? 'part' : 'parts'}
        </span>
      </p>
      <div className="bp-save-row">
        <input value={name} maxLength={40} placeholder={blueprintLibrary.suggestName()} aria-label="Blueprint name" autoComplete="off" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="button button-primary bp-save-btn">
          Save
        </button>
      </div>
    </form>
  );
}

function List({ items, onPaste }: { items: readonly Blueprint[]; onPaste: (bp: Blueprint) => void }) {
  const entries = usePresenceList(items, (b) => b.name, 'left');
  return (
    <ul className="bp-list">
      {entries.map(({ key, item: bp, attrs }, i) => (
        <li key={key} className="bp-row" {...attrs} style={{ '--k-delay': `${Math.min(i, 6) * 28}ms` } as CSSProperties}>
          <button type="button" className="k-press bp-paste" {...tip('Put it in hand, then click to place', { keys: 'Ctrl+V' })} onClick={() => onPaste(bp)}>
            <span className="k-plaque bp-plan">
              <Footprint bp={bp} />
            </span>
            <span className="bp-name">{bp.name}</span>
            <span className="bp-meta">
              <span className="num">{bp.w}x{bp.h}</span> · {bp.items.length} {bp.items.length === 1 ? 'part' : 'parts'}
            </span>
          </button>
          <button type="button" className="button button-quiet ibtn ibtn-sm bp-del" aria-label={`Delete ${bp.name}`} {...tip('Delete')} onClick={() => blueprintLibrary.remove(bp.name)}>
            <ToolIcon name="trash" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Saved blueprints of this device: the plan of each one, paste it into your hand, delete it, and name the area
 * that was just copied. Rises above the tool bar (a bottom sheet on phones) and sinks away again.
 */
export function Blueprints({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { interaction } = useServices();
  const compact = useCompact();
  useSyncExternalStore(blueprintLibrary.subscribe, blueprintLibrary.getVersion);
  const list = blueprintLibrary.list();
  useEscapeClose(open, onClose);
  const paste = (bp: Blueprint): void => {
    interaction.pasteBlueprint(bp);
    onClose();
  };
  return (
    <Presence open={open} from="up" className="bp-panel hud-card" role="region" aria-label="Blueprints">
      <header className="k-head bp-head">
        <h2 className="k-title">Blueprints</h2>
        {list.length > 0 && <span className="k-chip">{list.length}</span>}
        <button type="button" className="button button-quiet ibtn ibtn-sm bp-close" aria-label="Close blueprints" data-sound="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="bp-body k-scroll">
        <SaveForm />
        {list.length === 0 && <Empty compact={compact} />}
        <List items={list} onPaste={paste} />
      </div>
    </Presence>
  );
}
