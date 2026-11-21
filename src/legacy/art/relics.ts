import type { RelicDef, RelicShape } from '../content/types';
import { mix, shade } from './color';
import { circle, ellipse, line, polyline, polyPts, type Pt, type SpriteArt, Svg } from './svg';

/**
 * Relic art, generated from content: one silhouette per `RelicShape` (a lens in a brass ring, a crystal shard,
 * a little beacon lamp, a split seed pod, a rune tablet, a cog), filled with the relic's own colour and lit
 * from the top left like the resource icons, with a 2.4 px dark outline. Relics are old things from someone
 * else's expedition, so they mix the relic colour with worn brass and dark stone. 64 x 64, pure SVG strings
 * (the UI shows them as images; the world could bake them like any sprite).
 */

export const RELIC_SIZE = 64;
export const relicId = (id: string): string => `relic-${id}`;

const OUTLINE = '#170c2a';
const STROKE = `stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round"`;
const BRASS = '#c9a36b';
const STONE = '#4c4466';

const P = (s: string): Pt[] =>
  s.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x: x!, y: y! };
  });

const lit = (c: string, k: number): string => (k >= 0 ? mix(c, '#ffffff', k) : shade(c, k));

type RelicArt = (svg: Svg, color: string) => void;

/** A round lens in a worn brass ring with a stub of a handle; light caught in the glass. */
function lens(svg: Svg, c: string): void {
  svg.add(polyPts(P('42,44 54,56 50,60 38,48'), lit(BRASS, -0.2), STROKE));
  svg.add(circle(28, 28, 21, lit(BRASS, 0.05), STROKE));
  svg.add(circle(28, 28, 15.5, svg.radial(24, 23, 18, [[0, lit(c, 0.7)], [0.55, c], [1, lit(c, -0.35)]]), STROKE));
  svg.add(polyline(P('18,24 21,19 26,16'), '#ffffff', 2.6, 'opacity="0.85"'));
  svg.add(line({ x: 31, y: 30 }, { x: 37, y: 36 }, lit(c, -0.5), 1.2, 'opacity="0.7"'));
  svg.add(line({ x: 34, y: 33 }, { x: 33, y: 39 }, lit(c, -0.5), 1.2, 'opacity="0.7"'));
}

/** A tall crystal shard leaning a little, with lit facets and a glow at its tip. */
function shard(svg: Svg, c: string): void {
  svg.add(circle(36, 14, 12, svg.radial(36, 14, 12, [[0, c, 0.55], [1, c, 0]])));
  svg.add(polyPts(P('36,4 47,22 41,52 27,60 20,35'), c, STROKE));
  svg.add(polyPts(P('36,4 20,35 30,36'), lit(c, 0.45)));
  svg.add(polyPts(P('36,4 30,36 41,52 47,22'), lit(c, -0.22)));
  svg.add(polyPts(P('30,36 27,60 41,52'), lit(c, -0.42)));
  svg.add(polyPts(P('36,4 47,22 41,52 27,60 20,35'), 'none', STROKE));
  svg.add(polyline(P('33,12 26,32'), '#ffffff', 2, 'opacity="0.8"'));
}

/** A small beacon: a dark lamp body on a brass foot, a glass dome glowing in the relic's colour. */
function beacon(svg: Svg, c: string): void {
  svg.add(circle(32, 22, 20, svg.radial(32, 22, 20, [[0, c, 0.6], [1, c, 0]])));
  svg.add(polyPts(P('16,52 48,52 44,60 20,60'), lit(BRASS, -0.15), STROKE));
  svg.add(polyPts(P('20,36 44,36 46,52 18,52'), STONE, STROKE));
  svg.add(polyPts(P('20,36 28,36 26,52 18,52'), lit(STONE, 0.25)));
  svg.add(polyPts(P('20,36 44,36 46,52 18,52'), 'none', STROKE));
  svg.add(`<path d="M20 36 C20 18 44 18 44 36 Z" fill="${svg.radial(29, 24, 16, [[0, lit(c, 0.75)], [0.6, c], [1, lit(c, -0.3)]])}" ${STROKE}/>`);
  svg.add(polyline(P('25,30 27,25 31,23'), '#ffffff', 2.4, 'opacity="0.85"'));
  svg.add(line({ x: 22, y: 44 }, { x: 42, y: 44 }, BRASS, 2));
}

