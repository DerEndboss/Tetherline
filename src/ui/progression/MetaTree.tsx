import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { MetaNodeDef } from '../../content/types';
import { metaStore } from '../../save/meta';
import { nodeState } from '../../sim/progression';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Icon, type IconName } from '../components/Icon';
import { useServices } from '../context';
import { PIcon } from './icons';
import { useMeta } from './useMeta';
import { clock, currencyName } from './view';

const NODE_W = 176;
const NODE_H = 64;
const GAP_X = 36;
const GAP_Y = 12;

interface Placed {
  node: MetaNodeDef;
  col: number;
  row: number;
}

/** Columns by depth (a node sits right of everything it requires), rows in tree order. */
export function layoutTree(nodes: readonly MetaNodeDef[]): Placed[] {
  const depth = new Map<string, number>();
  const depthOf = (n: MetaNodeDef): number => {
    const known = depth.get(n.id);
    if (known !== undefined) return known;
    const d = n.requires.length ? 1 + Math.max(...n.requires.map((r) => depthOf(nodes.find((x) => x.id === r)!))) : 0;
    depth.set(n.id, d);
    return d;
  };
  const rows: number[] = [];
  return nodes.map((node) => {
    const col = depthOf(node);
    const row = rows[col] ?? 0;
    rows[col] = row + 1;
    return { node, col, row };
  });
}

const posX = (col: number): number => col * (NODE_W + GAP_X);
const posY = (row: number): number => row * (NODE_H + GAP_Y);

