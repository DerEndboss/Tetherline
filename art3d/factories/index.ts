import { ownedIds, plan } from '../kit';
import './furnaces';
import './workshop';
import './chemical';
import './printer';
import './extra';

/**
 * Category "factories" (docs/architecture.md): the sprites of every v2 building in this
 * palette category, `building-<id>`, plus work frames `building-<id>-w<i>` (see common.ts). Models live in the files
 * next to this one.
 */
plan(ownedIds('factories'));
