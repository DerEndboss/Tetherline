import type { ContentRegistry } from '../../content/registry';
import { terrainOf } from '../../content/themes';
import { createRng } from '../rng';
import type { MapState } from '../state';
import { placeBoulders, placeRidges, placeWrecks } from './features';
import { MARGIN, shapeLand } from './land';
import { rollProperties } from './props';
import { connect, deepFloors } from './reach';
import { placeResources, type Ctx } from './resources';

/**
 * The map generator. One seed gives one map, always the same:
 *  - organic land: several noisy pieces joined by land bridges, never narrower than `size.minWidth`, in one
 *    piece with the start;
 *  - the start: the core on solid ground with a clear ring, copper, iron, sand, coal and shallow water around
 *    it (in different directions), so the first minutes always work;
 *  - mostly empty: ore patches, lakes with shallow rims, oil seeps, slag fields (rolled per seed: not
 *    everything everywhere), rock ridges with gaps, dust boulders in clusters, wrecks with blueprints;
 *  - map properties (Dusty, Windy, Geothermal ...) rolled so that no two change the same thing;
 *  - playable: every buildable tile is reachable from the core (pockets cut off by rocks or lakes are opened).
 * Contract: `generateMap(content, opts)` returns the MapState and the core's top-left tile.
 */
export interface MapOptions {
  seed: number;
  size: string;
  theme: string;
}

export interface GeneratedMap {
  map: MapState;
  /** Top-left tile of the start core. */
  core: { x: number; y: number };
}

function emptyMap(diameter: number, opts: MapOptions, size: string): MapState {
  const n = diameter + MARGIN * 2;
  return {
    w: n,
    h: n,
    theme: opts.theme,
    size,
    props: [],
    ground: new Uint8Array(n * n),
    floor: new Uint8Array(n * n),
    ridge: new Uint8Array(n * n),
    boulder: new Uint8Array(n * n),
    wrecks: [],
  };
}

function landTiles(map: MapState): number {
  let n = 0;
  for (const g of map.ground) if (g) n++;
  return n;
}

/** The farthest land tile from the centre (patches and wrecks are placed up to there). */
function landReach(map: MapState, c: number): number {
  let far = 0;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.ground[y * map.w + x]) far = Math.max(far, Math.hypot(x - c, y - c));
  return far;
}

export function generateMap(content: ContentRegistry, opts: MapOptions): GeneratedMap {
  const size = content.sizes.get(opts.size);
  const theme = content.themes.get(opts.theme);
  const style = terrainOf(theme);
  const rng = createRng(opts.seed ^ 0x5bd1e995);
  const map = emptyMap(size.diameter, opts, size.id);
  const { coast } = shapeLand(map, size, rng, opts.seed, theme.palette.ground.length);
  const c = Math.floor(map.w / 2);
  const coreSize = content.buildings.get(content.rules.startCore).size;
  const core = { x: c - Math.floor(coreSize / 2), y: c - Math.floor(coreSize / 2) };
  map.props = rollProperties(content, rng);
  const ctx: Ctx = { content, map, rng, seed: opts.seed, centre: { x: c + 0.5, y: c + 0.5 }, props: map.props, reach: landReach(map, c) };
  placeResources(ctx, landTiles(map));
  placeRidges(ctx, coast, size.minWidth, style.gen.ridges);
  placeBoulders(ctx, theme.boulders.length, style.gen.boulders);
  placeWrecks(ctx, Math.max(2, Math.round(size.diameter / 45)));
  // the core and a one-tile ring: plain, buildable, free of everything
  for (let y = core.y - 1; y <= core.y + coreSize; y++) {
    for (let x = core.x - 1; x <= core.x + coreSize; x++) {
      const i = y * map.w + x;
      map.floor[i] = 0;
      map.ridge[i] = 0;
      map.boulder[i] = 0;
      if (!map.ground[i]) map.ground[i] = 1;
    }
  }
  const floors = content.floors.list;
  connect(map, c * map.w + c, deepFloors(floors), floors.findIndex((f) => f.liquid === 'water' && !f.deep) + 1);
  for (let i = 0; i < map.ridge.length; i++) if (map.ridge[i]) map.boulder[i] = 0;
  return { map, core };
}
