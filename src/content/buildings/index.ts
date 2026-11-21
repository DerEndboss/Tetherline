import type { BuildingDef } from '../types';
import { coreBuildings } from './core';
import { factoryBuildings } from './factories';
import { liquidBuildings } from './liquids';
import { logisticsBuildings } from './logistics';
import { megaBuildings } from './mega';
import { miningBuildings } from './mining';
import { powerBuildings } from './power';

/** Every building, one file per palette category. */
export const buildings: BuildingDef[] = [...coreBuildings, ...miningBuildings, ...logisticsBuildings, ...powerBuildings, ...factoryBuildings, ...liquidBuildings, ...megaBuildings];
