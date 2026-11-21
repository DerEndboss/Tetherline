import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { BuildingDef } from '../../content/types';
import { isTextEntry } from '../../game/hotkeys';
import { usePresence } from '../components/Presence';
import { flash } from '../motion';
import { useInteraction, useServices, useSnapshot } from '../context';
import { setDragging, useDragging } from './drag-store';
import { NO_SETTING, slotForPick, slotLabel, slotOf, visibleSlots, WIDE_BAR } from './hotbar-logic';
import { ItemIcon } from './ItemIcon';
import { useViewportHeight, useViewportWidth } from './keys';
import { DRAG_TYPE } from './Palette';
import { heldTool, keptSetting, settingMark, type SettingMark, type Tool } from './setting';
import { paletteStore, usePaletteState } from './store';
import { Thumb } from './Thumb';
import { tipStore } from './tip-store';
import { canAfford } from './unlock';

const SLOT_TYPE = 'application/x-groundbreak-slot';

interface SlotProps {
  i: number;
  def: BuildingDef | undefined;
  /** The setting the slot remembers (a recipe, a sorter's item), -1 = none, and how it looks. */
  config: number;
  mark: SettingMark | null;
  picked: boolean;
  poor: boolean;
  /** The building in your hand with its setting and how that looks: an empty slot offers to take it. */
  hand: (Tool & { def: BuildingDef; mark: SettingMark | null }) | null;
}

/** What a drop on a slot carries: a building from the palette, or another slot to swap with. */
function dropOn(i: number, e: React.DragEvent): void {
  e.preventDefault();
  const id = e.dataTransfer.getData(DRAG_TYPE);
  const from = e.dataTransfer.getData(SLOT_TYPE);
  if (id) paletteStore.assign(i, id, NO_SETTING);
  else if (from !== '') paletteStore.swap(Number(from), i);
}

/** The state classes of a slot, space separated. */
function slotClass(on: { picked: boolean; poor: boolean; over: boolean; empty: boolean; fillable: boolean }): string {
  const states = (Object.keys(on) as (keyof typeof on)[]).filter((k) => on[k]);
  return ['hot-slot', 'k-press', ...states].join(' ');
}

/** The words on an empty slot's tooltip. */
function emptyTip(hand: SlotProps['hand']): string {
  if (!hand) return 'Empty slot. Drag a building here';
  return `Put ${hand.def.name}${hand.mark ? ` (${hand.mark.name})` : ''} here`;
}

/** The small picture of a slot's setting, in the corner of the building: an item, or the colour of a liquid. */
function SettingBadge({ mark }: { mark: SettingMark }) {
  return (
    <span className="hot-set" data-setting={mark.name} aria-hidden="true">
      {mark.item ? <ItemIcon def={mark.item} size={16} /> : <span className="hot-set-drop" style={{ background: mark.color ?? 'currentColor' }} />}
    </span>
  );
}

/** Pops the picture when a slot gets a (new) building, so a drop is felt. */
function usePopOnFill(id: string | undefined): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement>(null);
  const before = useRef(id);
  useEffect(() => {
    if (id && before.current !== id && ref.current) flash(ref.current, 'up');
    before.current = id;
  }, [id]);
  return ref;
}

function Slot({ i, def, config, mark, picked, poor, hand }: SlotProps) {
  const { interaction } = useServices();
  const [over, setOver] = useState(false);
  const thumb = usePopOnFill(def ? `${def.id}:${config}` : undefined);
  const click = (): void => {
    if (def) return picked ? interaction.cancel() : interaction.startPlacing(def.id, config);
    // An empty slot takes the building in your hand, with the setting it carries.
    if (hand) paletteStore.assign(i, hand.id, hand.config);
  };
  const cls = slotClass({ picked, poor, over, empty: !def, fillable: !def && hand !== null });
  const label = def ? `${def.name}${mark ? ` (${mark.name})` : ''}, slot ${slotLabel(i)}` : `Empty slot ${slotLabel(i)}`;
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      aria-pressed={picked}
      draggable={def !== undefined}
      data-setting={mark?.name}
      data-tip={def ? undefined : emptyTip(hand)}
      data-tip-keys={def ? undefined : slotLabel(i)}
      onDragStart={(e) => {
        e.dataTransfer.setData(SLOT_TYPE, String(i));
        e.dataTransfer.effectAllowed = 'move';
        const img = e.currentTarget.querySelector('.hot-thumb');
        if (img) e.dataTransfer.setDragImage(img, 19, 19);
        tipStore.press(e.currentTarget);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        dropOn(i, e);
        setDragging(false);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        paletteStore.assign(i, null);
      }}
      onPointerEnter={(e) => def && e.pointerType === 'mouse' && tipStore.enter(def, e.currentTarget, 'top')}
      onPointerLeave={(e) => tipStore.leave(e.currentTarget)}
      onPointerDown={(e) => tipStore.press(e.currentTarget)}
      onFocus={(e) => def && e.currentTarget.matches(':focus-visible') && tipStore.enter(def, e.currentTarget, 'top', false)}
      onBlur={(e) => tipStore.leave(e.currentTarget)}
      onClick={click}
    >
      {def && (
        <span className="hot-thumb" ref={thumb}>
          <Thumb def={def} size={38} />
        </span>
      )}
      {mark && <SettingBadge mark={mark} />}
      <span className="keycap hot-key">{slotLabel(i)}</span>
    </button>
  );
}

