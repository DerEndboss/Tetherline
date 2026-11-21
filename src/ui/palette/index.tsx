import { BuildTipLayer } from './BuildTipLayer';
import { Hotbar } from './Hotbar';
import { HoverCard } from './HoverCard';
import { usePaletteKeys } from './keys';
import { Palette } from './Palette';
import { Resources } from './Resources';
import { setPaletteTab, usePaletteTab } from './tab-store';

/**
 * The palette module of the HUD: the core window (top left on wide screens; on a phone it joins the bottom right
 * column, because the orders take the top), the palette with the quick bar (bottom right; the bar centres at the
 * bottom on wide screens), the tooltip of both and the hover card at the mouse.
 */
export function PaletteHud() {
  const tab = usePaletteTab();
  usePaletteKeys(tab);
  return (
    <>
      <div className="dock-palette">
        <Resources />
        <Hotbar />
        <Palette tab={tab} onTab={setPaletteTab} />
      </div>
      <BuildTipLayer />
      <HoverCard />
    </>
  );
}
