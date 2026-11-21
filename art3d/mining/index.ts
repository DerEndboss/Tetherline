import { ownedIds, plan } from '../kit';
import { idsOf } from './common';
import { registerDrills } from './drills';
import { registerPumps } from './pumps';

/**
 * Category "mining" (docs/architecture.md): drills, pumps, extractors. A sprite is
 * `building-<id>`; animated machines add the work loop `-wb`, `-w0..w11` (kit/loop.ts, see common.ts).
 */
plan(ownedIds('mining'));
plan(idsOf(['mechanical-drill', 'pneumatic-drill', 'electric-drill', 'laser-drill', 'mechanical-pump', 'ground-pump', 'oil-derrick', 'slag-tap', 'water-extractor', 'salvage-drill'], true));
registerDrills();
registerPumps();
