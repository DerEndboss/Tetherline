import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Id } from '../../content/types';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Icon } from '../components/Icon';
import { Presence, usePresenceList } from '../components/Presence';
import { useServices, useSnapshot } from '../context';
import { formatShort } from '../format';
import { PIcon } from './icons';
import { chainView, type OrderView } from './view';

/** How long a finished order stays on screen as a "done" row (a check, a full bar) before it leaves. */
const DONE_MS = 1300;

interface Row {
  view: OrderView;
  done: boolean;
}

/**
 * The orders that were finished since the last look, kept for a moment so the player sees the check. State is
 * adjusted while rendering (no effect): the finished ones are the new ids at the end of the `done` list.
 */
function useFinished(doneIds: readonly Id[], titleOf: (id: Id) => string): OrderView[] {
  const count = doneIds.length;
  const [seen, setSeen] = useState(count);
  const [held, setHeld] = useState<OrderView[]>([]);
  if (count !== seen) {
    setSeen(count);
    if (count > seen) {
      const added = doneIds.slice(seen).map((id): OrderView => ({ id, title: titleOf(id), have: 1, need: 1, rate: null, fraction: 1 }));
      setHeld((h) => [...h, ...added]);
    }
  }
  useEffect(() => {
    if (!held.length) return undefined;
    const t = window.setTimeout(() => setHeld([]), DONE_MS);
    return () => window.clearTimeout(t);
  }, [held]);
  return held;
}

/** Progress as text: "3 / 10" or "42/min of 60". The first number counts up by itself. */
function Count({ o }: { o: OrderView }) {
  if (o.rate) {
    return (
      <>
        <AnimatedNumber value={o.rate.now} pop="up" />
        /min of {formatShort(o.rate.want)}
      </>
    );
  }
  return (
    <>
      <AnimatedNumber value={o.have} pop="up" /> / {formatShort(o.need)}
    </>
  );
}

function OrderRow({ row }: { row: Row }) {
  const { view: o, done } = row;
  return (
    <>
      <span className="order-title">{o.title}</span>
      <span className="num order-count">
        {done ? (
          <span className="order-done-mark">
            <Icon name="check" size={14} />
            Done
          </span>
        ) : (
          <Count o={o} />
        )}
      </span>
      <span className="order-bar" role="progressbar" aria-label={o.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(o.fraction * 100)}>
        <span className="order-fill" style={{ ['--p' as string]: o.fraction } as CSSProperties} />
      </span>
    </>
  );
}

function Stages({ done, total, name }: { done: number; total: number; name: string }) {
  if (!total) return null;
  return (
    <div className="stages" role="img" aria-label={`${name}: ${done} of ${total} stages`} data-tip={`${name}: ${done} of ${total} stages`} data-tip-side="left">
      <span className="stages-name">{name}</span>
      <span className="stages-pips">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="stage-pip" data-done={i < done} />
        ))}
      </span>
    </div>
  );
}

/** The running orders of the story chain, the chapter, and the Space Elevator's stages. */
export function Orders() {
  useSnapshot();
  const { game } = useServices();
  const [open, setOpen] = useState(true);
  const v = chainView(game.world);
  const p = game.world.state.progress;
  const finished = useFinished(p.done, (id) => game.world.content.orders.get(id).title);
  const sig = `${v.active.map((o) => `${o.id}:${o.have}:${o.rate?.now ?? ''}`).join('|')}#${finished.map((f) => f.id).join('|')}`;
  // rows keep their identity until something on them changes, which usePresenceList needs to tell who came and who left
  const rows = useMemo(() => {
    const doneRows: Row[] = finished.map((view) => ({ view, done: true }));
    const live: Row[] = v.active.filter((a) => !finished.some((f) => f.id === a.id)).map((view) => ({ view, done: false }));
    return [...doneRows, ...live];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` stands for the contents of `finished` and `v.active`
  }, [sig]);
  const entries = usePresenceList(rows, (r) => r.view.id, 'right');
  return (
    <Presence open={v.active.length > 0 || v.won} from="right" as="section" className="hud-card orders" aria-label="Orders">
      <button type="button" className="orders-head" aria-expanded={open} data-tip={open ? 'Hide the orders' : 'Show the orders'} data-tip-side="left" onClick={() => setOpen(!open)}>
        <span className="orders-chapter">{v.chapter || 'Orders'}</span>
        <span className="k-chip orders-count">
          <AnimatedNumber value={v.done} pop="up" popAt={0} />/<span className="num">{v.total}</span>
        </span>
        <span className="orders-chev" data-open={open}>
          <PIcon name="chevron-down" size={16} />
        </span>
      </button>
      <div className="orders-meter" aria-hidden="true">
        <span className="orders-meter-fill" style={{ ['--p' as string]: v.total ? v.done / v.total : 0 } as CSSProperties} />
      </div>
      <Presence open={open} from="down" className="orders-body">
        <Stages {...v.stages} />
        {v.won && (
          <p className="order-won k-enter" data-from="up">
            <PIcon name="trophy" size={16} />
            All orders done. Keep building!
          </p>
        )}
        <ul className="order-list">
          {entries.map(({ key, item, attrs }, i) => (
            <li key={key} className="order" data-done={item.done} style={{ ['--k-delay' as string]: `${i * 40}ms` } as CSSProperties} {...attrs}>
              <OrderRow row={item} />
            </li>
          ))}
        </ul>
      </Presence>
    </Presence>
  );
}
