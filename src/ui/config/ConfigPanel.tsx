import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { BuildingDef } from '../../content/types';
import type { Building } from '../../sim/state';
import { Icon } from '../components/Icon';
import { useServices, useSnapshot } from '../context';
import { num } from '../../game/inspect/facts';
import { Thumb } from '../palette/Thumb';
import { ItemIcon } from '../palette/ItemIcon';
import { emptyMeaning, moveCursor, optionsFor, placePanel, recipeNote, type Amount, type ConfigKind, type ConfigOption, type Rect } from './logic';
import './config.css';

/** What the panel needs of the world view: the screen point of a tile's middle (main.tsx passes the WorldView). */
export interface ConfigView {
  screenOfTile(x: number, y: number): { x: number; y: number };
}

/** HUD pieces the panel keeps clear of when it picks a side of the building. */
const AVOID = ['.dock-palette', '.resources', '.dock-orders', '.dock-tools', '.tut-card', '.hotbar'];

function Chip({ a }: { a: Amount }) {
  return (
    <span className="cfg-amt" title={a.name}>
      {a.item ? <ItemIcon def={a.item} size={22} /> : <span className="cfg-drop" style={{ background: a.color }} aria-hidden="true" />}
      <b className="num">{num(a.n)}</b>
      <span className="muted">{a.name}</span>
    </span>
  );
}

function Flow({ list }: { list: Amount[] }) {
  return (
    <span className="cfg-flow">
      {list.map((a) => (
        <Chip key={a.id} a={a} />
      ))}
    </span>
  );
}

function Face({ o }: { o: ConfigOption }) {
  if (o.item) return <ItemIcon def={o.item} size={o.inputs.length ? 40 : 36} />;
  if (o.empty) return <Icon name={o.label === 'None' ? 'close' : 'spark'} size={28} />;
  return <span className="cfg-drop big" style={{ background: o.color }} aria-hidden="true" />;
}

interface TileProps {
  o: ConfigOption;
  recipe: boolean;
  tab: boolean;
  onPick: () => void;
  onCursor: () => void;
  setRef: (el: HTMLButtonElement | null) => void;
}

function Tile({ o, recipe, tab, onPick, onCursor, setRef }: TileProps) {
  const cls = `cfg-tile${recipe ? ' recipe' : ''}${o.reason ? ' dim' : ''}`;
  const label = recipe ? undefined : o.reason ? `${o.label}: ${o.reason}` : o.label;
  return (
    <button ref={setRef} type="button" role="radio" aria-checked={o.active} tabIndex={tab ? 0 : -1} className={cls} title={label} onClick={onPick} onFocus={onCursor} onMouseEnter={onCursor}>
      <Face o={o} />
      {recipe ? (
        <span className="cfg-body">
          <span className="cfg-name">
            {o.label}
            <span className="cfg-time muted num">{num(o.seconds ?? 0)} s</span>
          </span>
          <span className="cfg-io">
            <Flow list={o.inputs} />
            <span className="cfg-to" aria-label="makes">
              &rarr;
            </span>
            <Flow list={o.outputs} />
          </span>
          {o.reason && <span className="cfg-reason">{o.reason}</span>}
        </span>
      ) : (
        <span className="cfg-name small">{o.label}</span>
      )}
    </button>
  );
}

/** The line under the grid: what the focused option does, or the honest word on items already inside. */
function detail(o: ConfigOption | undefined, kind: ConfigKind, note: () => string): string {
  if (kind === 'recipe') return note();
  if (!o) return '';
  if (o.empty) return emptyMeaning(kind as 'sorter' | 'unloader');
  return o.reason ? `${o.label}: ${o.reason}. You can still choose it.` : o.label;
}

/** The panel's rectangle in the window for a building: its footprint's four ground corners projected. */
function screenBox(view: ConfigView, def: BuildingDef, x: number, y: number): Rect {
  const pts = [
    [0, 0],
    [def.size, 0],
    [0, def.size],
    [def.size, def.size],
  ].map(([dx, dy]) => view.screenOfTile(x + (dx ?? 0) - 0.5, y + (dy ?? 0) - 0.5));
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}

function avoidRects(): Rect[] {
  const out: Rect[] = [];
  for (const el of document.querySelectorAll(AVOID.join(','))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
  }
  return out;
}

