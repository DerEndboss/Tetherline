import type { WorldPalette } from '../content/types';
import { mix, shade } from './color';
import { circle, ellipse, polyPts, type Pt, type SpriteArt, Svg } from './svg';

/**
 * Effect textures. Most are white so the renderer tints them per use (spark colour, glow colour, debris
 * colour); the shards carry their own light and shade in grey so a tint turns them into lit rock pieces.
 */
export const FX = {
  glow: 'fx-glow',
  spark: 'fx-spark',
  puff: 'fx-puff',
  ring: 'fx-ring',
  star: 'fx-star',
  mote: 'fx-mote',
  arrow: 'fx-arrow',
  shard: (i: number) => `fx-shard-${i}`,
  leaf: 'fx-leaf',
  planet: 'sky-planet',
  moon: 'sky-moon',
  mist: (i: number) => `fx-mist-${i}`,
  noPower: 'fx-no-power',
  /** A soft column of light, anchored at its foot: the finished Skyforge's beam into the sky. */
  beam: 'fx-beam',
} as const;

export const SHARD_VARIANTS = 4;
export const MIST_VARIANTS = 3;

function sprite(id: string, w: number, h: number, draw: (svg: Svg) => void): SpriteArt {
  const svg = new Svg(w, h);
  draw(svg);
  return { id, w, h, ax: 0.5, ay: 0.5, svg: svg.doc() };
}

const SHARDS: string[][] = [
  ['2,9 7,2 14,4 13,11 6,13', '7,2 14,4 9,7', '9,7 14,4 13,11'],
  ['3,6 10,2 15,8 9,14', '3,6 10,2 9,8', '9,8 15,8 9,14'],
  ['1,10 6,3 12,2 15,9 8,14', '6,3 12,2 9,8', '9,8 15,9 8,14'],
  ['4,4 12,3 14,12 5,13', '4,4 12,3 8,7', '8,7 14,12 5,13'],
];

const P = (s: string): Pt[] =>
  s.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x: x!, y: y! };
  });

export function fxSprites(palette: WorldPalette): SpriteArt[] {
  const shards = SHARDS.map(([body, light, dark], i) =>
    sprite(FX.shard(i), 16, 16, (svg) => {
      svg.add(polyPts(P(body!), '#b8b8b8', 'stroke="#2a2a2a" stroke-width="1.2" stroke-linejoin="round"'));
      svg.add(polyPts(P(light!), '#ffffff'), polyPts(P(dark!), '#6a6a6a'));
    }),
  );
  const beam: SpriteArt = {
    ...sprite(FX.beam, 64, 512, (svg) => {
      const fade = (a: number): string => svg.linear(0, 512, 0, 0, [[0, '#ffffff', a], [0.35, '#ffffff', a * 0.7], [1, '#ffffff', 0]]);
      svg.add(`<g ${svg.blur(7)}>${polyPts(P('14,512 50,512 44,0 20,0'), fade(0.55))}</g>`);
      svg.add(`<g ${svg.blur(2.5)}>${polyPts(P('27,512 37,512 34.5,0 29.5,0'), fade(1))}</g>`);
    }),
    ay: 1,
  };
  return [
    beam,
    sprite(FX.glow, 64, 64, (svg) => {
      svg.add(circle(32, 32, 32, svg.radial(32, 32, 32, [[0, '#ffffff', 1], [0.25, '#ffffff', 0.55], [1, '#ffffff', 0]])));
    }),
    sprite(FX.spark, 32, 8, (svg) => {
      const fill = svg.linear(0, 4, 32, 4, [[0, '#ffffff', 0], [0.7, '#ffffff', 0.9], [1, '#ffffff', 1]]);
      svg.add(ellipse(16, 4, 15.5, 2.6, fill));
    }),
    sprite(FX.puff, 64, 64, (svg) => {
      const fill = svg.radial(32, 32, 30, [[0, '#ffffff', 0.9], [0.55, '#ffffff', 0.45], [1, '#ffffff', 0]]);
      svg.add(circle(32, 32, 30, fill));
    }),
    sprite(FX.ring, 128, 64, (svg) => {
      svg.add(ellipse(64, 32, 60, 29, 'none', 'stroke="#ffffff" stroke-width="3" opacity="0.9"'));
    }),
    sprite(FX.star, 48, 48, (svg) => {
      svg.add(circle(24, 24, 9, svg.radial(24, 24, 9, [[0, '#ffffff', 0.8], [1, '#ffffff', 0]])));
      svg.add(polyPts(P('24,2 26.2,21.8 46,24 26.2,26.2 24,46 21.8,26.2 2,24 21.8,21.8'), '#ffffff'));
    }),
    sprite(FX.mote, 12, 12, (svg) => {
      svg.add(circle(6, 6, 6, svg.radial(6, 6, 6, [[0, '#ffffff', 1], [1, '#ffffff', 0]])));
    }),
    sprite(FX.arrow, 40, 40, (svg) => {
      // A chunky down-pointing marker: rounded triangle with a lighter top facet, tinted per use.
      svg.add(polyPts(P('7,9 33,9 20,30'), '#d6d6d6', `stroke="${palette.shadow}" stroke-width="3" stroke-linejoin="round"`));
      svg.add(polyPts(P('9.5,10.5 30.5,10.5 20,15.5'), '#ffffff'));
    }),
    sprite(FX.leaf, 16, 16, (svg) => {
      svg.add(`<path d="M2,14 Q3,4 14,2 Q12,12 2,14 Z" fill="#d8d8d8" stroke="#2a2a2a" stroke-width="1.1"/>`);
      svg.add(`<path d="M3,13 Q7,8 13,3" fill="none" stroke="#ffffff" stroke-width="1"/>`);
    }),
    ...shards,
    ...Array.from({ length: MIST_VARIANTS }, (_, i) => mistSprite(i)),
    noPowerSprite(palette),
    planetSprite(palette),
    moonSprite(palette),
  ];
}

