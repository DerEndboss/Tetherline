import type { ContentRegistry } from '../content/registry';
import type { IconMark, ResourceIcon } from '../content/types';
import { mix, shade } from './color';
import { circle, ellipse, line, polyline, polyPts, type Pt, type SpriteArt, Svg } from './svg';

/**
 * Resource icons, generated from content: a silhouette per family (`ResourceIcon`: ore nugget, sand heap,
 * metal bar, wafer, rods, ingot, plate, crystal block, slag blob, truss, coil, board, orb ...), filled with
 * the material's colour and lit from the top left, a second colour (`accent`: ore flecks, sand grains, a
 * glowing core), a stamp for metal bars (`mark`), and for alloys a composition stripe: the colours of their
 * inputs in their ratio, read from the alloys data. The same image flies as loot, rides belts and shows in
 * the HUD and the codex, so world and interface show the same thing.
 */

export const ICON_SIZE = 32;
export const iconId = (resource: string): string => `icon-${resource}`;

const OUTLINE = '#170c2a';
const STROKE = `stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round"`;

/** Everything an icon is drawn from. */
export interface IconLook {
  icon: ResourceIcon;
  color: string;
  accent?: string;
  mark?: IconMark;
  /** Alloys: the input colours and their shares (sum 1), drawn as a stripe. */
  blend?: { color: string; share: number }[];
}

type IconArt = (svg: Svg, look: IconLook) => void;

const P = (s: string): Pt[] =>
  s.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x: x!, y: y! };
  });

const lit = (c: string, k: number): string => (k >= 0 ? mix(c, '#ffffff', k) : shade(c, k));
const accentOf = (look: IconLook): string => look.accent ?? mix(look.color, '#ffffff', 0.55);

/** Facets: [points, lightness] drawn over the base silhouette, then the outline again on top. */
function faceted(svg: Svg, c: string, outline: string, facets: [string, number][]): void {
  svg.add(polyPts(P(outline), c, STROKE));
  for (const [pts, k] of facets) svg.add(polyPts(P(pts), lit(c, k)));
  svg.add(polyPts(P(outline), 'none', STROKE));
}

/** Point at fraction t from a to b. */
const along = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * The composition stripe of an alloy: a band along an edge (from `a` to `b`, `depth` px deep towards
 * `inward`), split into the input colours by share. Shares under 6 % still get a sliver you can see.
 */
function blendStripe(svg: Svg, look: IconLook, a: Pt, b: Pt, inward: Pt, depth: number): void {
  const parts = look.blend;
  if (!parts || parts.length < 2) return;
  const shares = parts.map((p) => Math.max(0.12, p.share));
  const sum = shares.reduce((s, x) => s + x, 0);
  let t = 0;
  parts.forEach((p, i) => {
    const t2 = t + (shares[i] ?? 0) / sum;
    const p0 = along(a, b, t);
    const p1 = along(a, b, t2);
    const off = (q: Pt): Pt => ({ x: q.x + inward.x * depth, y: q.y + inward.y * depth });
    svg.add(polyPts([p0, p1, off(p1), off(p0)], p.color, `stroke="${shade(p.color, -0.45)}" stroke-width="0.8" stroke-linejoin="round"`));
    t = t2;
  });
}

/* ---------- Raw ---------- */

function nugget(svg: Svg, look: IconLook): void {
  faceted(svg, look.color, '6,17 10,8 19,5 27,11 27,21 19,27 9,25', [
    ['10,8 19,5 27,11 17,14', 0.38],
    ['6,17 10,8 17,14 14,21', 0.12],
    ['17,14 27,11 27,21 19,27 14,21', -0.28],
  ]);
  const fleck = accentOf(look);
  for (const [x, y, r] of [[15, 9.5, 1.7], [21.5, 10, 1.3], [10.5, 15.5, 1.4], [22, 19.5, 1.6], [16.5, 22.5, 1.2]] as const) {
    svg.add(polyPts([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], fleck, `stroke="${shade(fleck, -0.5)}" stroke-width="0.6"`));
  }
}

function sand(svg: Svg, look: IconLook): void {
  const c = look.color;
  faceted(svg, c, '3,26 6,20 11,14 16,10 21,14 26,20 29,26', [
    ['3,26 6,20 11,14 16,10 15,26', 0.28],
    ['16,10 21,14 26,20 29,26 15,26', -0.18],
  ]);
  const grain = accentOf(look);
  const dark = shade(c, -0.35);
  for (const [x, y, light] of [[12, 18, 1], [17, 15, 1], [9, 23, 0], [20, 21, 1], [24, 24, 0], [14, 23, 1], [18, 25, 0]] as const) {
    svg.add(circle(x, y, 1.15, light ? grain : dark));
  }
}

