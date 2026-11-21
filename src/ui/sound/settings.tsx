import { useEffect, useState } from 'react';
import { useServices } from '../context';
import { ToolIcon } from '../tools/icons';

/** Settings window, sound part (the three volumes are in the menu's Settings): which build track plays, and a skip. */
export function SoundSettings() {
  const { audio } = useServices();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const read = (): void => setName(audio.music?.nowPlaying()?.name ?? null);
    read();
    const timer = window.setInterval(read, 1500);
    return () => window.clearInterval(timer);
  }, [audio]);
  return (
    <section className="set-group sound-track" aria-label="Music">
      <h4 className="set-title">Music</h4>
      <div className="trk k-well" data-playing={name !== null}>
        <span className="k-plaque trk-icon">
          <ToolIcon name="note" size={22} />
        </span>
        <span className="trk-text">
          <span className="trk-label">
            Now playing
            {name !== null && (
              <span className="trk-eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </span>
          <span className="trk-name num k-enter" data-from="up" key={name ?? 'none'}>
            {name ?? 'Silence'}
          </span>
        </span>
        <button type="button" className="button ibtn" aria-label="Next track" data-tip="Next track" disabled={!name} onClick={() => audio.music?.skip()}>
          <ToolIcon name="skip" size={18} />
        </button>
      </div>
      {name === null && <p className="set-hint">Press any key to start the sound.</p>}
    </section>
  );
}
