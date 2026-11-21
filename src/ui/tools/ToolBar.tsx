import { useState, useSyncExternalStore } from 'react';
import { usePresence } from '../components/Presence';
import { tip } from '../components/TipLayer';
import { blueprintLibrary } from '../../game/tools/library';
import type { InteractionView } from '../../game/interaction';
import { useInteraction, useServices, useSnapshot } from '../context';
import { Blueprints } from './Blueprints';
import { useCompact } from './compact';
import { hintOf } from './hints';
import { ToolIcon, type ToolIconName } from './icons';

function Key({ k }: { k: string }) {
  return <kbd className="keycap">{k}</kbd>;
}

function ToolHint() {
  const { game } = useServices();
  const view = useInteraction();
  const id = view.mode.kind === 'place' ? view.mode.building : '';
  const def = id ? game.content.buildings.find(id) : undefined;
  const drag = def?.behaviour === 'power-node' ? 'pole line' : def?.rotates ? 'line' : 'row';
  const hint = hintOf(view, def?.name ?? id, drag);
  return (
    <p className="tb-hint k-enter" data-from="up" key={`${view.mode.kind}:${id}`} role="status">
      {hint.lead && <b className="tb-lead">{hint.lead}</b>}
      {hint.items.map((i) => (
        <span key={i.t} className="tb-item">
          {i.k && <Key k={i.k} />}
          {i.t}
        </span>
      ))}
    </p>
  );
}

/** What the drone has queued, and what holds it up. Only while there is something to build. */
function DroneLine() {
  const { game } = useServices();
  const snap = useSnapshot();
  const todo = snap.ghosts + snap.sites;
  if (!todo) return null;
  const waiting = snap.drone.waiting ? (game.content.materials.find(snap.drone.waiting)?.name ?? snap.drone.waiting) : '';
  return (
    <span className="tb-drone k-enter" data-from="fade" data-wait={waiting !== ''}>
      <ToolIcon name="drone" size={14} />
      <span className="num">{todo}</span> to build{waiting ? <b>needs {waiting}</b> : null}
    </span>
  );
}

interface ButtonProps {
  icon: ToolIconName;
  label: string;
  /** Tooltip text (default: the label) and keys. */
  tipText?: string;
  keys?: string;
  tool?: string;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
  badge?: number;
  onClick: () => void;
}