/** A seed pod split open along its seam, a glowing kernel inside. */
function seed(svg: Svg, c: string): void {
  const husk = lit(c, -0.35);
  svg.add(`<path d="M32 4 C52 16 54 44 32 60 C10 44 12 16 32 4 Z" fill="${husk}" ${STROKE}/>`);
  svg.add(`<path d="M32 4 C18 16 16 40 32 60 C22 44 20 18 32 4 Z" fill="${lit(husk, 0.35)}"/>`);
  svg.add(ellipse(33, 33, 8, 17, svg.radial(31, 28, 15, [[0, lit(c, 0.8)], [0.6, c], [1, lit(c, -0.2)]]), STROKE));
  svg.add(`<path d="M32 4 C52 16 54 44 32 60 C10 44 12 16 32 4 Z" fill="none" ${STROKE}/>`);
  svg.add(polyline(P('30,24 29,31'), '#ffffff', 2.2, 'opacity="0.85"'));
}

/** A stone tablet with a rounded top and a rune cut into it, glowing in the relic's colour. */
function tablet(svg: Svg, c: string): void {
  svg.add(`<path d="M12 58 V20 C12 8 52 8 52 20 V58 Z" fill="${STONE}" ${STROKE}/>`);
  svg.add(`<path d="M12 58 V20 C12 12 22 9.5 26 9.2 V58 Z" fill="${lit(STONE, 0.22)}"/>`);
  svg.add(`<path d="M12 58 V20 C12 8 52 8 52 20 V58 Z" fill="none" ${STROKE}/>`);
  svg.add(`<g ${svg.blur(2)}>${polyline(P('32,18 32,48'), c, 5, 'opacity="0.7"')}${polyline(P('22,28 32,36 42,28'), c, 5, 'opacity="0.7"')}</g>`);
  svg.add(polyline(P('32,18 32,48'), lit(c, 0.35), 3));
  svg.add(polyline(P('22,28 32,36 42,28'), lit(c, 0.35), 3));
  svg.add(circle(32, 18, 3, lit(c, 0.5)));
}

/** A worn cog with eight teeth and a hub. */
function cog(svg: Svg, c: string): void {
  const teeth: Pt[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 16;
    const r = i % 2 === 0 ? 27 : 21;
    const da = i % 2 === 0 ? 0.16 : 0.2;
    teeth.push({ x: 32 + Math.cos(a - da) * r, y: 32 + Math.sin(a - da) * r }, { x: 32 + Math.cos(a + da) * r, y: 32 + Math.sin(a + da) * r });
  }
  svg.add(polyPts(teeth, svg.radial(24, 22, 34, [[0, lit(c, 0.45)], [0.6, c], [1, lit(c, -0.35)]]), STROKE));
  svg.add(circle(32, 32, 12, lit(c, -0.3), STROKE));
  svg.add(circle(32, 32, 5.5, OUTLINE));
  svg.add(polyline(P('14,26 18,18 25,13'), '#ffffff', 2.2, 'opacity="0.7"'));
}

const SHAPES: Record<RelicShape, RelicArt> = { lens, shard, beacon, seed, tablet, cog };

export function relicSprite(def: Pick<RelicDef, 'id' | 'shape' | 'color'>): SpriteArt {
  const svg = new Svg(RELIC_SIZE, RELIC_SIZE);
  SHAPES[def.shape](svg, def.color);
  return { id: relicId(def.id), w: RELIC_SIZE, h: RELIC_SIZE, ax: 0.5, ay: 0.5, svg: svg.doc() };
}
