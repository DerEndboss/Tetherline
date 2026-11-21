import { memo, useEffect, useMemo, type CSSProperties } from 'react';
import type { BuildCategory, BuildingDef } from '../../content/types';
import { Icon } from '../components/Icon';
import { ToolIcon } from '../tools/icons';
import { useInteraction, useServices, useSnapshot } from '../context';
import { CATEGORIES, categoryList, nextCoreId } from './categories';
import { CategoryIcon } from './CategoryIcon';
import { setDragging } from './drag-store';
import { ItemIcon } from './ItemIcon';
import { keyLabel, useViewportHeight, useViewportWidth } from './keys';
import { PHONE_WIDTH } from './phone';
import { keptSetting, settingMark } from './setting';
import { usePaletteState } from './store';
import { Thumb } from './Thumb';
import { isPhoneStack, setTrayFolded, useGuideOn, useTrayFolded } from './tab-store';
import { tipStore, useTip } from './tip-store';
import { canAfford, isUnlocked } from './unlock';

export const DRAG_TYPE = 'application/x-groundbreak-building';

const COLUMNS = 5;
const MIN_CELLS = 15;
/** Each entry rises a beat after the one before it when a tab opens. */
const STAGGER_MS = 14;

interface CellProps {
  def: BuildingDef;
  index: number;
  picked: boolean;
  locked: boolean;
  poor: boolean;
  keyCap: string | null;
}

/** One entry of the grid. Memoised: the 10 Hz snapshot only re-renders the entries whose state changed. */
const Cell = memo(function Cell({ def, index, picked, locked, poor, keyCap }: CellProps) {
  const { interaction } = useServices();
  const cls = `pal-item k-press k-follow${locked ? ' locked' : ''}${poor && !locked ? ' poor' : ''}`;
  return (
    <button
      type="button"
      className={cls}
      style={{ '--k-delay': `${index * STAGGER_MS}ms` } as CSSProperties}
      aria-pressed={picked}
      aria-label={def.name}
      aria-disabled={locked}
      data-building={def.id}
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, def.id);
        e.dataTransfer.effectAllowed = 'copy';
        const thumb = e.currentTarget.querySelector('.pal-thumb');
        if (thumb) e.dataTransfer.setDragImage(thumb, 22, 22);
        tipStore.press(e.currentTarget);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && tipStore.enter(def, e.currentTarget, 'left')}
      onPointerLeave={(e) => tipStore.leave(e.currentTarget)}
      onPointerDown={(e) => tipStore.press(e.currentTarget)}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && tipStore.enter(def, e.currentTarget, 'left', false)}
      onBlur={(e) => tipStore.leave(e.currentTarget)}
      onClick={() => {
        if (locked) return;
        if (picked) return interaction.cancel();
        interaction.startPlacing(def.id);
        // a phone: the map needs the room now, the tray folds to its tabs (and the price of what is in hand)
        if (isPhoneStack()) setTrayFolded(true);
      }}
    >
      <span className="pal-thumb">
        <Thumb def={def} size={44} />
      </span>
      {keyCap && <span className="keycap pal-key">{keyCap}</span>}
      {locked && (
        <span className="pal-lock" aria-hidden="true">
          <Icon name="lock" size={12} />
        </span>
      )}
    </button>
  );
});

/** The price of a building as chips: each amount with its material, coral while the core is short of it. */
function Cost({ def }: { def: BuildingDef }) {
  const { game } = useServices();
  const snap = useSnapshot();
  const c = game.content;
  return (
    <span className="pal-info-cost">
      {def.cost.map((s) => {
        const mat = c.materials.find(s.item);
        const short = (snap.stock[c.materials.indexOf(s.item)] ?? 0) < s.n;
        return (
          <span key={s.item} className={`pal-cost${short ? ' short' : ''}`} data-tip={mat?.name ?? s.item}>
            {mat && <ItemIcon def={mat} size={18} />}
            <b className="num">{s.n}</b>
          </span>
        );
      })}
      {!def.cost.length && <span className="muted">Free</span>}
    </span>
  );
}

/** A phone has no R key: a building that turns gets a Rotate button next to its price while it is in hand. */
function RotateButton() {
  const { interaction } = useServices();
  return (
    <button type="button" className="button ibtn pal-rotate" aria-label="Rotate" data-tip="Turn it a quarter" onClick={() => interaction.rotate()}>
      <ToolIcon name="rotate" size={20} />
    </button>
  );
}

/**
 * What the entry under the mouse (or the one in your hand) costs, at a glance and on touch screens, which have no tooltip.
 * A Smelter that carries a recipe says which.
 */
