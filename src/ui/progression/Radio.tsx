import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TICK_HZ } from '../../sim/constants';
import type { RadioLine } from '../../sim/progression';
import { Icon } from '../components/Icon';
import { Presence, useLastDefined } from '../components/Presence';
import { useServices, useSnapshot } from '../context';
import { reducedMotion } from '../motion';
import { PIcon } from './icons';
import { lastRadio, stamp } from './view';

const TYPE_MS = 22;
/** How long a message stays on screen, in sim time (a loaded save does not replay old ones). */
const SHOW_TICKS = 15 * TICK_HZ;

/**
 * The text types itself out. It writes into the element directly (no React render per character) and marks the
 * card `data-typing` meanwhile, which drives the wave and the caret in CSS. The whole text is already in the layout
 * (`.radio-full`), so the card never grows while it types.
 */
function useTypewriter(text: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const card = el.closest<HTMLElement>('.radio');
    if (reducedMotion()) {
      el.textContent = text;
      return undefined;
    }
    let n = 0;
    el.textContent = '';
    card?.setAttribute('data-typing', 'true');
    const id = window.setInterval(() => {
      n += 1;
      el.textContent = text.slice(0, n);
      if (n >= text.length) {
        window.clearInterval(id);
        card?.removeAttribute('data-typing');
      }
    }, TYPE_MS);
    return () => {
      window.clearInterval(id);
      card?.removeAttribute('data-typing');
    };
  }, [text]);
  return ref;
}

/** One message from Control: antenna, the typed text, a dismiss button. Remounted (key) for every new message. */
function Message({ line, onDismiss }: { line: RadioLine; onDismiss: () => void }) {
  const typed = useTypewriter(line.text);
  return (
    <>
      <header className="radio-head">
        <span className="radio-mark">
          <PIcon name="signal" size={16} />
        </span>
        <span className="radio-from">Control</span>
        <span className="radio-wave" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <button type="button" className="icon-button radio-x" aria-label="Dismiss" data-tip-side="left" onClick={onDismiss}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <p className="radio-text" aria-live="polite">
        <span className="radio-full">{line.text}</span>
        <span ref={typed} className="radio-typed" aria-hidden="true" />
      </p>
    </>
  );
}

/** The log: the latest lines of the story, newest on top (it says so, and every line has the time it came in). */
function Log({ lines }: { lines: readonly RadioLine[] }) {
  const [open, setOpen] = useState(false);
  const recent = [...lines].reverse().slice(0, 8);
  return (
    <div className="radio-log">
      <button type="button" className="radio-log-btn k-chip k-press" aria-expanded={open} onClick={() => setOpen(!open)}>
        <PIcon name="list" size={14} />
        Radio log
        <span className="k-badge radio-log-count num">{lines.length}</span>
      </button>
      <Presence open={open} from="down" as="section" className="radio-lines hud-card" aria-label="Radio log">
        <p className="radio-lines-head">Newest first</p>
        <ol className="radio-lines-list">
          {recent.map((l, i) => (
            <li key={`${l.id}-${l.tick}`} className="k-follow" style={{ ['--k-delay' as string]: `${i * 30}ms` } as CSSProperties}>
              <span className="radio-stamp num">{stamp(l.tick, TICK_HZ)}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      </Presence>
    </div>
  );
}

/** The newest radio message from Control: typed out, gone after a while, the log on request. */
export function Radio() {
  useSnapshot();
  const { game } = useServices();
  const w = game.world;
  const last = lastRadio(w);
  const [dismissed, setDismissed] = useState(-1);
  const open = last !== null && last.tick !== dismissed && w.state.tick - last.tick < SHOW_TICKS && w.state.tick >= last.tick;
  // a leaving card keeps its message until it has slid out
  const shown = useLastDefined(last);
  const lines = w.state.progress.radio ?? [];
  return (
    <div className="radio-stack">
      <Presence open={open} from="right" as="aside" className="hud-card radio" aria-label="Radio message">
        {shown && <Message key={`${w.state.seed}-${shown.tick}`} line={shown} onDismiss={() => setDismissed(shown.tick)} />}
      </Presence>
      {lines.length > 1 && <Log lines={lines} />}
    </div>
  );
}
