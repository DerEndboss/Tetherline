import type { RulesDef } from '../types';

export const rules: RulesDef[] = [
  {
    id: 'default',
    startWorld: 'rustfield',
    baseBuilding: 'base',
    slag: 'slag',
    prestigeCurrency: 'prisms',
    prestigeYieldBonus: 0.2,
    prestigeReward: { base: 20, creditsPerPrism: 2500 },
    startResources: [{ id: 'credits', amount: 0 }],
    primaryCurrency: 'credits',
    relicRarityWeights: { common: 6, rare: 3, legendary: 1 },
    menuAfterDrones: 1,
    startDrones: [{ id: 'build-drone', amount: 1 }, { id: 'transport-drone', amount: 1 }],
    sellFromTier: 2,
    stockReserve: 25,
    stockReserveUpToTier: 3,
    stockReserveCap: 0.4,
    guide: ['mine', 'smelter', 'landing-pad', 'storage', 'mixer', 'fabricator', 'lab'],
  },
];