function lump(svg: Svg, look: IconLook): void {
  const c = look.color;
  svg.add(circle(16, 17, 10.5, svg.radial(12, 12, 15, [[0, mix(c, '#ffffff', 0.35)], [0.5, c], [1, shade(c, -0.45)]]), STROKE));
  svg.add(circle(12.5, 13, 2.6, '#ffffff', 'opacity="0.45"'));
}

/* ---------- Refined ---------- */

/** A cast metal bar; its stamp (`mark`) sits on the top face. */
function bar(svg: Svg, look: IconLook): void {
  const c = look.color;
  faceted(svg, c, '4,16 12,10 28,14 28,20 20,26 4,22', [
    ['4,16 12,10 28,14 20,20', 0.35],
    ['4,16 20,20 20,26 4,22', 0],
    ['20,20 28,14 28,20 20,26', -0.3],
  ]);
  stamp(svg, c, look.mark);
}

/** An embossed stamp on a bar's top face: a groove, a ring or a dot, shadow below and light above. */
function stamp(svg: Svg, c: string, mark: IconMark | undefined): void {
  const dark = shade(c, -0.42);
  const light = mix(c, '#ffffff', 0.7);
  if (mark === 'line') {
    svg.add(line({ x: 11, y: 14.3 }, { x: 21, y: 16.8 }, dark, 1.8), line({ x: 11, y: 13.2 }, { x: 21, y: 15.7 }, light, 0.9));
  } else if (mark === 'ring') {
    svg.add(ellipse(16, 15.4, 4, 2.2, 'none', `stroke="${dark}" stroke-width="1.6" transform="rotate(14 16 15.4)"`));
    svg.add(ellipse(16, 14.7, 4, 2.2, 'none', `stroke="${light}" stroke-width="0.7" transform="rotate(14 16 14.7)"`));
  } else if (mark === 'dot') {
    svg.add(ellipse(16, 15.4, 2.4, 1.6, dark), ellipse(15.6, 14.8, 1.2, 0.7, light));
  }
}

/** A silicon wafer: a round disc with its die grid. */
function wafer(svg: Svg, look: IconLook): void {
  const c = look.color;
  const grid = accentOf(look);
  svg.add(ellipse(16, 18.5, 13, 7.4, shade(c, -0.4), STROKE));
  const top = svg.radial(11, 10, 18, [[0, mix(c, '#ffffff', 0.45)], [0.55, c], [1, shade(c, -0.2)]]);
  svg.add(ellipse(16, 15.5, 13, 7.4, top, STROKE));
  const rx = 10.2;
  const ry = 5.6;
  for (const dy of [-2.8, 0, 2.8]) {
    const half = rx * Math.sqrt(1 - (dy / ry) ** 2);
    svg.add(line({ x: 16 - half, y: 15.5 + dy }, { x: 16 + half, y: 15.5 + dy }, grid, 0.9, 'opacity="0.75"'));
  }
  for (const dx of [-5.4, 0, 5.4]) {
    const half = ry * Math.sqrt(1 - (dx / rx) ** 2);
    svg.add(line({ x: 16 + dx, y: 15.5 - half }, { x: 16 + dx, y: 15.5 + half }, grid, 0.9, 'opacity="0.75"'));
  }
  svg.add(ellipse(11, 12.5, 3.2, 1.3, '#ffffff', 'opacity="0.5" transform="rotate(-18 11 12.5)"'));
}

/** Graphite: three rods in a stack, their cut ends showing the lighter core. */
function rods(svg: Svg, look: IconLook): void {
  const c = look.color;
  const core = accentOf(look);
  const rod = (a: Pt, b: Pt): void => {
    svg.add(line(a, b, OUTLINE, 8.2), line(a, b, c, 5.6));
    svg.add(line({ x: a.x + 0.6, y: a.y - 1.6 }, { x: b.x + 0.6, y: b.y - 1.6 }, mix(c, '#ffffff', 0.35), 1.6));
    svg.add(circle(a.x, a.y, 2.9, shade(c, -0.2), STROKE.replace('2.2', '1.4')), circle(a.x, a.y, 1.3, core));
  };
  rod({ x: 6, y: 20.5 }, { x: 22, y: 12.5 });
  rod({ x: 9.5, y: 25.5 }, { x: 25.5, y: 17.5 });
  rod({ x: 8, y: 15.5 }, { x: 23.5, y: 7.75 });
}

