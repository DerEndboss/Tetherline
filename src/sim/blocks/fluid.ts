import { fillNet, netOfMember } from '../liquids';
import type { Building } from '../state';
import type { World } from '../world';
import { autoLinkInLine } from './transport';
import type { BlockBehaviour } from './types';

/** The liquid a floor tile yields (index), or -1. */
function liquidAt(w: World, x: number, y: number): number {
  const { map } = w.state;
  const f = map.floor[y * map.w + x] ?? 0;
  const l = f > 0 ? w.content.floors.list[f - 1]?.liquid : undefined;
  return l ? w.content.liquids.indexOf(l) : -1;
}

/** Liquid and liquid tiles under a pump: [liquid index, tiles] (the first liquid found wins). */
export function pumpInfo(w: World, b: Building): [number, number] {
  const def = w.def(b);
  if (def.pump?.anywhere) return [w.content.liquids.indexOf(def.pump.anywhere), def.size * def.size];
  let liquid = -1;
  let tiles = 0;
  for (let y = b.y; y < b.y + def.size; y++) {
    for (let x = b.x; x < b.x + def.size; x++) {
      const i = liquidAt(w, x, y);
      if (liquid < 0) liquid = i;
      if (i >= 0 && i === liquid) tiles++;
    }
  }
  return [liquid, tiles];
}

/** Pump: draws the liquid under it into its network (it is a member, so neighbours connect through it). */
export const pump: BlockBehaviour = {
  update: (w, b, ctx) => {
    const [liquid, tiles] = pumpInfo(w, b);
    const net = netOfMember(w, b);
    if (liquid < 0 || !net) return;
    fillNet(net, liquid, (w.def(b).pump?.perTile ?? 0) * tiles * ctx.dt * ctx.power(b));
  },
};

/** Conduits, junctions, routers, tanks, conduit bridges: the network does the work (liquids.ts). */
export const liquidMember: BlockBehaviour = {};

/** Conduit bridges link like item bridges (to the nearest one ahead in range). */
export const liquidBridge: BlockBehaviour = {
  built: (w, b) => autoLinkInLine(w, b),
};