/** Q puts the picked building, with the setting Q took from it, into a slot (its own, the first empty, or the active one). */
function usePickIntoSlot(visible: number, active: RefObject<number>): void {
  const { game, interaction } = useServices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'q' || isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      window.setTimeout(() => {
        const tool = heldTool(game.content, interaction);
        if (!tool || !paletteStore.get().hotbar) return;
        const ps = paletteStore.get();
        const slots = { ids: ps.assigned, configs: ps.configs };
        const to = slotForPick(slots, tool.id, tool.config, visible, active.current);
        if (ps.assigned[to] !== tool.id || ps.configs[to] !== tool.config) paletteStore.assign(to, tool.id, tool.config);
      }, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, interaction, visible, active]);
}

/**
 * The Minecraft-style quick bar: up to 10 slots under keys 1-9 and 0, filled by dragging from the palette,
 * by Shift + number, by Q (pick) or by clicking an empty slot with a building in hand. Right click empties a slot.
 * Slots shown follow the screen (phone 5, a phone on its side 6, tablet 8, wide PC up to the setting); the setting is the maximum.
 * A slot keeps the setting of what it was filled with: a Smelter picked on its Steel recipe comes back as that Smelter,
 * with the recipe's product shown small in the corner of the slot.
 */
export function Hotbar() {
  const { game, interaction } = useServices();
  const ps = usePaletteState();
  const view = useInteraction();
  const snap = useSnapshot();
  const width = useViewportWidth();
  const height = useViewportHeight();
  const dragging = useDragging();
  const lastActive = useRef(0);
  const visible = visibleSlots(ps.slots, width, height);
  const held = view.mode.kind === 'place' ? heldTool(game.content, interaction) : null;
  const slots = { ids: ps.assigned, configs: ps.configs };
  const activeNow = held ? slotOf(slots, held.id, held.config) : -1;
  useEffect(() => {
    if (activeNow >= 0) lastActive.current = activeNow;
  }, [activeNow]);
  usePickIntoSlot(visible, lastActive);
  const { mounted, attrs } = usePresence(ps.hotbar, 'up');
  if (!mounted) return null;
  const handDef = held ? game.content.buildings.find(held.id) : undefined;
  const hand = held && handDef ? { ...held, def: handDef, mark: settingMark(game.content, handDef, held.config) } : null;
  return (
    <div
      className={`hud-card hotbar${width >= WIDE_BAR ? ' wide' : ''}`}
      {...attrs}
      data-dragging={dragging || undefined}
      style={{ '--k-delay': '70ms' } as CSSProperties}
      role="toolbar"
      aria-label="Quick bar"
    >
      {Array.from({ length: visible }, (_, i) => {
        const id = ps.assigned[i];
        const def = id ? game.content.buildings.find(id) : undefined;
        const config = def ? keptSetting(def, ps.configs[i] ?? NO_SETTING) : NO_SETTING;
        const mark = def ? settingMark(game.content, def, config) : null;
        const isHeld = def !== undefined && held !== null && held.id === def.id && held.config === config;
        return <Slot key={i} i={i} def={def} config={config} mark={mark} picked={isHeld} poor={def !== undefined && !canAfford(game.world, def, snap.stock)} hand={hand} />;
      })}
    </div>
  );
}
