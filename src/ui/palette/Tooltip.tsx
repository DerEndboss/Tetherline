import { useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';
import type { ContentRegistry } from '../../content/registry';
import type { BuildingDef } from '../../content/types';
import { buildingFacts, num, type RecipeFact, type StackFact } from '../../game/inspect/facts';
import { Icon } from '../components/Icon';
import { placeTip } from '../components/tip-place';
import { useServices, useSnapshot } from '../context';
import { CATEGORIES } from './categories';
import { ItemIcon } from './ItemIcon';
import type { TipView } from './tip-store';
import { Thumb } from './Thumb';
import { canAfford, unlockHint } from './unlock';

/**
 * A building with many recipes (the Particle Accelerator has a dozen) shows this many; fewer still while the tooltip would
 * be taller than the window, so it always fits.
 */
const MAX_RECIPES = 3;

function Amount({ c, s, short }: { c: ContentRegistry; s: StackFact; short?: boolean }) {
  const def = s.kind === 'item' ? c.materials.find(s.id) : undefined;
  const dot = s.kind === 'liquid' ? <span className="item-chip" style={{ width: 12, height: 12, background: c.liquids.find(s.id)?.color }} /> : null;
  return (
    <span className={`tip-amount${short ? ' short' : ''}`}>
      {def ? <ItemIcon def={def} size={20} /> : dot}
      <b className="num">{num(s.n)}</b>
      <span className="tip-amount-name">{s.name}</span>
    </span>
  );
}

function Recipe({ c, r }: { c: ContentRegistry; r: RecipeFact }) {
  const out = r.outputs[0];
  const perMin = out ? ` · ${num((out.n * 60) / r.seconds)}/min` : '';
  return (
    <li className="tip-recipe">
      <span className="tip-recipe-io">
        {r.inputs.map((s) => (
          <Amount key={s.id} c={c} s={s} />
        ))}
        <span className="tip-arrow" aria-hidden="true">
          <Icon name="arrow" size={14} />
        </span>
        {r.outputs.map((s) => (
          <Amount key={s.id} c={c} s={s} />
        ))}
      </span>
      <span className="muted tip-rate num">
        {num(r.seconds)} s{perMin}
      </span>
    </li>
  );
}

function Banner({ kind, children }: { kind: 'locked' | 'short'; children: string }) {
  return (
    <p className="tip-banner" data-kind={kind}>
      <Icon name={kind === 'locked' ? 'lock' : 'alert'} size={16} />
      <span>{children}</span>
    </p>
  );
}

interface BodyProps {
  def: BuildingDef;
  locked: boolean;
  /** How many recipes to list. */
  recipes: number;
}

/** What the tooltip says: name and size, the one-line description, why it is locked, the cost (coral where the core is short), facts, recipes. */
function Body({ def, locked, recipes }: BodyProps) {
  const { game } = useServices();
  const snap = useSnapshot();
  const c = game.content;
  const facts = useMemo(() => buildingFacts(c, def), [c, def]);
  const shortOf = (s: StackFact): boolean => (snap.stock[c.materials.indexOf(s.id)] ?? 0) < s.n;
  const anyShort = facts.cost.some(shortOf);
  const category = CATEGORIES.find((k) => k.id === def.category)?.name;
  return (
    <div className="tip-body">
      <header className="tip-head">
        <span className="tip-plaque k-plaque">
          <Thumb def={def} size={42} />
        </span>
        <span className="tip-title">
          <span className="tip-name">{def.name}</span>
          <span className="tip-sub">{category}</span>
        </span>
        <span className="tip-size k-chip num">{facts.size}</span>
      </header>
      <p className="tip-desc">{def.description}</p>
      {locked && <Banner kind="locked">{unlockHint(def)}</Banner>}
      {!locked && anyShort && <Banner kind="short">The core is short. Place it anyway: the drone builds it once the material arrives.</Banner>}
      <hr className="k-rule" />
      <p className="tip-label">Cost</p>
      <p className="tip-row">
        {facts.cost.map((s) => (
          <Amount key={s.id} c={c} s={s} short={shortOf(s)} />
        ))}
        {!facts.cost.length && <span className="muted">Free</span>}
      </p>
      {facts.lines.length > 0 && (
        <dl className="tip-facts">
          {facts.lines.map((l) => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd className="num">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {facts.recipes.length > 0 && (
        <>
          <p className="tip-label">Makes</p>
          <ul className="tip-recipes">
            {facts.recipes.slice(0, recipes).map((r) => (
              <Recipe key={r.name} c={c} r={r} />
            ))}
          </ul>
          {facts.recipes.length > recipes && <p className="muted tip-more">and {facts.recipes.length - recipes} more {facts.recipes.length - recipes === 1 ? 'recipe' : 'recipes'}</p>}
        </>
      )}
    </div>
  );
}

/**
 * The palette tooltip: a framed card hung on its entry (side and arrow from components/tip-place). Placed once per
 * entry, after its content is in (one layout read, no per-frame work); moving to the next entry glides it there.
 * Presence attributes come from BuildTipLayer, which keeps it in the DOM while it leaves.
 */
export function BuildTooltip({ view, locked, ...rest }: { view: TipView; locked: boolean } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const { game } = useServices();
  const snap = useSnapshot();
  const affordable = canAfford(game.world, view.def, snap.stock);
  const [cap, setCap] = useState({ id: view.def.id, n: MAX_RECIPES });
  const recipes = cap.id === view.def.id ? cap.n : MAX_RECIPES;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const body = el.firstElementChild;
    const tooTall = body instanceof HTMLElement && body.scrollHeight > body.clientHeight + 1;
    // taller than the window: list one recipe less and measure again; at one recipe it is cut at its foot and fades there
    if (tooTall && recipes > 1) return setCap({ id: view.def.id, n: recipes - 1 });
    if (body instanceof HTMLElement) body.dataset.cut = String(tooTall);
    const p = placeTip(view.side, view.rect, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight);
    el.dataset.side = p.side;
    el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
    el.style.setProperty('--tip-arrow', `${Math.round(p.arrow)}px`);
  }, [view, locked, affordable, recipes]);
  return (
    <div {...rest} ref={ref} className="build-tip" role="tooltip">
      <Body def={view.def} locked={locked} recipes={recipes} />
    </div>
  );
}
