import { plan } from '../kit';
import { idsOf } from '../mining/common';
import { registerPower } from './v2';

/**
 * Power category (v2 only; the v1 models are gone): the v2 buildings are in v2.ts: `building-<id>`, animated ones add the
 * work loop of kit/loop.ts (`-wb`, `-w0..w11`).
 */
plan(idsOf(['solar-panel', 'large-solar'], false));
plan(idsOf(['combustion-generator', 'wind-turbine', 'oil-generator', 'battery', 'large-battery', 'power-node', 'large-power-node'], true));
registerPower();