/* ---------- Mixed ---------- */

/** A trapezoid ingot with the alloy's composition stripe along its front-left foot. */
function ingot(svg: Svg, look: IconLook): void {
  const c = look.color;
  faceted(svg, c, '3,18 14,25 29,17 25,11.5 17,7.5 7,12.5', [
    ['7,12.5 15,17 25,11.5 17,7.5', 0.38],
    ['3,18 14,25 15,17 7,12.5', 0.04],
    ['14,25 29,17 25,11.5 15,17', -0.3],
  ]);
  blendStripe(svg, look, { x: 3.9, y: 18.3 }, { x: 13.9, y: 24.1 }, { x: 0.35, y: -1 }, 3);
  svg.add(line({ x: 10, y: 12.4 }, { x: 18, y: 9 }, '#ffffff', 1.1, 'opacity="0.55"'));
}

/** Two thin sheets, the top one with its composition stripe along the front edge. */
function plate(svg: Svg, look: IconLook): void {
  const c = look.color;
  const sheet = (dy: number, k: number): void => {
    const pts = (s: string): string => s.split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return `${x},${y! + dy}`; }).join(' ');
    faceted(svg, lit(c, k), pts('3,15 16,8 29,14 29,17 16,24 3,18'), [
      [pts('3,15 16,8 29,14 16,21'), 0.32],
      [pts('3,15 16,21 16,24 3,18'), -0.05],
      [pts('16,21 29,14 29,17 16,24'), -0.32],
    ]);
  };
  sheet(5, -0.12);
  sheet(0, 0);
  blendStripe(svg, look, { x: 3.6, y: 15.6 }, { x: 15.8, y: 21.8 }, { x: 0, y: 1 }, 2.2);
  svg.add(line({ x: 9, y: 13 }, { x: 18, y: 9.5 }, '#ffffff', 1, 'opacity="0.55"'));
}

/** A cluster of hard crystal blocks (silicon carbide), glints in the accent colour. */
function block(svg: Svg, look: IconLook): void {
  const c = look.color;
  faceted(svg, shade(c, -0.1), '18,28 18,14 22,10 27,13 27,28', [
    ['18,14 22,10 27,13 22,16', 0.35],
    ['22,16 27,13 27,28 22,28', -0.3],
  ]);
  faceted(svg, c, '6,28 6,11 12,4 18,10 18,28', [
    ['6,11 12,4 12,13', 0.42],
    ['12,4 18,10 12,13', 0.2],
    ['12,13 18,10 18,28 12,28', -0.28],
  ]);
  const glint = accentOf(look);
  svg.add(polyPts(P('9,17 10.4,15.6 11.8,17 10.4,18.4'), glint), polyPts(P('23.5,19 24.5,18 25.5,19 24.5,20'), glint, 'opacity="0.8"'));
}

/** Slag: a sagging lump that did not want to be anything, with a hot crack, bubbles and a wisp of smoke. */
function blob(svg: Svg, look: IconLook): void {
  const c = look.color;
  const body = 'M4.5 25.5 C3 21.5 6 18.6 8.6 18.2 C8.4 14.2 12.4 11.4 15.6 13 C17.4 9.8 22.6 10.2 23.4 14.6 C27.6 15 29.4 19.4 27.6 22.6 C29.8 24.6 28 27.6 25 27.4 L8 27.6 C5.8 27.8 4.4 26.8 4.5 25.5 Z';
  const fill = svg.radial(13, 14, 18, [[0, mix(c, '#ffffff', 0.32)], [0.55, c], [1, shade(c, -0.4)]]);
  svg.add(`<path d="${body}" fill="${fill}" ${STROKE}/>`);
  const ember = accentOf(look);
  svg.add(polyline(P('11,24 14,21.5 16.5,23 19.5,20.5'), ember, 1.4, 'opacity="0.9"'));
  svg.add(circle(21.5, 17.5, 2.2, mix(c, '#ffffff', 0.18), `stroke="${shade(c, -0.45)}" stroke-width="1"`), circle(20.9, 16.9, 0.7, '#ffffff', 'opacity="0.7"'));
  svg.add(circle(11.5, 19.5, 1.4, mix(c, '#ffffff', 0.15), `stroke="${shade(c, -0.45)}" stroke-width="0.8"`));
  svg.add(`<path d="M17 9 C14.5 7.2 18.2 5.6 16.4 3.6" fill="none" stroke="${mix(c, '#ffffff', 0.55)}" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>`);
}

