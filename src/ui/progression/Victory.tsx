import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { metaStore } from '../../save/meta';
import { sendProgress, winBonus } from '../../sim/progression';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Icon } from '../components/Icon';
import { usePresence } from '../components/Presence';
import { useServices, useSnapshot } from '../context';
import { formatShort } from '../format';
import { PIcon } from './icons';
import { clock } from './view';

/** Confetti pieces: positions and timings from the index (the look never needs randomness). They fall once, then are gone. */
const PIECES = Array.from({ length: 56 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 30) / 10,
  dur: 3.6 + ((i * 29) % 30) / 10,
  drift: ((i * 61) % 80) - 40,
  spin: 240 + ((i * 71) % 480),
}));

const asClock = (n: number): string => clock(Math.round(n));
const asPlus = (n: number): string => `+${formatShort(n)}`;

interface StatProps {
  icon: ReactNode;
  label: string;
  value: number;
  format?: (n: number) => string;
  /** When it starts to count, in ms after the card is in; also its rise. */
  delay: number;
  tone?: 'prism';
}

/** One number of the round, in a recessed tile: it counts up from zero a beat after the card has arrived. */
function Stat({ icon, label, value, format = formatShort, delay, tone }: StatProps) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(value), delay + 260);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return (
    <div className="victory-stat k-follow" data-tone={tone} style={{ ['--k-delay' as string]: `${delay}ms` } as CSSProperties}>
      <span className="k-plaque victory-stat-icon">{icon}</span>
      <dt>{label}</dt>
      <dd>
        <AnimatedNumber value={shown} format={format} pop="up" popAt={0} />
      </dd>
    </div>
  );
}

/**
 * The victory moment: every order done. A celebration with the round's numbers and the
 * Blueprints it paid; then "Keep building" (the game goes on) or a new round.
 */
export function Victory() {
  const { game, menu } = useServices();
  useSnapshot();
  const w = game.world;
  const p = w.state.progress;
  const counted = useRef(-1);
  const seconds = Math.floor((p.wonAt ?? w.state.tick) / 20);
  const show = p.won && !p.celebrated;
  const { mounted, attrs } = usePresence(show, 'fade');
  useEffect(() => {
    if (!show || counted.current === w.state.seed) return;
    counted.current = w.state.seed;
    void metaStore.round(seconds);
  }, [show, seconds, w]);
  if (!mounted) return null;
  const hasElevator = w.content.orders.list.some((o) => o.stage !== undefined);
  const delivered = w.state.stats.delivered.reduce((a, b) => a + b, 0);
  const keep = (): void => sendProgress({ run: w.state.seed, type: 'celebrated' });
  const bonus = winBonus(seconds);
  return (
    <div className="victory" role="dialog" aria-modal="true" aria-labelledby="victory-title" {...attrs}>
      <div className="victory-rays" aria-hidden="true" />
      <div className="victory-glow" aria-hidden="true" />
      <div className="confetti" aria-hidden="true">
        {PIECES.map((c, i) => (
          <span key={i} className="confetti-piece" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ['--drift' as string]: `${c.drift}vw`, ['--spin' as string]: `${c.spin}deg` }} />
        ))}
      </div>
      <div className="victory-card k-enter" data-from="pop" style={{ ['--k-delay' as string]: '120ms' } as CSSProperties}>
        <span className="victory-medal k-follow">
          <PIcon name="trophy" size={34} />
        </span>
        <p className="victory-kicker k-follow">Round complete</p>
        <h2 id="victory-title" className="victory-title k-follow" style={{ ['--k-delay' as string]: '60ms' } as CSSProperties}>
          {hasElevator ? 'The Space Elevator stands' : 'Every order done'}
        </h2>
        <p className="muted victory-line k-follow" style={{ ['--k-delay' as string]: '100ms' } as CSSProperties}>
          From a bare core to a sky-high factory. Nicely done.
        </p>
        <dl className="victory-stats">
          <Stat icon={<PIcon name="clock" size={20} />} label="Time" value={seconds} format={asClock} delay={160} />
          <Stat icon={<Icon name="build" size={20} />} label="Buildings" value={w.state.buildings.length} delay={220} />
          <Stat icon={<PIcon name="deliver" size={20} />} label="Items delivered" value={delivered} delay={280} />
          <Stat icon={<Icon name="prism" size={20} />} label={game.content.rules.metaCurrency} value={p.earned ?? 0} format={asPlus} delay={340} tone="prism" />
        </dl>
        <p className="muted victory-bonus k-follow" style={{ ['--k-delay' as string]: '380ms' } as CSSProperties}>
          {Math.max(0, (p.earned ?? 0) - bonus)} from orders and {bonus} as the round bonus: faster rounds pay more. Spend them in the Blueprint tree.
        </p>
        <div className="victory-actions k-follow" style={{ ['--k-delay' as string]: '420ms' } as CSSProperties}>
          <button type="button" className="button button-primary" onClick={keep} autoFocus>
            Keep building
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              keep();
              menu.open();
            }}
          >
            New round
          </button>
        </div>
      </div>
    </div>
  );
}
