import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { BuildingDef } from '../../content/types';
import { isTextEntry } from '../../game/hotkeys';
import { usePresence } from '../components/Presence';
import { flash } from '../motion';
import { useInteraction, useServices, useSnapshot } from '../context';
import { setDragging, useDragging } from './drag-store';
import { slotForPick, slotLabel, visibleSlots, WIDE_BAR } from './hotbar-logic';
import { useViewportWidth } from './keys';
import { DRAG_TYPE } from './Palette';
import { paletteStore, usePaletteState } from './store';
import { Thumb } from './Thumb';
import { tipStore } from './tip-store';
import { canAfford } from './unlock';

const SLOT_TYPE = 'application/x-groundbreak-slot';

interface SlotProps {
  i: number;
  def: BuildingDef | undefined;
  picked: boolean;
  poor: boolean;
  /** The building in your hand: an empty slot offers to take it. */
  hand: BuildingDef | null;
}

/** What a drop on a slot carries: a building from the palette, or another slot to swap with. */
function dropOn(i: number, e: React.DragEvent): void {
  e.preventDefault();
  const id = e.dataTransfer.getData(DRAG_TYPE);
  const from = e.dataTransfer.getData(SLOT_TYPE);
  if (id) paletteStore.assign(i, id);
  else if (from !== '') paletteStore.swap(Number(from), i);
}

/** The state classes of a slot, space separated. */
function slotClass(on: { picked: boolean; poor: boolean; over: boolean; empty: boolean; fillable: boolean }): string {
  const states = (Object.keys(on) as (keyof typeof on)[]).filter((k) => on[k]);
  return ['hot-slot', 'k-press', ...states].join(' ');
}

/** The words on an empty slot's tooltip. */
function emptyTip(hand: BuildingDef | null): string {
  return hand ? `Put ${hand.name} here` : 'Empty slot. Drag a building here';
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

function Slot({ i, def, picked, poor, hand }: SlotProps) {
  const { interaction } = useServices();
  const [over, setOver] = useState(false);
  const thumb = usePopOnFill(def?.id);
  const click = (): void => {
    if (def) return picked ? interaction.cancel() : interaction.startPlacing(def.id);
    // An empty slot takes the building in your hand.
    if (hand) paletteStore.assign(i, hand.id);
  };
  const cls = slotClass({ picked, poor, over, empty: !def, fillable: !def && hand !== null });
  return (
    <button
      type="button"
      className={cls}
      aria-label={def ? `${def.name}, slot ${slotLabel(i)}` : `Empty slot ${slotLabel(i)}`}
      aria-pressed={picked}
      draggable={def !== undefined}
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
      <span className="keycap hot-key">{slotLabel(i)}</span>
    </button>
  );
}

/** Q puts the picked building into a slot (its own, the first empty, or the active one). */
function usePickIntoSlot(visible: number, active: RefObject<number>): void {
  const { interaction } = useServices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'q' || isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      window.setTimeout(() => {
        if (interaction.mode.kind !== 'place' || !paletteStore.get().hotbar) return;
        const id = interaction.mode.building;
        const slots = paletteStore.get().assigned;
        const to = slotForPick(slots, id, visible, active.current);
        if (slots[to] !== id) paletteStore.assign(to, id);
      }, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interaction, visible, active]);
}

/**
 * The Minecraft-style quick bar: up to 10 slots under keys 1-9 and 0, filled by dragging from the palette,
 * by Shift + number, by Q (pick) or by clicking an empty slot with a building in hand. Right click empties a slot.
 * Slots shown follow the screen width (phone 5, tablet 8, wide PC up to the setting); the setting is the maximum.
 */
export function Hotbar() {
  const { game } = useServices();
  const ps = usePaletteState();
  const view = useInteraction();
  const snap = useSnapshot();
  const width = useViewportWidth();
  const dragging = useDragging();
  const lastActive = useRef(0);
  const visible = visibleSlots(ps.slots, width);
  const picked = view.mode.kind === 'place' ? view.mode.building : null;
  const activeNow = picked ? ps.assigned.indexOf(picked) : -1;
  useEffect(() => {
    if (activeNow >= 0) lastActive.current = activeNow;
  }, [activeNow]);
  usePickIntoSlot(visible, lastActive);
  const { mounted, attrs } = usePresence(ps.hotbar, 'up');
  if (!mounted) return null;
  const hand = picked ? (game.content.buildings.find(picked) ?? null) : null;
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
        return <Slot key={i} i={i} def={def} picked={def !== undefined && picked === def.id} poor={def !== undefined && !canAfford(game.world, def, snap.stock)} hand={hand} />;
      })}
    </div>
  );
}