function InfoStrip({ def }: { def: BuildingDef | null }) {
  const { game, interaction } = useServices();
  const view = useInteraction();
  const { hotbar } = usePaletteState();
  const phone = useViewportWidth() < PHONE_WIDTH;
  if (!def) return <p className="pal-info pal-info-empty">{hotbar && !phone ? 'Pick a building. Drag it onto the quick bar to keep it.' : 'Pick a building.'}</p>;
  const held = view.mode.kind === 'place' && view.mode.building === def.id;
  const mark = held ? settingMark(game.content, def, keptSetting(def, interaction.toolSetting)) : null;
  return (
    <div className="pal-info" key={def.id}>
      <span className="pal-info-head">
        <span className="pal-info-name">
          {def.name}
          {mark && <span className="muted"> · {mark.name}</span>}
        </span>
        <span className="k-chip num">
          {def.size}x{def.size}
        </span>
      </span>
      <Cost def={def} />
      {held && def.rotates && isPhoneStack() && <RotateButton />}
    </div>
  );
}

interface TabsProps {
  tab: BuildCategory;
  onTab: (t: BuildCategory) => void;
  counts: Record<string, number>;
}

/**
 * The category tabs: a lit plate glides to the chosen one (transform only), the labels fade their colour. On a phone the
 * open tab is also the fold: tapping it again folds the buildings away, tapping any tab opens them (the guide keeps them open).
 */
function Tabs({ tab, onTab, counts, folded, foldable }: TabsProps & { folded: boolean; foldable: boolean }) {
  const index = Math.max(0, CATEGORIES.findIndex((c) => c.id === tab));
  const choose = (id: BuildCategory): void => {
    if (id === tab && foldable && isPhoneStack()) return setTrayFolded(!folded);
    onTab(id);
    setTrayFolded(false);
  };
  return (
    <div className="pal-tabs" role="tablist" aria-orientation={isPhoneStack() ? 'horizontal' : 'vertical'} style={{ '--i': index, '--n': CATEGORIES.length } as CSSProperties}>
      <span className="pal-glide" aria-hidden="true" />
      {CATEGORIES.map((c) => (
        <button key={c.id} type="button" role="tab" className="pal-tab" data-category={c.id} aria-selected={tab === c.id} aria-label={c.name} onClick={() => choose(c.id)}>
          <CategoryIcon id={c.id} size={16} />
          <span className="pal-tab-name">{c.name}</span>
          <span className="pal-tab-n num">{counts[c.id] || ''}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The Mindustry-style palette, bottom right, always open and full: icon grid on the left, category tabs on the right,
 * a strip with the cost of what you point at (or hold) under the grid. Locked buildings show greyed with a lock,
 * unaffordable ones with a coral dot. Number keys (see keys.ts) pick from the hotbar, or from this tab while the
 * hotbar is off. Drag an entry onto a hotbar slot to keep it there. Opening a tab raises its entries one after another.
 */
export function Palette({ tab, onTab }: { tab: BuildCategory; onTab: (t: BuildCategory) => void }) {
  const { game, interaction } = useServices();
  const view = useInteraction();
  const snap = useSnapshot();
  const ps = usePaletteState();
  const width = useViewportWidth();
  const height = useViewportHeight();
  const { hover } = useTip();
  const world = game.world;
  const all = game.content.buildings.list;
  const nextCore = nextCoreId(world);
  const list = useMemo(() => categoryList(all, tab, nextCore), [all, tab, nextCore]);
  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, categoryList(all, c.id, nextCore).length])), [all, nextCore]);
  // an entry is "in hand" only while it is the plain building: one that carries a setting (a Q pick, a quick bar slot) is not this entry
  const picked = view.mode.kind === 'place' && interaction.toolSetting < 0 ? view.mode.building : null;
  const cells = Math.max(MIN_CELLS, Math.ceil(list.length / COLUMNS) * COLUMNS);
  // The tip hangs on an entry that a tab change removes: let it go with it.
  useEffect(() => tipStore.reset(), [tab]);
  const guide = useGuideOn();
  // the guide keeps the buildings in sight while nothing is in hand (its ring points at one); with a tool in hand the map is what it needs
  const foldable = !guide || view.mode.kind !== 'none';
  const folded = useTrayFolded() && foldable;
  const heldId = view.mode.kind === 'place' ? view.mode.building : null;
  const pickedDef = heldId ? game.content.buildings.find(heldId) : null;

  return (
    <section className="hud-card palette k-enter" data-from="right" aria-label="Build" data-collapsed={folded || undefined}>
      <div className="pal-grid k-enter" data-from="fade" role="tabpanel" key={tab}>
        {Array.from({ length: cells }, (_, i) => {
          const def = list[i];
          if (!def) return <span key={`e${i}`} className="pal-item pal-empty-cell k-follow" style={{ '--k-delay': `${i * STAGGER_MS}ms` } as CSSProperties} aria-hidden="true" />;
          return <Cell key={def.id} def={def} index={i} keyCap={keyLabel(ps, width, height, def.id, i)} picked={picked === def.id} locked={!isUnlocked(world, def)} poor={!canAfford(world, def, snap.stock)} />;
        })}
      </div>
      <InfoStrip def={hover ?? pickedDef ?? null} />
      <Tabs tab={tab} onTab={onTab} counts={counts} folded={folded} foldable={foldable} />
    </section>
  );
}
