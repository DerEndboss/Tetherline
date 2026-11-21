import { content } from '../../src/content';
import { curveIds, ownedIds, plan, planExtra, rotIds } from '../kit';
import './belts';
import './routing';
import './driver';

/**
 * Category "logistics" (v2): every belt and item router, `building-<id>`. Rotating pieces add `-r0..3`,
 * belt bends `-curve-l|r-r0..3` (docs/art.md). Pieces that exist as content but have no
 * model yet draw their generated block.
 */
plan(ownedIds('logistics'));
const belts = content.buildings.list.filter((b) => b.category === 'logistics' && b.behaviour === 'conveyor').map((b) => b.id);
planExtra([...belts.flatMap((id) => [...rotIds(id), ...curveIds(id)]), ...rotIds('bridge-conveyor')]);
