import './conduits';
import './tank';
import './pumps';
import { curveIds, ownedIds, plan, planExtra, rotIds } from '../kit';

/**
 * Category "liquids" (v2): conduits (straight, bends), junction, router, tank, bridge and the pumps the content
 * files here, `building-<id>`. Rotating pieces add `-r0..3`, bends `-curve-l|r-r0..3` (docs/art.md).
 */
plan(ownedIds('liquids'));
planExtra([...rotIds('conduit'), ...curveIds('conduit'), ...rotIds('conduit-bridge')]);

