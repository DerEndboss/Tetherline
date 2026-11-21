import { ownedIds, plan } from '../kit';
import { registerItems } from './items';
import { registerMisc } from './misc';
import { registerV2Icons } from './v2';

/**
 * Icons category: every material, currency, relic, tech, skill branch and skill icon (each its own silhouette,
 * fixed 32 px box, rendered at 8x for the UI) and the no-power badge. See docs/art.md.
 */
plan(ownedIds('icons'));
registerItems();
registerV2Icons();
registerMisc();
