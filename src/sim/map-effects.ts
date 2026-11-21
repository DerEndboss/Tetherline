import type { MapEffects } from '../content/types';
import type { World } from './world';

/** The product of one effect over the run's map properties (1 when none sets it). */
export function mapEffect(w: World, key: keyof MapEffects): number {
  let v = 1;
  for (const id of w.state.map.props) {
    const e = w.content.mapProperties.find(id)?.effects[key];
    if (e !== undefined) v *= e;
  }
  return v;
}
