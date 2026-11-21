import { useMemo, type CSSProperties } from 'react';
import type { MaterialDef } from '../../content/types';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Icon } from '../components/Icon';
import { usePresenceList } from '../components/Presence';
import { useServices, useSnapshot } from '../context';
import { formatShort } from '../format';
import { ItemIcon } from './ItemIcon';
import { useViewportWidth } from './keys';
import { PHONE_WIDTH } from './phone';
import { paletteStore, usePaletteState } from './store';

/** Rows shown folded: two columns of four on wide screens, one row of four on a phone. */
const FOLDED_WIDE = 8;
const FOLDED_PHONE = 4;

interface Row {
  def: MaterialDef;
  n: number;
}

/** Name, amount of the core's room and how full that is. */
function resTip(name: string, n: number, cap: number): string {
  const pct = cap > 0 ? Math.min(100, Math.floor((n / cap) * 100)) : 0;
  return `${name}: ${formatShort(n)} of ${formatShort(cap)} (${pct}%)${n >= cap ? ', core full' : ''}`;
}

/** The power balance of the whole base as one lit chip: made / wanted, amber when short. The numbers count to their new value. */
function PowerChip({ made, wanted }: { made: number; wanted: number }) {
  const short = wanted > made + 0.01;
  const tip = `Power: ${made.toFixed(1)} made, ${wanted.toFixed(1)} wanted per second`;
  return (
    <span className={`res-power k-chip${short ? ' short' : ''}`} data-tip={tip} data-tip-side="bottom">
      <Icon name="bolt" size={13} />
      <AnimatedNumber value={made} pop="none" />
      <span className="res-slash" aria-hidden="true">
        /
      </span>
      <AnimatedNumber value={wanted} pop="none" />
    </span>
  );
}

/**
 * A small window of core stock (compact, k/M numbers like 1.3k, not a giant bar): two columns of recessed
 * wells, each an icon plaque, a number that counts to its new value (and pops when it jumps) and a thin fill meter.
 * The power balance and the core's capacity sit in the header and the foot. Shows the first rows; "more" opens the
 * rest by widening to four columns (never taller: the drone panel sits under it). A material that fills the core turns amber; a new one pops in.
 * On a phone it sits in the bottom right column (palette.css) and folds to one row of four.
 */
export function Resources() {
  const { game } = useServices();
  const snap = useSnapshot();
  const { coreOpen } = usePaletteState();
  const folded = useViewportWidth() < PHONE_WIDTH ? FOLDED_PHONE : FOLDED_WIDE;
  const defs = game.content.materials.list;
  const held = useMemo<Row[]>(() => defs.map((def, i) => ({ def, n: snap.stock[i] ?? 0 })).filter((r) => r.n >= 1), [defs, snap.stock]);
  const shown = useMemo(() => (coreOpen ? held : held.slice(0, folded)), [held, coreOpen, folded]);
  const rows = usePresenceList(shown, (r) => r.def.id, 'pop');
  const cap = snap.capacity;
  return (
    <section className="hud-card resources k-enter" data-from="left" data-open={coreOpen || undefined} aria-label="Core storage">
      <header className="k-head res-head">
        <h2 className="k-title">Core</h2>
        <PowerChip made={snap.power.made} wanted={snap.power.wanted} />
      </header>
      <ul className="res-list">
        {rows.map(({ key, item: { def, n }, attrs }) => {
          const full = n >= cap;
          return (
            <li key={key} className={`res${full ? ' full' : ''}`} data-tip={resTip(def.name, n, cap)} data-tip-side="right" style={{ '--fill': cap > 0 ? Math.min(1, n / cap) : 0 } as CSSProperties} {...attrs}>
              <span className="res-plaque">
                <ItemIcon def={def} size={22} />
              </span>
              <AnimatedNumber value={n} pop="up" className="res-n" />
              <span className="res-fill" aria-hidden="true" />
            </li>
          );
        })}
        {!held.length && <li className="res-empty">Nothing stored yet</li>}
      </ul>
      <footer className="res-foot">
        <span className="k-chip res-cap num" data-tip="Room for each material" data-tip-side="bottom">
          cap {formatShort(cap)}
        </span>
        {held.length > folded && (
          <button type="button" className="res-more k-press" aria-expanded={coreOpen} onClick={() => paletteStore.setCoreOpen(!coreOpen)}>
            {coreOpen ? 'Less' : `+${held.length - folded} more`}
          </button>
        )}
      </footer>
    </section>
  );
}