/** The links: lit once both ends are owned, dashed and cyan where the next step is open, dim otherwise. */
function Links({ placed, owned }: { placed: Placed[]; owned: readonly string[] }) {
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const lines = placed.flatMap((p) =>
    p.node.requires.map((r) => {
      const from = byId.get(r);
      if (!from) return null;
      const x1 = posX(from.col) + NODE_W;
      const y1 = posY(from.row) + NODE_H / 2;
      const x2 = posX(p.col);
      const y2 = posY(p.row) + NODE_H / 2;
      const mid = (x1 + x2) / 2;
      const parent = owned.includes(r);
      const state = parent && owned.includes(p.node.id) ? 'on' : parent ? 'open' : 'off';
      return <path key={`${r}-${p.node.id}`} d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`} data-state={state} />;
    }),
  );
  return <g className="tree-links">{lines}</g>;
}

function effectLine(n: MetaNodeDef): string {
  const e = n.effect;
  if (e.kind === 'unlock') return `Unlocks ${e.building.replace(/-/g, ' ')}`;
  if (e.kind === 'start-items') return 'Start items';
  return 'Run bonus';
}

/** What a node does, as a picture: a building, a crate, a spark. */
function EffectIcon({ node, size }: { node: MetaNodeDef; size: number }) {
  const kind = node.effect.kind;
  if (kind === 'start-items') return <PIcon name="box" size={size} />;
  const name: IconName = kind === 'unlock' ? 'build' : 'spark';
  return <Icon name={name} size={size} />;
}

type NodeState = ReturnType<typeof nodeState>;

function CostLine({ node, state }: { node: MetaNodeDef; state: NodeState }) {
  if (state === 'owned') {
    return (
      <span className="tree-cost">
        <Icon name="check" size={14} /> Owned
      </span>
    );
  }
  if (state === 'locked') {
    // the price shows before the node opens, so the player can plan the way there
    return (
      <span className="tree-cost num" aria-label={`Locked, costs ${node.cost}`}>
        <Icon name="lock" size={14} />
        <Icon name="prism" size={14} /> {node.cost}
      </span>
    );
  }
  return (
    <span className="tree-cost num">
      <Icon name="prism" size={14} /> {node.cost}
    </span>
  );
}

function buyLabel(state: NodeState, cost: number, points: number): string {
  if (state === 'owned') return 'Owned';
  if (state === 'locked') return 'Locked';
  if (state === 'poor') return `Need ${cost - points} more`;
  return `Unlock for ${cost}`;
}

/** The ids that became owned since the last render, so the node that was just bought can pop (no timer, no effect). */
function useFresh(owned: readonly string[]): readonly string[] {
  const [seen, setSeen] = useState(owned);
  const [fresh, setFresh] = useState<readonly string[]>([]);
  if (owned !== seen) {
    setSeen(owned);
    setFresh(owned.filter((id) => !seen.includes(id)));
  }
  return fresh;
}

/**
 * Marks the scroller with `data-more="true"` while there is more tree to the right (CSS fades that edge and shows
 * the swipe hint). Reads the layout on scroll and resize events only, never per frame, and renders nothing.
 */
function useMoreRight() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = (): void => {
      el.dataset.more = String(el.scrollWidth - el.clientWidth - el.scrollLeft > 6);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro?.disconnect();
    };
  }, []);
  return box;
}

/** The meta tree between rounds: spend Blueprints on start bonuses, faster work and new buildings. */
export function MetaTree({ onBack }: { onBack: () => void }) {
  const { game } = useServices();
  const { content } = game;
  const meta = useMeta();
  const nodes = content.meta.list;
  const placed = useMemo(() => layoutTree(nodes), [nodes]);
  const [picked, setPicked] = useState<string | null>(null);
  const fresh = useFresh(meta.owned);
  const scroller = useMoreRight();
  const sel = nodes.find((n) => n.id === picked) ?? null;
  const cols = Math.max(0, ...placed.map((p) => p.col)) + 1;
  const rows = Math.max(0, ...placed.map((p) => p.row)) + 1;
  const width = cols * (NODE_W + GAP_X) - GAP_X;
  const height = rows * (NODE_H + GAP_Y) - GAP_Y;
  const currency = content.rules.metaCurrency;
  const state = sel ? nodeState(sel, meta.owned, meta.points) : null;
  return (
    <div className="meta">
      <header className="meta-head k-head">
        <button type="button" className="button button-quiet" onClick={onBack} autoFocus>
          <Icon name="chevron-left" size={16} />
          Back
        </button>
        <h2 className="meta-title k-title">Blueprint tree</h2>
        <p className="meta-points k-chip" data-tip={`Your ${currency}`} aria-label={`${meta.points} ${currencyName(meta.points, currency)}`}>
          <Icon name="prism" size={18} />
          <AnimatedNumber value={meta.points} pop="both" popAt={0} />
          <span className="meta-points-name">{currencyName(meta.points, currency)}</span>
        </p>
      </header>
      <p className="muted meta-sub">
        Finish orders to earn {currency}. Spend them here, and every new round starts stronger.
        <span className="meta-stats">
          <span className="k-chip num">{meta.rounds} {meta.rounds === 1 ? 'round' : 'rounds'}</span>
          <span className="k-chip num">{meta.wins} won</span>
          {meta.best ? <span className="k-chip num">best {clock(meta.best)}</span> : null}
        </span>
      </p>
      <div className="tree-wrap">
      <div ref={scroller} className="tree-scroll k-scroll" data-more="false">
        <div className="tree" style={{ width, height }}>
          <svg className="tree-svg" width={width} height={height} aria-hidden="true">
            <Links placed={placed} owned={meta.owned} />
          </svg>
          {placed.map(({ node, col, row }, i) => {
            const st = nodeState(node, meta.owned, meta.points);
            return (
              <button
                key={node.id}
                type="button"
                className="tree-node k-press k-enter"
                data-state={st}
                data-fresh={fresh.includes(node.id)}
                data-from="up"
                aria-pressed={picked === node.id}
                style={{ left: posX(col), top: posY(row), width: NODE_W, height: NODE_H, ['--k-delay' as string]: `${Math.min(i, 14) * 18}ms` } as CSSProperties}
                onClick={() => setPicked(node.id)}
              >
                <span className="tree-icon k-plaque">
                  <EffectIcon node={node} size={18} />
                </span>
                <span className="tree-text">
                  <span className="tree-name">{node.name}</span>
                  <CostLine node={node} state={st} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="tree-swipe" aria-hidden="true">
        <span className="tree-swipe-touch">Swipe</span>
        <span className="tree-swipe-mouse">Scroll</span> sideways for more
        <PIcon name="chevron-down" size={14} />
      </p>
      </div>
      <div className="tree-detail k-well" aria-live="polite">
        {sel && state ? (
          <div className="tree-detail-body k-enter" data-from="fade" key={sel.id}>
            <span className="tree-detail-icon k-plaque">
              <EffectIcon node={sel} size={26} />
            </span>
            <div className="tree-detail-text">
              <p className="tree-detail-name">{sel.name}</p>
              <p className="muted">{sel.description}</p>
              <p className="tree-kind">
                <span className="k-chip">{effectLine(sel)}</span>
              </p>
            </div>
            <button type="button" className="button button-primary tree-buy" disabled={state !== 'ready'} onClick={() => void metaStore.buy(content, sel.id)}>
              {state === 'ready' && <Icon name="prism" size={16} />}
              {buyLabel(state, sel.cost, meta.points)}
            </button>
          </div>
        ) : (
          <p className="muted tree-hint">Pick a node to see what it does.</p>
        )}
      </div>
    </div>
  );
}
