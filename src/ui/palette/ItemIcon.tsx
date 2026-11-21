import type { MaterialDef } from '../../content/types';
import { GameIcon } from '../components/GameIcon';

/** A material's 3D icon, or a chip in its colours while there is none. */
export function ItemIcon({ def, size = 20 }: { def: MaterialDef; size?: number }) {
  const chip = <span className="item-chip" style={{ width: size, height: size, background: def.color }} aria-hidden="true" />;
  return <GameIcon id={def.icon} size={size} fallback={chip} />;
}
