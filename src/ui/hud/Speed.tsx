import { useEffect, useRef } from 'react';
import { isTextEntry } from '../../game/hotkeys';
import { useFlashOnChange } from '../components/AnimatedNumber';
import { usePreferences, useServices } from '../context';
import { speedKey, speedLabel, stepSpeed } from './speed';

/** The speed keys (see speed.ts): they act on the stored preference, the game follows it (main.tsx). */
function useSpeedKeys(): void {
  const { preferences } = useServices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const dir = speedKey(e);
      if (dir === null || e.repeat || isTextEntry(e.target)) return;
      preferences.setSpeed(stepSpeed(preferences.get().speed, dir, false));
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preferences]);
}

/**
 * Game speed, top right beside the mute and menu buttons. Quiet at 1x, lit while the game runs faster, so nobody has to
 * wonder why everything moves quickly. A click goes to the next speed (10x wraps to 1x); the period key is faster and the
 * comma key slower. It reads and writes the same setting as the menu's Game speed.
 */
export function SpeedToggle() {
  const { preferences } = useServices();
  const { speed } = usePreferences();
  const num = useRef<HTMLSpanElement>(null);
  useFlashOnChange(num, speed, 'both', 0);
  useSpeedKeys();
  const label = speedLabel(speed);
  return (
    <button
      type="button"
      className="icon-button hud-button speed-toggle"
      data-fast={speed !== 1}
      aria-label={`Game speed ${label}. Click for the next one`}
      data-tip={`Game speed ${label}. Click for the next one. Period is faster, comma is slower`}
      data-tip-side="bottom"
      onClick={() => preferences.setSpeed(stepSpeed(speed, 1, true))}
    >
      <span ref={num} className="k-num speed-num">
        {label}
      </span>
    </button>
  );
}
