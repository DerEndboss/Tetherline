import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { listSlots, type SlotInfo } from '../../save/slots';
import type { RunOptions } from '../../sim/newgame';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Icon } from '../components/Icon';
import { Presence, useLastDefined } from '../components/Presence';
import { useServices } from '../context';
import { Customize } from './Customize';
import { Emblem, PIcon } from './icons';
import { landing, randomSeed, replaceable, startRound } from './launch';
import { MetaTree } from './MetaTree';
import { ReplaceDialog, type Ask } from './Replace';
import { Settings } from './Settings';
import { Slots } from './Slots';
import { useMeta } from './useMeta';

/** Quick Round's recipe, spelled out under the button as chips. */
function quickParts(services: ReturnType<typeof useServices>): string[] {
  const { content } = services.game;
  const size = content.sizes.find(content.rules.defaultSize)?.name ?? content.rules.defaultSize;
  const theme = content.themes.find(content.rules.defaultTheme)?.name ?? content.rules.defaultTheme;
  return ['Random seed', `${size} map`, theme, 'Chill'];
}

/** Stagger of the sections as the menu opens: each rises a beat after the one before. */
const after = (ms: number): CSSProperties => ({ ['--k-delay' as string]: `${ms}ms` });

type Page = 'home' | 'meta';

/** Main menu: Quick Round, Customize, three save slots, the meta tree and settings. The game waits behind it. */
export function MainMenu() {
  const services = useServices();
  const { menu } = services;
  const meta = useMeta();
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [custom, setCustom] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [version, setVersion] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    void listSlots().then(setSlots).catch(() => setSlots([]));
  }, [version]);
  const playing = services.game.world.state.tick > 0;
  const shownAsk = useLastDefined(ask);
  useEffect(() => {
    // Escape goes back to the round (the Blueprint window and the replace dialog handle their own Escape first)
    if (!playing || page !== 'home' || ask) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') menu.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, page, menu, ask]);
  const inPlay = playing ? services.game.slot : 0;
  const { slot, replaces } = landing(slots, inPlay);
  // A new round never replaces a save on its own: the slots are read again at the click, and when every one is taken the
  // player picks which goes.
  const launch = (opts: RunOptions): void => {
    void listSlots()
      .catch(() => slots)
      .then(async (fresh) => {
        const to = landing(fresh, inPlay);
        if (!to.replaces) return startRound(services, opts, to.slot);
        setAsk({ opts, choices: replaceable(fresh, inPlay) });
        return undefined;
      });
  };
  const toggleCustom = (e: MouseEvent<HTMLButtonElement>): void => {
    setCustom(!custom);
    if (custom) return;
    // on a short screen the drawer opens below the fold: scroll it into view (a drawer taller than the card lines up its top)
    const scroller = e.currentTarget.closest('.menu-scroll');
    window.requestAnimationFrame(() => scroller?.querySelector('.menu-custom-wrap')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  return (
    <div className="menu-scrim">
      <main className="menu" data-behind={page === 'meta'} aria-label="Main menu" inert={page === 'meta' || ask !== null}>
        <div className="menu-scroll">
          <header className="menu-head k-enter" data-from="down">
            <span className="menu-emblem">
              <Emblem size={64} />
            </span>
            <div className="menu-head-text">
              <h1 className="menu-title">Tetherline</h1>
              <p className="muted menu-tag">Build drills, belts and factories. One round, about an hour.</p>
            </div>
          </header>
          <div className="menu-main k-enter" data-from="up" style={after(50)}>
            <div className="menu-quick-wrap">
              <span className="menu-quick-glow" aria-hidden="true" />
              {playing ? (
                <button type="button" className="button button-primary menu-quick" onClick={() => menu.close()} autoFocus>
                  <Icon name="play" size={26} />
                  Resume
                  <kbd className="menu-esc">Esc</kbd>
                </button>
              ) : (
                <button type="button" className="button button-primary menu-quick" onClick={() => launch({ seed: randomSeed() })}>
                  <Icon name="play" size={26} />
                  Quick Round
                </button>
              )}
              {playing ? (
                <p className="muted menu-paused">Your round is paused until you go back.</p>
              ) : (
                <>
                  <ul className="menu-recipe" aria-label="Quick Round setup">
                    {quickParts(services).map((part) => (
                      <li key={part} className="k-chip">
                        {part}
                      </li>
                    ))}
                  </ul>
                  {replaces && <p className="muted menu-full">All slots are full. You pick which save the new round replaces.</p>}
                </>
              )}
            </div>
            <div className="menu-side">
              {playing && (
                <button type="button" className="button" onClick={() => launch({ seed: randomSeed() })}>
                  <Icon name="play" size={16} />
                  New Quick Round
                </button>
              )}
              <button type="button" className="button menu-custom" aria-expanded={custom} onClick={toggleCustom}>
                Customize
                <span className="menu-chev">
                  <PIcon name="chevron-down" size={16} />
                </span>
              </button>
              <button type="button" className="button" onClick={() => setPage('meta')}>
                <Icon name="prism" size={18} />
                Blueprints
                <span className="k-badge menu-points">
                  <AnimatedNumber value={meta.points} pop="both" />
                </span>
              </button>
            </div>
          </div>
          <Presence open={custom} from="down" as="section" className="menu-custom-wrap" aria-label="Customize the round">
            <Customize slot={slot} replaces={replaces !== null} onStart={launch} />
          </Presence>
          <section className="menu-section k-enter" data-from="up" style={after(100)} aria-label="Save slots">
            <h2 className="menu-h">Save slots</h2>
            <Slots slots={slots} onChange={() => setVersion((v) => v + 1)} onNew={(to) => void startRound(services, { seed: randomSeed() }, to)} />
          </section>
          <div className="k-enter" data-from="up" style={after(150)}>
            <Settings />
          </div>
        </div>
      </main>
      <Presence
        open={page === 'meta'}
        from="pop"
        as="section"
        className="meta-window"
        aria-label="Blueprint tree"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          setPage('home');
        }}
      >
        <MetaTree onBack={() => setPage('home')} />
      </Presence>
      <Presence open={ask !== null} from="fade" className="replace-layer">
        {shownAsk && (
          <ReplaceDialog
            ask={shownAsk}
            onCancel={() => setAsk(null)}
            onPick={(to) => {
              setAsk(null);
              void startRound(services, shownAsk.opts, to);
            }}
          />
        )}
      </Presence>
    </div>
  );
}
