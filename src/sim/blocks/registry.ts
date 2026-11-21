import type { Behaviour } from '../../content/types';
import type { BlockBehaviour } from './types';

/**
 * The behaviour table, filled by blocks/index.ts. It lives in its own module without imports so the blocks can
 * use items.ts / power.ts (which read this table) without an import cycle at load time.
 */
export const BLOCKS = {} as Record<Behaviour, BlockBehaviour>;
