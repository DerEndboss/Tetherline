import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ContentRegistry } from '../../content/registry';
import { SAVED_EVENT } from '../../save/autosave';
import { metaStore } from '../../save/meta';
import type { SimEvent } from '../../sim/commands';
import { sendProgress } from '../../sim/progression';
import { Icon, type IconName } from '../components/Icon';
import { usePresenceList } from '../components/Presence';
import { useServices, useSnapshot } from '../context';
import { holdToasts, pushToast, toastStore, type Toast } from './toasts';
import { currencyName } from './view';

/** Pays Blueprints a run earned into the meta store (once) and tells the sim they were paid. */
function usePayout(): void {
  const { game } = useServices();
  useSnapshot();
  const p = game.world.state.progress;
  const pending = (p.earned ?? 0) - (p.claimed ?? 0);
  const busy = useRef(false);
  const seed = game.world.state.seed;
  const earned = p.earned ?? 0;
  useEffect(() => {
    if (pending <= 0 || busy.current) return;
    busy.current = true;
    void metaStore.earn(pending).then(() => {
      sendProgress({ run: seed, type: 'claimed', to: earned });
      pushToast({ kind: 'points', text: `+${pending} ${currencyName(pending, game.content.rules.metaCurrency)}` });
      busy.current = false;
    });
  }, [pending, earned, seed, game.content.rules.metaCurrency]);
}

/** The first round's guide ends by itself once its orders are done. */
function useTutorialDone(): void {
  const { game } = useServices();
  useSnapshot();
  const w = game.world;
  const tutorialIds = w.content.orders.list.filter((o) => o.tutorial).map((o) => o.id);
  const active = w.state.progress.active.some((a) => tutorialIds.includes(a.id));
  const anyDone = w.state.progress.done.some((id) => tutorialIds.includes(id));
  useEffect(() => {
    if (!active && anyDone) void metaStore.finishTutorial();
  }, [active, anyDone]);
}

/** The notice for an event: an order done, a blueprint salvaged from a wreck. */
function eventToast(c: ContentRegistry, e: SimEvent): string | null {
  if (e.type === 'order-done') {
    const def = c.orders.find(e.id);
    return def ? `Order done: ${def.title}` : null;
  }
  if (e.type === 'wreck-salvaged') return `Blueprint salvaged: ${c.buildings.find(e.building)?.name ?? e.building}`;
  return null;
}

/** The windows a notice must never lie on: the drone sheet, the blueprint shelf, a building's recipe panel. */
const PANELS = '.dr-panel, .bp-panel, .cfg-panel';

/** Whether the notice stack (laid out by CSS) would cover an open panel right now. One layout read per call. */
function coversPanel(layer: HTMLElement): boolean {
  const l = layer.getBoundingClientRect();
  return [...document.querySelectorAll(PANELS)].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && l.left < r.right && l.right > r.left && l.top < r.bottom && l.bottom > r.top;
  });
}

/** How long after a change of the page the check waits, so a burst of changes costs one check. */
const CHECK_MS = 50;

/**
 * While notices are on screen and one would lie on a panel, they wait (hidden, their time stopped) until the panel is
 * gone: the "Order done" notice sat on the phone's drone sheet and hid its title. The first check runs before the notice
 * is painted, later ones follow changes of the page (a panel coming or going, a resize) after a short pause, and only
 * while there is a notice.
 */
function useHoldOverPanels(layer: RefObject<HTMLElement | null>, present: boolean): boolean {
  const [hold, setHold] = useState(false);
  useLayoutEffect(() => {
    if (!present) return undefined;
    let timer = 0;
    const check = (): void => {
      timer = 0;
      const el = layer.current;
      const next = el ? coversPanel(el) : false;
      holdToasts(next);
      setHold(next);
    };
    const schedule = (): void => {
      if (!timer) timer = window.setTimeout(check, CHECK_MS);
    };
    check();
    const dom = new MutationObserver(schedule);
    dom.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-presence'] });
    window.addEventListener('resize', schedule);
    return () => {
      window.clearTimeout(timer);
      dom.disconnect();
      window.removeEventListener('resize', schedule);
      holdToasts(false); // the layer is going (the HUD left for the menu, or no notice is left): nothing may stay held
    };
  }, [layer, present]);
  return hold;
}

/** Small notices on top of the world: an order finished, Blueprints paid, the game saved. */
export function Effects() {
  const { game } = useServices();
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.get);
  usePayout();
  useTutorialDone();
  // the victory card already says what the notices would: they wait behind it
  const p = game.world.state.progress;
  const hush = p.won === true && !p.celebrated;
  useEffect(() => {
    const off = game.onEvents((events) => {
      for (const e of events) {
        const text = eventToast(game.world.content, e);
        if (text) pushToast({ kind: 'order', text });
      }
    });
    const saved = (): void => pushToast({ kind: 'saved', text: 'Saved' });
    window.addEventListener(SAVED_EVENT, saved);
    return () => {
      off();
      window.removeEventListener(SAVED_EVENT, saved);
    };
  }, [game]);
  const entries = usePresenceList(toasts, (t) => t.key, 'down');
  const layer = useRef<HTMLDivElement>(null);
  const hold = useHoldOverPanels(layer, toasts.length > 0);
  // portal: the notices float above the HUD's own layer and the tutorial card, and keep off every open panel
  return createPortal(
    <div ref={layer} className="toast-layer k-toasts" data-hush={hush} data-hold={hold} aria-live="polite">
      {entries.map(({ key, item, attrs }) => (
        <p key={key} className="k-toast" data-kind={item.kind} {...attrs}>
          <ToastMark kind={item.kind} />
          {item.text}
        </p>
      ))}
    </div>,
    document.body,
  );
}

const MARKS: Record<Toast['kind'], IconName | null> = { order: 'check', points: 'prism', warn: 'alert', error: 'alert', saved: null };

/** The mark in front of a notice: a check for an order, a prism for Blueprints, a triangle for trouble; "Saved" keeps the kit's small diamond. */
function ToastMark({ kind }: { kind: Toast['kind'] }) {
  const name = MARKS[kind];
  if (!name) return null;
  return (
    <span className="k-toast-icon" aria-hidden="true">
      <Icon name={name} size={16} />
    </span>
  );
}