/* ---------- Parts ---------- */

/** Frame: a cube truss with braces on its two lit faces. */
function truss(svg: Svg, look: IconLook): void {
  const c = look.color;
  const top = [{ x: 16, y: 4.5 }, { x: 27, y: 10 }, { x: 16, y: 15.5 }, { x: 5, y: 10 }];
  const down = (p: Pt): Pt => ({ x: p.x, y: p.y + 12.5 });
  const back = (a: Pt, b: Pt): void => {
    svg.add(line(a, b, OUTLINE, 3.6), line(a, b, shade(c, -0.35), 1.6));
  };
  const beam = (a: Pt, b: Pt, k = 0): void => {
    svg.add(line(a, b, OUTLINE, 4.4), line(a, b, lit(c, k), 2.4));
  };
  back(top[0]!, down(top[0]!));
  back(down(top[3]!), down(top[0]!));
  back(down(top[0]!), down(top[1]!));
  beam(top[3]!, down(top[2]!), -0.1);
  beam(top[2]!, down(top[1]!), -0.3);
  for (const i of [3, 2, 1]) beam(top[i]!, down(top[i]!), i === 1 ? -0.3 : 0);
  beam(down(top[3]!), down(top[2]!), -0.05);
  beam(down(top[2]!), down(top[1]!), -0.3);
  for (let i = 0; i < 4; i++) beam(top[i]!, top[(i + 1) % 4]!, 0.35);
  svg.add(circle(16, 15.5, 1.6, mix(c, '#ffffff', 0.6)));
}

/** Conductor: a spool of copper wire between two dark flanges. */
function coil(svg: Svg, look: IconLook): void {
  const c = look.color;
  const flange = accentOf(look);
  svg.add(ellipse(16, 25, 11.5, 4.6, shade(flange, -0.3), STROKE));
  const body = svg.linear(6, 0, 26, 0, [[0, mix(c, '#ffffff', 0.25)], [0.4, c], [1, shade(c, -0.45)]]);
  svg.add(`<path d="M6.5 9 L6.5 24 A9.5 3.8 0 0 0 25.5 24 L25.5 9 Z" fill="${body}" ${STROKE}/>`);
  for (let y = 11.5; y <= 22.5; y += 2.2) {
    svg.add(`<path d="M6.8 ${y} A9.2 3.6 0 0 0 25.2 ${y}" fill="none" stroke="${shade(c, -0.5)}" stroke-width="0.8" opacity="0.8"/>`);
  }
  svg.add(ellipse(16, 8, 11.5, 4.6, flange, STROKE), ellipse(16, 7.6, 3.4, 1.4, shade(flange, -0.55)));
  svg.add(line({ x: 9.5, y: 12 }, { x: 9.5, y: 22 }, '#ffffff', 1.2, 'opacity="0.45"'));
}

