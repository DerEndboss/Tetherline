import { useState, type ReactNode } from 'react';
import type { RunOptions } from '../../sim/newgame';
import { hashSeed } from '../../sim/rng';
import { Icon } from '../components/Icon';
import { useServices } from '../context';
import { PIcon } from './icons';
import { randomSeed, seedText } from './launch';

/** What each world feels like (the content has colours, not prose). */
const WORLD_BLURB: Record<string, string> = {
  'rust-desert': 'Red dunes, long shadows, dusty rock.',
  'green-meadow': 'Soft grass, bright lakes, flowers.',
  'ice-snow': 'Snow plains, frozen ponds, blue glints.',
};

const MODES: { id: string; name: string; ready: boolean; blurb: string }[] = [
  { id: 'chill', name: 'Chill', ready: true, blurb: 'Orders lead the way. Nothing attacks you.' },
  { id: 'events', name: 'Events', ready: false, blurb: '' },
  { id: 'waves', name: 'Waves', ready: false, blurb: '' },
];

/** One choice group: a small heading over a row of option cards (radio inputs, so the keyboard works as it should). */
function Group({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <fieldset className="cz-group" data-wide={wide}>
      <legend>{title}</legend>
      <div className="cz-options">{children}</div>
    </fieldset>
  );
}

/** A strip of the world's own ground tones: what the land will look like. */
function swatch(ground: readonly string[]): string {
  const tones = ground.length ? ground : ['#888'];
  return `linear-gradient(135deg, ${tones.map((c, i) => `${c} ${(i / tones.length) * 100}% ${((i + 1) / tones.length) * 100}%`).join(', ')})`;
}

interface CustomizeProps {
  /** The slot the round lands in. */
  slot: number;
  /** Every slot is taken: starting asks which save to replace (MainMenu), so the button does not name a slot. */
  replaces: boolean;
  onStart: (opts: RunOptions) => void;
}

/** Customize: map size, world, mode (Chill only for now) and the seed. */
export function Customize({ slot, replaces, onStart }: CustomizeProps) {
  const services = useServices();
  const { content } = services.game;
  const [size, setSize] = useState(content.rules.defaultSize);
  const [theme, setTheme] = useState(content.rules.defaultTheme);
  const [seed, setSeed] = useState('');
  const [rolled, setRolled] = useState(() => seedText(randomSeed()));
  const text = seed.trim() || rolled;
  const go = (): void => onStart({ seed: hashSeed(text), size, theme });
  return (
    <form
      className="customize"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <Group title="Map size">
        {content.sizes.list.map((s) => (
          <label key={s.id} className="seg-option opt-card">
            <input type="radio" name="size" checked={size === s.id} onChange={() => setSize(s.id)} />
            <span className="opt-body">
              <span className="opt-name">{s.name}</span>
              <span className="opt-sub num">{s.diameter} tiles</span>
            </span>
          </label>
        ))}
      </Group>
      <Group title="World" wide>
        {content.themes.list.map((t) => (
          <label key={t.id} className="seg-option opt-card">
            <input type="radio" name="theme" checked={theme === t.id} onChange={() => setTheme(t.id)} />
            <span className="world-swatch" aria-hidden="true" style={{ background: swatch(t.palette.ground.slice(0, 4)) }} />
            <span className="opt-body">
              <span className="opt-name">{t.name}</span>
              <span className="opt-sub">{WORLD_BLURB[t.id] ?? ''}</span>
            </span>
          </label>
        ))}
      </Group>
      <Group title="Mode" wide>
        {MODES.map((m) => (
          <label key={m.id} className="seg-option opt-card" aria-disabled={!m.ready}>
            <input type="radio" name="mode" checked={m.ready} disabled={!m.ready} readOnly />
            <span className="opt-body">
              <span className="opt-name">
                {m.name}
                {!m.ready && <span className="k-chip opt-soon">Soon</span>}
              </span>
              <span className="opt-sub">{m.blurb}</span>
            </span>
          </label>
        ))}
      </Group>
      <div className="field seed-field">
        <label htmlFor="seed-input">Seed</label>
        <div className="seed-row">
          <input id="seed-input" value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={32} placeholder={rolled} autoComplete="off" spellCheck={false} />
          <button
            type="button"
            className="button"
            data-tip="A new random seed"
            onClick={() => {
              setSeed('');
              setRolled(seedText(randomSeed()));
            }}
          >
            <PIcon name="dice" size={18} />
            Roll
          </button>
        </div>
        <small className="muted">The same seed gives the same land. Empty = the rolled one.</small>
      </div>
      <button type="submit" className="button button-primary cz-start">
        <Icon name="play" size={18} />
        {replaces ? 'Start round' : `Start in slot ${slot}`}
      </button>
      {replaces && <p className="muted cz-full">All slots are full. Starting asks which save to replace.</p>}
    </form>
  );
}
