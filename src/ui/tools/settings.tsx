import { useSyncExternalStore } from 'react';
import { toolSettings, type ToolSettings } from '../../game/tools/settings';
import { Switch } from './Switch';

const ROWS: { key: keyof ToolSettings; label: string; hint: string }[] = [
  { key: 'smoothZoom', label: 'Smooth zoom', hint: 'The wheel glides to its zoom instead of jumping.' },
  { key: 'keepTool', label: 'Keep building tool', hint: 'After placing, the tool stays in hand. Off: it drops unless Shift is held.' },
  { key: 'edgePan', label: 'Edge scrolling', hint: 'Push the mouse to the window edge to move the map.' },
];

/** The tools' settings (zoom smoothing, keeping the tool, edge scrolling), shown in the menu's settings. */
export function ToolsSettings() {
  const s = useSyncExternalStore(toolSettings.subscribe, toolSettings.get);
  return (
    <section className="set-group tools-settings" aria-label="Building tools">
      <h4 className="set-title">Building tools</h4>
      {ROWS.map((r) => (
        <Switch key={r.key} label={r.label} hint={r.hint} checked={s[r.key]} onChange={(v) => toolSettings.set(r.key, v)} />
      ))}
    </section>
  );
}
