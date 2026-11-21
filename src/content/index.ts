import { buildings } from './buildings';
import { floors } from './floors';
import { liquids } from './liquids';
import { mapProperties, sizes, spawns } from './map';
import { materials } from './materials';
import { meta } from './meta';
import { orders } from './orders';
import { recipes } from './recipes';
import { createRegistry } from './registry';
import { rules } from './rules';
import { themes } from './themes';
import type { RawContent } from './types';

export const rawContent: RawContent = { materials, liquids, floors, buildings, recipes, orders, meta, themes, sizes, mapProperties, spawns, rules };

/** The game's content registry (validated by validate.test.ts). */
export const content = createRegistry(rawContent);
