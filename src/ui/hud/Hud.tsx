import { useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { usePresence } from '../components/Presence';
import { useServices } from '../context';
import { DronesHud } from '../drones';
import { PaletteHud } from '../palette';
import { ProgressionHud } from '../progression';
import { SoundToggle } from '../sound/SoundToggle';
import { ToolsHud } from '../tools';
import { SpeedToggle } from './Speed';
import { useHudStack } from './hudStack';

/**
 * The in-game HUD frame. Each HUD module draws into its own slot component from its own folder
 * (see docs/architecture.md): palette, tools, progression, drones. Only the corner buttons live here.
 */
/** Shown while the player paused the game (P or Space); it rises in and sinks away, a click goes on. */
function PausedBadge() {
  const { menu } = useServices();
  const paused = useSyncExternalStore(menu.subscribe, () => menu.isPaused?.() ?? false);
  const { mounted, attrs } = usePresence(paused, 'up');
  if (!mounted) return null;
  return (
    <button type="button" className="paused-badge k-press" onClick={() => menu.togglePause?.()} {...attrs}>
      <span className="paused-icon">
        <Icon name="pause" size={18} />
      </span>
      Paused <span className="muted">P or Space to go on</span>
    </button>
  );
}

export function Hud() {
  const { menu } = useServices();
  useHudStack();
  return (
    <div className="hud">
      <PaletteHud />
      <ToolsHud />
      <ProgressionHud />
      <DronesHud />
      <PausedBadge />
      <div className="corner-buttons k-enter" data-from="down">
        <SpeedToggle />
        <SoundToggle />
        <button type="button" className="icon-button hud-button" aria-label="Menu" data-tip-side="bottom" onClick={() => menu.open()}>
          <Icon name="gear" size={22} />
        </button>
      </div>
    </div>
  );
}