/**
 * A bank of mist lying on the ground (flattened like the iso floor): a few soft overlapping ellipses, white
 * so the renderer tints it with the world's fog colour. Three variants break up the repetition.
 */
function mistSprite(i: number): SpriteArt {
  const blobs: [number, number, number, number, number][][] = [
    [[60, 70, 58, 26, 0.75], [118, 62, 52, 24, 0.7], [92, 52, 46, 22, 0.85], [150, 76, 38, 18, 0.6]],
    [[56, 66, 50, 22, 0.7], [104, 72, 62, 26, 0.8], [140, 58, 40, 20, 0.7], [88, 50, 36, 18, 0.85]],
    [[70, 60, 64, 26, 0.8], [130, 70, 48, 22, 0.7], [44, 76, 34, 16, 0.6], [104, 46, 34, 16, 0.85]],
  ];
  return sprite(FX.mist(i), 200, 110, (svg) => {
    for (const [cx, cy, rx, ry, a] of blobs[i % blobs.length]!) {
      const fill = svg.radial(cx, cy - ry * 0.3, rx, [[0, '#ffffff', a], [0.55, '#ffffff', a * 0.55], [1, '#ffffff', 0]]);
      svg.add(ellipse(cx, cy, rx, ry, fill));
    }
  });
}

/** Over a machine without power: a dark glass disc with the power bolt, struck through in coral. */
function noPowerSprite(palette: WorldPalette): SpriteArt {
  return sprite(FX.noPower, 44, 44, (svg) => {
    svg.add(circle(22, 22, 19, mix(palette.sky.top, '#000000', 0.2), `stroke="${mix(palette.sky.mid, '#ffffff', 0.25)}" stroke-width="1.6" opacity="0.92"`));
    svg.add(polyPts(P('24,9 14,24 21,24 19,35 30,19 23,19 25,9'), '#ffd27a', `stroke="${shade('#ffd27a', -0.55)}" stroke-width="1.2" stroke-linejoin="round"`));
    svg.add(`<path d="M11,33 L33,11" stroke="${palette.sky.top}" stroke-width="5.5" stroke-linecap="round"/>`);
    svg.add(`<path d="M11,33 L33,11" stroke="#ff7b6b" stroke-width="3" stroke-linecap="round"/>`);
  });
}

/** A ringed gas giant low over the horizon, in the sky's own dusk colours. */
function planetSprite(palette: WorldPalette): SpriteArt {
  return sprite(FX.planet, 260, 160, (svg) => {
    const { horizon, mid, haze } = palette.sky;
    const body = svg.linear(70, 30, 190, 150, [
      [0, mix(horizon, '#ffffff', 0.25)],
      [0.45, mix(haze, horizon, 0.4)],
      [1, mix(mid, palette.shadow, 0.3)],
    ]);
    const ringBack = `<path d="M18,96 A112,26 -12 0 1 242,58" fill="none" stroke="${mix(horizon, '#ffffff', 0.2)}" stroke-width="5" opacity="0.55"/>`;
    const ringFront = `<path d="M242,58 A112,26 -12 0 1 18,96" fill="none" stroke="${mix(horizon, '#ffffff', 0.35)}" stroke-width="6" opacity="0.8"/>`;
    svg.add(ringBack, circle(130, 80, 58, body));
    for (let i = 0; i < 4; i++) {
      svg.add(`<path d="M${76 + i * 4},${56 + i * 16} Q130,${48 + i * 16} ${184 - i * 3},${62 + i * 16}" fill="none" stroke="${shade(haze, 0.15)}" stroke-width="3" opacity="0.25"/>`);
    }
    svg.add(circle(130, 80, 58, 'none', `stroke="${mix(horizon, '#ffffff', 0.4)}" stroke-width="1.5" opacity="0.5"`));
    svg.add(ringFront);
  });
}

function moonSprite(palette: WorldPalette): SpriteArt {
  return sprite(FX.moon, 48, 48, (svg) => {
    const fill = svg.radial(18, 16, 26, [[0, mix(palette.sky.horizon, '#ffffff', 0.5)], [1, mix(palette.sky.haze, palette.sky.mid, 0.4)]]);
    svg.add(circle(24, 24, 16, fill));
    svg.add(circle(20, 20, 3, shade(palette.sky.haze, -0.1), 'opacity="0.35"'), circle(29, 28, 2, shade(palette.sky.haze, -0.1), 'opacity="0.3"'));
  });
}