/** Circuit: a green board with a dark chip, gold traces and pins. */
function board(svg: Svg, look: IconLook): void {
  const c = look.color;
  const gold = accentOf(look);
  svg.add(polyPts(P('2,16 16,9 30,16 30,19 16,26 2,19'), shade(c, -0.45), STROKE));
  svg.add(polyPts(P('2,16 16,9 30,16 16,23'), svg.linear(6, 9, 26, 23, [[0, mix(c, '#ffffff', 0.25)], [1, shade(c, -0.15)]])));
  svg.add(polyPts(P('2,16 16,9 30,16 30,19 16,26 2,19'), 'none', STROKE));
  for (const [a, b] of [[[5, 16.2], [10, 13.7]], [[22, 19.6], [27, 17.1]], [[8.5, 18], [12, 19.8]], [[20, 12.2], [23.5, 14]]] as const) {
    svg.add(line({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, gold, 1.1));
  }
  svg.add(polyPts(P('10,15 16,12 22,15 22,17.5 16,20.5 10,17.5'), '#232838', STROKE.replace('2.2', '1.4')));
  svg.add(polyPts(P('10,15 16,12 22,15 16,18'), '#3a4258'));
  svg.add(circle(14, 14.6, 0.9, gold));
}

/** Core: a glowing orb inside a tilted ring. */
function orb(svg: Svg, look: IconLook): void {
  const c = look.color;
  const shine = accentOf(look);
  svg.add(`<g ${svg.blur(2.2)}>${circle(16, 16, 10.5, c, 'opacity="0.55"')}</g>`);
  svg.add(`<path d="M5 18 A11.2 4.4 -18 0 1 27 12" fill="none" stroke="${OUTLINE}" stroke-width="4.2" stroke-linecap="round"/>`);
  svg.add(`<path d="M5 18 A11.2 4.4 -18 0 1 27 12" fill="none" stroke="#9aa6c4" stroke-width="2" stroke-linecap="round"/>`);
  const fill = svg.radial(13, 12.5, 12, [[0, shine], [0.35, mix(c, '#ffffff', 0.35)], [1, shade(c, -0.35)]]);
  svg.add(circle(16, 16, 8, fill, STROKE));
  svg.add(`<path d="M27 12 A11.2 4.4 -18 0 1 5 18" fill="none" stroke="${OUTLINE}" stroke-width="4.2" stroke-linecap="round"/>`);
  svg.add(`<path d="M27 12 A11.2 4.4 -18 0 1 5 18" fill="none" stroke="#dfe6f4" stroke-width="2" stroke-linecap="round"/>`);
  svg.add(circle(13, 12.8, 1.8, '#ffffff', 'opacity="0.8"'));
}

/* ---------- Currencies ---------- */

function chip(svg: Svg, look: IconLook): void {
  const c = look.color;
  const hex = (r: number): Pt[] => Array.from({ length: 6 }, (_, i) => ({ x: 16 + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * r, y: 16 + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * r }));
  const fill = svg.linear(8, 4, 24, 28, [[0, mix(c, '#ffffff', 0.45)], [0.5, c], [1, shade(c, -0.35)]]);
  svg.add(polyPts(hex(13), fill, STROKE));
  svg.add(polyPts(hex(7.5), 'none', `stroke="${shade(c, -0.45)}" stroke-width="2" stroke-linejoin="round"`));
  svg.add(polyPts(P('10,9 15,6 13,11'), '#ffffff', 'opacity="0.55"'));
}

function flask(svg: Svg, look: IconLook): void {
  const c = look.color;
  svg.add(polyPts(P('13,4 19,4 19,12 26,25 23,28 9,28 6,25 13,12'), mix(c, '#ffffff', 0.15), STROKE));
  svg.add(polyPts(P('9.5,19 22.5,19 25,25 22.5,26.5 9.5,26.5 7,25'), shade(c, -0.15)));
}

function prism(svg: Svg, look: IconLook): void {
  faceted(svg, look.color, '16,3 28,24 4,24', [
    ['16,3 10,24 4,24', 0.4],
    ['16,3 22,24 10,24', 0.1],
    ['16,3 28,24 22,24', -0.3],
  ]);
}

const ICONS: Record<ResourceIcon, IconArt> = {
  nugget,
  sand,
  lump,
  bar,
  wafer,
  rods,
  ingot,
  plate,
  block,
  blob,
  truss,
  coil,
  board,
  orb,
  chip,
  flask,
  prism,
};

export function iconSprite(resource: string, look: IconLook): SpriteArt {
  const svg = new Svg(ICON_SIZE, ICON_SIZE);
  ICONS[look.icon](svg, look);
  return { id: iconId(resource), w: ICON_SIZE, h: ICON_SIZE, ax: 0.5, ay: 0.5, svg: svg.doc() };
}

/**
 * The look of a material or currency from content: its silhouette and colours, and for an alloy the
 * colours of its inputs in the ratio of the first alloy that makes it. Null for an unknown id.
 */
export function iconLook(content: ContentRegistry, id: string): IconLook | null {
  const currency = content.currencies.find(id);
  if (currency) return { icon: currency.icon, color: currency.color };
  const m = content.materials.find(id);
  if (!m) return null;
  const look: IconLook = { icon: m.icon, color: m.color };
  if (m.accent) look.accent = m.accent;
  if (m.mark) look.mark = m.mark;
  const alloy = content.alloys.list.find((a) => a.output === id);
  if (alloy) look.blend = alloy.inputs.map((input, i) => ({ color: content.materials.get(input).color, share: alloy.ratio[i] ?? 0 }));
  return look;
}

/** An icon from content (falls back to a plain lump for an unknown id, so a typo never crashes the HUD). */
export function resourceIcon(content: ContentRegistry, id: string): SpriteArt {
  return iconSprite(id, iconLook(content, id) ?? { icon: 'lump', color: '#888888' });
}
