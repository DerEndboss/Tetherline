import { MAX_SLOTS, MIN_SLOTS } from './hotbar-logic';
import { paletteStore, usePaletteState } from './store';

/** The palette's settings, shown in the menu's settings: the quick bar (on/off, most slots). */
export function PaletteSettings() {
  const ps = usePaletteState();
  return (
    <>
      <fieldset className="seg-field">
        <legend>Quick bar (keys 1-9, 0)</legend>
        <label className="seg-option">
          <input type="radio" name="hotbar" checked={ps.hotbar} onChange={() => paletteStore.setHotbar(true)} />
          On
        </label>
        <label className="seg-option" data-tip="Number keys pick from the open palette tab">
          <input type="radio" name="hotbar" checked={!ps.hotbar} onChange={() => paletteStore.setHotbar(false)} />
          Off
        </label>
      </fieldset>
      <label className="field">
        <span>Quick bar slots, at most {ps.slots} (small screens show fewer)</span>
        <input type="range" min={MIN_SLOTS} max={MAX_SLOTS} step={1} value={ps.slots} disabled={!ps.hotbar} onChange={(e) => paletteStore.setSlots(Number(e.target.value))} />
      </label>
    </>
  );
}
