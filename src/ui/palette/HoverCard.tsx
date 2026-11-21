import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContentRegistry } from '../../content/registry';
import { num } from '../../game/inspect/facts';
import { inspectTile, type Inspection } from '../../game/inspect/inspect';
import { GameIcon } from '../components/GameIcon';
import type { Game } from '../../game/game';
import { configKindOf } from '../config/logic';
import { useServices } from '../context';
import { formatShort } from '../format';
import { ItemIcon } from './ItemIcon';
import { placeCard, type Rect } from './hover-place';
import { Thumb } from './Thumb';

/** How fast the card follows the pointer: time constant in ms (smaller = snappier). */
const FOLLOW_MS = 55;
const REFRESH_MS = 100;

function Stacks({ c, stacks }: { c: ContentRegistry; stacks: Inspection['stacks'] }) {
  if (!stacks.length) return null;
  return (
    <p className="hover-stacks">
      {stacks.map((s) => {
        const def = c.materials.find(s.id);
        return (
          <span key={s.id} className="hover-stack" title={s.name}>
            {def && <ItemIcon def={def} size={20} />}
            <b className="num">{formatShort(s.n)}</b>
            <span className="muted">{s.name}</span>
          </span>
        );
      })}
    </p>
  );
}

function Recipe({ r }: { r: NonNullable<Inspection['recipe']> }) {
  const part = (list: typeof r.inputs): string => list.map((s) => `${num(s.n)} ${s.name}`).join(' + ');
  const out = r.outputs[0];
  return (
    <p className="hover-recipe">
      {part(r.inputs)} &rarr; {part(r.outputs)}
      {out && <span className="muted num"> · {num((out.n * 60) / r.seconds)}/min</span>}
    </p>
  );
}

/** A building's picture (with the placeholder while its art is missing) or a material icon. */
function CardIcon({ c, icon }: { c: ContentRegistry; icon: string | undefined }) {
  if (!icon) return null;
  const def = icon.startsWith('building-') ? c.buildings.find(icon.slice('building-'.length)) : undefined;
  return def ? <Thumb def={def} size={30} /> : <GameIcon id={icon} size={30} />;
}

/** "Click to set recipe" for a building the player can configure (see ui/config), then the usual hint. */
function hintOf(game: Game, noTool: boolean, info: Inspection): string | undefined {
  if (!noTool) return info.hint; // a tool in hand turns the click into placing, not selecting
  const at = info.kind === 'building' && info.rect ? game.world.at(info.rect.x, info.rect.y) : undefined;
  const kind = at ? configKindOf(game.world, at.id) : null;
  if (!kind) return info.hint;
  return `Click to set ${kind === 'recipe' ? 'recipe' : 'item'}${info.hint ? ` · ${info.hint}` : ''}`;
}

/** The building whose configuration panel is open already says what it has: no card for it on top of the panel. */
function panelOwns(game: Game, selected: number, t: { x: number; y: number }): boolean {
  return selected >= 0 && configKindOf(game.world, selected) !== null && game.world.at(t.x, t.y)?.id === selected;
}

function Card({ c, info, hint }: { c: ContentRegistry; info: Inspection; hint: string | undefined }) {
  return (
    <>
      <header className="hover-head">
        <CardIcon c={c} icon={info.icon} />
        <span className="hover-title">{info.title}</span>
        {info.status && <span className={`hover-status ${info.status.tone}`}>{info.status.text}</span>}
      </header>
      {info.lines.length > 0 && (
        <dl className="hover-lines">
          {info.lines.map((l) => (
            <div key={l.label} className={l.tone ?? 'plain'}>
              <dt>{l.label}</dt>
              <dd className="num">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {info.recipe && <Recipe r={info.recipe} />}
      <Stacks c={c} stacks={info.stacks} />
      {hint && <p className="hover-hint muted">{hint}</p>}
    </>
  );
}

/** The HUD's plates the card keeps off: quick bar, hint bar, palette, core window, orders, radio, tutorial card, corner buttons. */
const PLATES = '.hud .hud-card, .tut-card, .hud .corner-buttons';

/** Their rectangles now (read at the card's refresh pace, never per frame). */
function plateRects(): Rect[] {
  const out: Rect[] = [];
  document.querySelectorAll(PLATES).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  return out;
}

/**
 * The hover card: a small card that follows the mouse over the map and says
 * what is there: a building (status, recipe, rate, power, what it holds), a belt (what lies on it), an ore or
 * liquid field, a wreck, rock, a boulder. Mouse only; hidden while a button is held (drags) or over the HUD.
 */
export function HoverCard() {
  const { game, interaction } = useServices();
  const [info, setInfo] = useState<Inspection | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, over: false });
  const plates = useRef<Rect[]>([]);
  const shown = useRef('');

  useEffect(() => {
    const move = (e: PointerEvent): void => {
      pointer.current = { x: e.clientX, y: e.clientY, over: e.pointerType === 'mouse' && e.buttons === 0 && e.target instanceof HTMLCanvasElement };
    };
    const leave = (): void => {
      pointer.current.over = false;
    };
    window.addEventListener('pointermove', move);
    document.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
    };
  }, []);

  useEffect(() => {
    const refresh = (): void => {
      const t = interaction.hover;
      const wanted = pointer.current.over && t && !panelOwns(game, interaction.getView().selected, t);
      const next = wanted && t ? inspectTile(game.world, t.x, t.y) : null;
      if (next) plates.current = plateRects();
      const key = next ? JSON.stringify(next) : '';
      if (key === shown.current) return;
      shown.current = key;
      setInfo(next);
    };
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [game, interaction]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let pos: { x: number; y: number } | null = null;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const el = card.current;
      if (!el) {
        pos = null;
        return;
      }
      const goal = placeCard(pointer.current.x, pointer.current.y, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight, plates.current);
      const k = 1 - Math.exp(-(now - last) / FOLLOW_MS);
      pos = pos ? { x: pos.x + (goal.x - pos.x) * k, y: pos.y + (goal.y - pos.y) * k } : goal;
      last = now;
      el.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!info) return null;
  // a portal, like the build tip: the tutorial's ring and card (outside the HUD) must not lie over what the card says
  return createPortal(
    <div ref={card} className="hover-card" role="status" aria-live="off">
      <Card c={game.content} info={info} hint={hintOf(game, interaction.getView().mode.kind === 'none', info)} />
    </div>,
    document.body,
  );
}
