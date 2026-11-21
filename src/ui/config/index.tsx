import { useMenuOpen, useInteraction, useWorldSelector } from '../context';
import { ConfigPanel, type ConfigView } from './ConfigPanel';
import { configKindOf } from './logic';

export type { ConfigView } from './ConfigPanel';

/**
 * Configuration panel slot: while the selected building (a plain click with no tool) is a factory with several
 * recipes, a sorter or an unloader, its panel floats beside it. Mounted next to the tutorial guide in main.tsx
 * because it needs the world view to follow the building on screen.
 */
export function ConfigHud({ view }: { view: ConfigView }) {
  const { selected } = useInteraction();
  const menu = useMenuOpen();
  const kind = useWorldSelector((w) => (selected >= 0 ? configKindOf(w, selected) : null));
  if (menu || !kind) return null;
  return (
    <div className="cfg-layer">
      <ConfigPanel key={selected} id={selected} kind={kind} view={view} />
    </div>
  );
}
