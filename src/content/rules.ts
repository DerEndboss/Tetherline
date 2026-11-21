import type { RulesDef } from './types';

/** Global numbers that are data, not code. */
export const rules: RulesDef = {
  startCore: 'core-shard',
  startItems: [{ item: 'copper-ore', n: 400 }],
  defaultTheme: 'rust-desert',
  defaultSize: 'medium',
  drone: { speed: 9, range: 9, buildSpeed: 1 },
  beltSlots: 3,
  mapProperties: [1, 2],
  metaCurrency: 'Blueprints',
};
