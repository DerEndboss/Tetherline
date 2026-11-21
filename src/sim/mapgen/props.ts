import type { ContentRegistry } from '../../content/registry';
import type { MapPropertyDef } from '../../content/types';
import { nextInt, pickWeighted, type RngState } from '../rng';

const effectKeys = (p: MapPropertyDef): string[] => Object.keys(p.effects);

/** Rolls this run's map properties by weight; two properties never change the same thing (no Dusty + Sunny). */
export function rollProperties(content: ContentRegistry, rng: RngState): string[] {
  const [lo, hi] = content.rules.mapProperties;
  const left = [...content.mapProperties.list];
  const rolled: MapPropertyDef[] = [];
  for (let n = nextInt(rng, lo, hi); n > 0 && left.length; n--) {
    const p = pickWeighted(rng, left, (x) => x.weight);
    rolled.push(p);
    const keys = effectKeys(p);
    for (let i = left.length - 1; i >= 0; i--) if (left[i] === p || effectKeys(left[i]!).some((k) => keys.includes(k))) left.splice(i, 1);
  }
  return rolled.map((p) => p.id);
}
