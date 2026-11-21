import { useMuted, useServices } from '../context';
import { Icon } from '../components/Icon';

/** Mute switch, top right. Remembered in this browser; the icon pops when the state flips. */
export function SoundToggle() {
  const { audio } = useServices();
  const muted = useMuted();
  return (
    <button
      type="button"
      className="icon-button hud-button sound-toggle"
      aria-pressed={muted}
      aria-label="Mute sound"
      data-tip={muted ? 'Sound is off. Click to turn it on' : 'Mute sound'}
      data-tip-side="bottom"
      data-sound="none"
      onClick={() => {
        audio.unlock();
        audio.setMuted(!muted);
      }}
    >
      <span className="snd-icon" key={muted ? 'off' : 'on'}>
        <Icon name={muted ? 'sound-off' : 'sound-on'} size={22} />
      </span>
    </button>
  );
}
