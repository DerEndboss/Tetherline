import type { BuildingDef } from '../../content/types';
import { GameIcon } from '../components/GameIcon';

/** A building's picture for the palette and hotbar: its 3D sprite cropped to the object, else the placeholder, else letters. */
export function Thumb({ def, size = 40 }: { def: BuildingDef; size?: number }) {
  const letter = (
    <span className="pal-letter" style={{ width: size, height: size }}>
      {def.name.slice(0, 2)}
    </span>
  );
  const placeholder = def.art.placeholder ? <GameIcon id={def.art.placeholder} size={size} crop fallback={letter} /> : letter;
  return <GameIcon id={`building-${def.id}`} size={size} crop fallback={placeholder} />;
}
