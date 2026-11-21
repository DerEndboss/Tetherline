/** A point on a sprite, relative to its anchor (world px). */
export interface Pt {
  x: number;
  y: number;
}

/** A light that pulses on top of a sprite (additive glow), relative to the sprite's anchor. */
export interface SpriteLight extends Pt {
  color: string;
  /** Glow radius in world px. */
  r: number;
  /** Phase offset 0..1, so lights in a row chase each other. */
  phase: number;
  /** A work light: bright and flickering while the machine runs, dim while it waits. */
  work?: boolean;
}

/** Positions the renderer animates on top of a sprite, all relative to the anchor. */
export interface SpriteMeta {
  /** Points where glints (4-point stars) may flash: crystal tips, ore flecks. */
  glints?: Pt[];
  lights?: SpriteLight[];
  /** Where drones leave and loot enters (the base hatch). */
  hatch?: Pt;
  /** Visual height above the ground in world px (laser aim, effects). */
  top?: number;
  /** Where smoke, steam or dust leaves a machine (chimney top, drill head). */
  vents?: Pt[];
  /** Where goods waiting in or on a building are shown (ore heap, crates on a pad). */
  goods?: Pt;
  /** Power nodes: where the power lines attach. */
  wire?: Pt;
  /** Work-loop frames: playback rate in frames per second (docs/art.md, "Work loops"). */
  fps?: number;
}

/** One sprite drawn from code. (ax, ay) is the anchor as a fraction: the point that sits on the tile centre. */
export interface SpriteArt {
  id: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  svg: string;
  meta?: SpriteMeta;
}

export function svgDoc(w: number, h: number, body: string, defs = ''): string {
  const d = defs ? `<defs>${defs}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${d}${body}</svg>`;
}

const r2 = (n: number): string => (Math.round(n * 100) / 100).toString();

export function pts(points: readonly Pt[]): string {
  return points.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
}

export function poly(points: string, fill: string, extra = ''): string {
  return `<polygon points="${points}" fill="${fill}" ${extra}/>`;
}

export function polyPts(points: readonly Pt[], fill: string, extra = ''): string {
  return poly(pts(points), fill, extra);
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, extra = ''): string {
  return `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="${fill}" ${extra}/>`;
}

export function circle(cx: number, cy: number, r: number, fill: string, extra = ''): string {
  return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${fill}" ${extra}/>`;
}

export function line(a: Pt, b: Pt, stroke: string, width: number, extra = ''): string {
  return `<line x1="${r2(a.x)}" y1="${r2(a.y)}" x2="${r2(b.x)}" y2="${r2(b.y)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
}

export function polyline(points: readonly Pt[], stroke: string, width: number, extra = ''): string {
  return `<polyline points="${pts(points)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
}

type Stop = readonly [offset: number, color: string, opacity?: number];

/**
 * Builds one SVG document with its own gradient and filter definitions. Gradients use user-space
 * coordinates, so they line up with the shapes drawn in sprite pixels.
 */
export class Svg {
  private readonly defs: string[] = [];
  private readonly body: string[] = [];
  private n = 0;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {}

  private id(prefix: string): string {
    this.n += 1;
    return `${prefix}${this.n}`;
  }

  private static stops(stops: readonly Stop[]): string {
    return stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');
  }

  linear(x1: number, y1: number, x2: number, y2: number, stops: readonly Stop[]): string {
    const id = this.id('l');
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}">${Svg.stops(stops)}</linearGradient>`,
    );
    return `url(#${id})`;
  }

  /** Radial gradient; (fx, fy) moves the bright focus (default: the centre). `sy` squashes it vertically. */
  radial(cx: number, cy: number, r: number, stops: readonly Stop[], focus?: Pt, sy = 1): string {
    const id = this.id('r');
    const f = focus ? ` fx="${r2(focus.x)}" fy="${r2(focus.y)}"` : '';
    const t = sy === 1 ? '' : ` gradientTransform="translate(0 ${r2(cy)}) scale(1 ${sy}) translate(0 ${r2(-cy)})"`;
    this.defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}"${f}${t}>${Svg.stops(stops)}</radialGradient>`,
    );
    return `url(#${id})`;
  }

  /** Gaussian blur filter; returns the attribute to put on a shape. */
  blur(std: number): string {
    const id = this.id('b');
    this.defs.push(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${std}"/></filter>`,
    );
    return `filter="url(#${id})"`;
  }

  add(...parts: string[]): this {
    this.body.push(...parts);
    return this;
  }

  doc(): string {
    return svgDoc(this.w, this.h, this.body.join(''), this.defs.join(''));
  }
}