function ToolButton({ icon, label, tipText, keys, tool, pressed, expanded, disabled, iconOnly, badge, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      className={iconOnly ? 'button tb-btn ibtn' : 'button tb-btn'}
      aria-label={iconOnly ? label : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-disabled={disabled || undefined}
      data-tool={tool}
      {...tip(tipText ?? label, keys ? { keys } : {})}
      onClick={() => !disabled && onClick()}
    >
      <ToolIcon name={icon} size={18} />
      {!iconOnly && <span className="tb-label">{label}</span>}
      {badge ? <span className="k-badge tb-badge">{badge}</span> : null}
    </button>
  );
}

interface RowProps {
  iconOnly: boolean;
  blueprintsOpen: boolean;
  onBlueprints: () => void;
  /** Called after a button that starts a tool (the phone menu closes itself). */
  after?: () => void;
}

/** Undo, redo, copy, paste, blueprints: the same buttons on the bar and in the phone menu. */
function Tools({ iconOnly, blueprintsOpen, onBlueprints, after }: RowProps) {
  const { interaction } = useServices();
  const view = useInteraction();
  const saved = useSyncExternalStore(blueprintLibrary.subscribe, () => blueprintLibrary.list().length);
  const paste = usePresence(view.clip !== null, 'left');
  const done = (): void => after?.();
  return (
    <>
      <ToolButton icon="undo" label="Undo" keys="Ctrl+Z" iconOnly={iconOnly} disabled={!view.undo} onClick={() => interaction.undo()} />
      <ToolButton icon="redo" label="Redo" keys="Ctrl+Shift+Z" iconOnly={iconOnly} disabled={!view.redo} onClick={() => interaction.redo()} />
      <span className="tb-gap" aria-hidden="true" />
      <ToolButton
        icon="copy"
        label="Copy"
        tipText="Copy an area"
        keys="B"
        tool="copy"
        pressed={view.mode.kind === 'select'}
        onClick={() => {
          interaction.startSelecting();
          done();
        }}
      />
      {paste.mounted && (
        <span className="tb-pop" {...paste.attrs}>
          <ToolButton
            icon="paste"
            label="Paste"
            tipText="Put the copy in hand"
            keys="Ctrl+V"
            pressed={view.mode.kind === 'paste'}
            onClick={() => {
              interaction.pasteBlueprint();
              done();
            }}
          />
        </span>
      )}
      <ToolButton icon="blueprint" label="Blueprints" tipText="Saved blueprints" tool="blueprints" expanded={blueprintsOpen} badge={saved} onClick={onBlueprints} />
    </>
  );
}

/** Finishes the tool in hand. */
function DoneButton({ view, compact }: { view: InteractionView; compact: boolean }) {
  const { interaction } = useServices();
  const { mounted, attrs } = usePresence(view.mode.kind !== 'none', compact ? 'up' : 'left');
  if (!mounted) return null;
  return (
    <button type="button" className="button button-primary tb-btn tb-done" {...attrs} {...tip('Put the tool down', { keys: 'Esc' })} onClick={() => interaction.cancel()}>
      <ToolIcon name="done" size={18} />
      <span className="tb-label">Done</span>
    </button>
  );
}

function Bar({ blueprints, setBlueprints }: { blueprints: boolean; setBlueprints: (v: boolean) => void }) {
  const view = useInteraction();
  return (
    <div className="toolbar hud-card">
      <div className="tb-top">
        <ToolHint />
        <DroneLine />
      </div>
      <div className="tb-row">
        <Tools iconOnly={false} blueprintsOpen={blueprints} onBlueprints={() => setBlueprints(!blueprints)} />
        <DoneButton view={view} compact={false} />
      </div>
    </div>
  );
}

/** Phones: one plate on the left edge. It is the Done button while a tool is in hand, else it opens the tool menu. */
function Fab({ blueprints, setBlueprints }: { blueprints: boolean; setBlueprints: (v: boolean) => void }) {
  const { interaction } = useServices();
  const view = useInteraction();
  const [menu, setMenu] = useState(false);
  const { mounted, attrs } = usePresence(menu, 'up');
  const active = view.mode.kind !== 'none';
  const press = (): void => {
    if (active) return interaction.cancel();
    setMenu(!menu);
  };
  return (
    <>
      {mounted && (
        <div className="tb-menu hud-card" role="group" aria-label="Tools" {...attrs}>
          <Tools iconOnly={false} blueprintsOpen={blueprints} onBlueprints={() => { setBlueprints(!blueprints); setMenu(false); }} after={() => setMenu(false)} />
        </div>
      )}
      <button
        type="button"
        className={active ? 'hud-card tb-fab k-press lit' : 'hud-card tb-fab k-press'}
        aria-expanded={active ? undefined : menu}
        aria-label={active ? 'Done' : 'Tools'}
        data-tool="menu"
        data-sound={active ? 'confirm' : undefined}
        onClick={press}
      >
        <ToolIcon name={active ? 'done' : 'tools'} size={22} />
        <span className="tb-fab-label">{active ? 'Done' : 'Tools'}</span>
      </button>
    </>
  );
}

/** What the current tool does and how to leave it, undo and redo, the blueprints; the drone's queue. Bottom left. */
export function ToolBar() {
  const compact = useCompact();
  const [blueprints, setBlueprints] = useState(false);
  return (
    <div className="toolbar-wrap" data-compact={compact}>
      <Blueprints open={blueprints} onClose={() => setBlueprints(false)} />
      {compact ? <Fab blueprints={blueprints} setBlueprints={setBlueprints} /> : <Bar blueprints={blueprints} setBlueprints={setBlueprints} />}
    </div>
  );
}