/** Keeps the panel beside the building while the camera moves, writing the position straight to the element. */
function useFollow(root: React.RefObject<HTMLDivElement | null>, view: ConfigView, def: BuildingDef, x: number, y: number): void {
  useLayoutEffect(() => {
    let frame = 0;
    const tick = (): void => {
      const el = root.current;
      if (el) {
        const at = placePanel(screenBox(view, def, x, y), { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }, avoidRects());
        el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
        el.dataset.ready = 'true';
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [root, view, def, x, y]);
}

/** What a key does in the grid: the tile to move to for an arrow, Home or End (the camera must not pan), else null. */
function stepOf(key: string, cols: number, cursor: number, n: number): number | null {
  if (!key.startsWith('Arrow') && key !== 'Home' && key !== 'End') return null;
  return moveCursor(cursor, key, cols, n);
}

type Pick = { over: number; value: number } | null;

/** The options with the player's latest pick shown as current until the sim has caught up. */
function withPick(options: ConfigOption[], picked: Pick, config: number): ConfigOption[] {
  return picked?.over !== config ? options : options.map((o) => ({ ...o, active: o.value === picked.value }));
}

const SUBTITLE: Record<ConfigKind, string> = { recipe: 'Choose a recipe', sorter: 'Item that goes straight on', unloader: 'Item to take out' };

function Head({ def, kind }: { def: BuildingDef; kind: ConfigKind }) {
  const { interaction } = useServices();
  return (
    <header className="cfg-head">
      <Thumb def={def} size={32} />
      <span className="cfg-title">
        <b>{def.name}</b>
        <span className="muted">{SUBTITLE[kind]}</span>
      </span>
      <button type="button" className="cfg-close" aria-label="Close" onClick={() => interaction.cancel()}>
        <Icon name="close" size={16} />
      </button>
    </header>
  );
}

interface GridProps {
  options: ConfigOption[];
  recipe: boolean;
  /** Where the cursor is: the tile that is in the tab order, and the one the line below talks about. */
  at: number;
  setCursor: (i: number) => void;
  onPick: (o: ConfigOption) => void;
}

/** The tiles. Arrow keys move through them (and never pan the camera), Home / End jump; Enter and Space press a tile. */
function Grid({ options, recipe, at, setCursor, onPick }: GridProps) {
  const grid = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    tiles.current[at]?.focus(); // the first open puts the focus on the current choice
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only the first open focuses
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === ' ') {
      e.stopPropagation(); // Space pauses the game; here it presses the tile (the click still follows)
      return;
    }
    const cols = Math.max(1, getComputedStyle(grid.current!).gridTemplateColumns.split(' ').length);
    const next = stepOf(e.key, cols, at, options.length);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    setCursor(next);
    tiles.current[next]?.focus();
  };
  return (
    <div ref={grid} className={`cfg-grid ${recipe ? 'recipes' : 'items'}`} role="radiogroup" aria-label={recipe ? 'Recipes' : 'Items'} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <Tile
          key={o.key}
          o={o}
          recipe={recipe}
          tab={i === at}
          onPick={() => onPick(o)}
          onCursor={() => setCursor(i)}
          setRef={(el) => {
            tiles.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}

function Panel({ b, def, kind, view }: { b: Building; def: BuildingDef; kind: ConfigKind; view: ConfigView }) {
  const { game } = useServices();
  const w = game.world;
  const root = useRef<HTMLDivElement>(null);
  // the pick shows at once; it stands only while the building's config is the one it was made over
  const [picked, setPicked] = useState<Pick>(null);
  const [cursor, setCursor] = useState(-1);
  useFollow(root, view, def, b.x, b.y);
  const options = withPick(optionsFor(w, b, kind), picked, b.config);
  const at = cursor < 0 ? Math.max(0, options.findIndex((o) => o.active)) : cursor;
  const recipe = kind === 'recipe';
  const pick = (o: ConfigOption): void => {
    setPicked({ over: b.config, value: o.value });
    game.enqueue({ type: 'configure', id: b.id, value: o.value });
  };
  return (
    <div ref={root} className="cfg-panel" role="dialog" aria-label={`${def.name}: ${recipe ? 'recipe' : 'item'}`} data-kind={kind}>
      <Head def={def} kind={kind} />
      <Grid options={options} recipe={recipe} at={at} setCursor={setCursor} onPick={pick} />
      <p className="cfg-detail muted" aria-live="polite">
        {detail(options[at], kind, () => recipeNote(w, b))}
      </p>
    </div>
  );
}

/**
 * The configuration panel of the selected building (recipe of a factory, item of a sorter or unloader), beside the
 * building. A click on a tile sends `configure`; Esc or a click on the map selects something else and so closes it.
 */
export function ConfigPanel({ id, kind, view }: { id: number; kind: ConfigKind; view: ConfigView }) {
  const { game } = useServices();
  useSnapshot();
  const b = game.world.byId.get(id);
  return b ? <Panel b={b} def={game.world.def(b)} kind={kind} view={view} /> : null;
}
