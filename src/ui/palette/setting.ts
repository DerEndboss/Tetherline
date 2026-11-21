import type { ContentRegistry } from '../../content/registry';
import type { BuildingDef, MaterialDef } from '../../content/types';
import type { Interaction } from '../../game/interaction';
import { configKind } from '../config/logic';
import { NO_SETTING } from './hotbar-logic';

/** A building with the setting it carries (-1: none). */
export interface Tool {
  id: string;
  config: number;
}

/**
 * The setting worth keeping on a quick bar slot: only a recipe, a sorter's or an unloader's item. Other buildings carry
 * data in `config` that a slot must not remember (a Q pick copies whatever the building holds).
 */
export function keptSetting(def: BuildingDef, config: number): number {
  return config >= 0 && configKind(def) !== null ? config : NO_SETTING;
}

/** The tool in hand with its setting as a slot would keep it, or null when no building is in hand. */
export function heldTool(content: ContentRegistry, interaction: Interaction): Tool | null {
  const mode = interaction.mode;
  if (mode.kind !== 'place') return null;
  const def = content.buildings.find(mode.building);
  return { id: mode.building, config: def ? keptSetting(def, interaction.toolSetting) : NO_SETTING };
}

/** What a building's setting looks like on a quick bar slot: a name for the tooltip and screen readers, and a small picture. */
export interface SettingMark {
  name: string;
  /** The item (a sorter's or unloader's choice, a recipe's main product). */
  item?: MaterialDef;
  /** A liquid-only recipe has no item to show: its liquid's colour instead. */
  color?: string;
}

/**
 * The setting `config` means on `def` (read from content, nothing made up), or null for a plain building: no setting,
 * a building that cannot be set, or a setting that points at nothing.
 */
export function settingMark(content: ContentRegistry, def: BuildingDef, config: number): SettingMark | null {
  if (config < 0) return null;
  const kind = configKind(def);
  if (kind === null) return null;
  if (kind === 'recipe') return recipeMark(content, def, config);
  const item = content.materials.list[config];
  return item ? { name: item.name, item } : null;
}

function recipeMark(content: ContentRegistry, def: BuildingDef, config: number): SettingMark | null {
  const id = def.recipes?.[config];
  const recipe = id ? content.recipes.find(id) : undefined;
  if (!recipe) return null;
  const out = recipe.outputs[0];
  const item = out ? content.materials.find(out.item) : undefined;
  if (item) return { name: recipe.name, item };
  const liquid = recipe.liquidOut?.find((l) => l.vent !== true);
  const color = liquid ? content.liquids.find(liquid.liquid)?.color : undefined;
  return color ? { name: recipe.name, color } : { name: recipe.name };
}
