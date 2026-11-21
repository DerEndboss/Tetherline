import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { VIEW_MODES } from '../../render/iso';
import { CHANNELS, SPEEDS, type Channel } from '../../settings/preferences';
import { Icon } from '../components/Icon';
import { Presence } from '../components/Presence';
import { PaletteSettings } from '../palette/settings';
import { SoundSettings } from '../sound/settings';
import { ToolsSettings } from '../tools/settings';
import { WorldSettings } from '../world/settings';
import { usePreferences, useServices } from '../context';
import { PIcon } from './icons';
import { paintFirst, showLoading } from './loading';

/** Names of the camera views (art-core adds the steeper one to VIEW_MODES in render/iso.ts). */
const VIEW_NAMES: Record<string, string> = { iso: 'Oblique', steep: 'Steep', top: 'Top-down' };

const CHANNEL_NAMES: Record<Channel, string> = { music: 'Music', effects: 'Effects', ambience: 'Ambience' };

/** How full a range input is, 0..100, for the lit part of its track (kit look: the fill stops at the knob). */
function setFill(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const share = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--fill', `${share}%`);
}

/** Every slider in the settings (also the ones other parts draw) gets its fill from here, on mount and while dragging. */
function useRangeFill(open: boolean) {
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open) body.current?.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(setFill);
  }, [open]);
  const onInput = (e: FormEvent<HTMLElement>): void => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'range') setFill(t);
  };
  return { body, onInput };
}

function ViewGroup() {
  const { preferences, saveNow } = useServices();
  const p = usePreferences();
  const reduced = p.motion === 'reduce' || (p.motion === 'system' && preferences.reducedMotion());
  return (
    <fieldset className="seg-field settings-group">
      <legend>Camera and motion</legend>
      <div className="settings-options">
        {VIEW_MODES.map((v) => (
          <label key={v} className="seg-option">
            <input
              type="radio"
              name="view"
              checked={p.view === v}
              onChange={() => {
                preferences.setView(v);
                showLoading('Switching view', 0.5, true);
                void paintFirst()
                  .then(saveNow)
                  .then(() => window.location.reload());
              }}
            />
            {VIEW_NAMES[v] ?? v}
          </label>
        ))}
      </div>
      <p className="muted settings-hint">Switching the view saves your round and reloads the page.</p>
      <label className="seg-option settings-check">
        <input type="checkbox" checked={reduced} onChange={(e) => preferences.setMotion(e.target.checked ? 'reduce' : 'full')} />
        <span className="opt-body">
          <span className="opt-name">Reduce motion</span>
          <span className="opt-sub">Panels cut instead of gliding, no pops or shakes. Follows your device until you change it.</span>
        </span>
      </label>
    </fieldset>
  );
}

function PlayGroup() {
  const { preferences } = useServices();
  const p = usePreferences();
  return (
    <fieldset className="seg-field settings-group">
      <legend>Game speed</legend>
      <div className="settings-options">
        {SPEEDS.map((s) => (
          <label key={s} className="seg-option">
            <input type="radio" name="speed" checked={p.speed === s} onChange={() => preferences.setSpeed(s)} />
            {s}x
          </label>
        ))}
      </div>
      <label className="seg-option settings-check">
        <input type="checkbox" checked={p.autopilot} onChange={(e) => preferences.setAutopilot(e.target.checked)} />
        <span className="opt-body">
          <span className="opt-name">Autopilot</span>
          <span className="opt-sub">A bot plays this round. The speed above makes it faster.</span>
        </span>
      </label>
    </fieldset>
  );
}

function VolumeGroup() {
  const { preferences } = useServices();
  const p = usePreferences();
  return (
    <fieldset className="seg-field settings-group">
      <legend>Volume</legend>
      {CHANNELS.map((ch) => (
        <label key={ch} className="field volume-row">
          <span className="volume-name">{CHANNEL_NAMES[ch]}</span>
          <input type="range" min={0} max={1} step={0.05} value={p.volume[ch]} onChange={(e) => preferences.setVolume(ch, Number(e.target.value))} />
          <span className="num volume-value">{Math.round(p.volume[ch] * 100)}%</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Camera view, game speed, autopilot and volumes (per device). Switching the view saves and reloads. */
export function Settings() {
  const [open, setOpen] = useState(false);
  const head = useRef<HTMLButtonElement>(null);
  const { body, onInput } = useRangeFill(open);
  const toggle = (): void => {
    setOpen(!open);
    // the groups open below the button: bring them into view (smooth; instant with reduced motion)
    if (!open) window.requestAnimationFrame(() => head.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  return (
    <section className="settings" aria-label="Settings">
      <button ref={head} type="button" className="settings-toggle k-press" aria-expanded={open} aria-controls="settings-body" onClick={toggle}>
        <span className="k-plaque settings-ico">
          <Icon name="gear" size={20} />
        </span>
        <span className="settings-name">Settings</span>
        <span className="muted settings-sum">Camera, speed, sound, building</span>
        <span className="settings-chev">
          <PIcon name="chevron-down" size={18} />
        </span>
      </button>
      <Presence open={open} from="down" id="settings-body" className="settings-body" onInput={onInput}>
        <div ref={body} className="settings-grid">
          <ViewGroup />
          <PlayGroup />
          <VolumeGroup />
          <div className="settings-group settings-sound">
            <SoundSettings />
          </div>
          <WorldSettings />
          <ToolsSettings />
          <div className="settings-group settings-pal">
            <PaletteSettings />
          </div>
        </div>
      </Presence>
    </section>
  );
}
