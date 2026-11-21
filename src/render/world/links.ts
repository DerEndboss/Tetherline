import { Container, Graphics, Sprite } from 'pixi.js';
import { powerGraph } from '../../sim/power';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';
import { hexToNumber } from '../art/color';
import { FX } from '../art/fx';
import type { Baked } from '../bake';
import { heightScale, type Rect } from '../iso';
import { buildingCentre } from './geometry';

/** The power colour: the pulses on a live cable and its lit core in build mode. */
const POWER = 0xffd36b;
/** A network without energy, lit in build mode. */
const DEAD = 0xff7b6b;
/** The cable itself: a dark rubber sheath with a soft sheen; the sheen is brighter on a live network. */
const CABLE = 0x1f2436;
const SHEEN = 0x9fb0dc;
const SHEEN_DEAD = 0x5d6684;
const BRIDGE = 0x7ff0e8;
const DRIVER = 0xc9a0f0;
/** A fresh link grows from its first end to the second in this many ms. */
const GROW_MS = 450;
const MAX_PULSES = 220;
/** Time a light pulse takes along a cable or a bridge span, ms. */
const TRAVEL_MS = 1500;
/** Cable sag at its middle in world px: a little plus a share of its length, scaled by the view's height (flat from above). */
const SAG_BASE = 6;
const SAG_PER_PX = 0.05;
/** Where the shadow of a cable falls on the ground relative to the cable's ground line (light from the left). */
const SHADOW_DX = 6;
const SHADOW_DY = 1;

type Pt = { x: number; y: number };
type Wire = (b: Building) => Pt;

type AddLink = (a: Building, b: Building, kind: Link['kind'], arc: number) => void;

/** Spans between two buildings by behaviour: their kind and how much the line bows (negative: an arc upwards). */
const SPANS: Partial<Record<string, { kind: Link['kind']; arc: number }>> = {
  bridge: { kind: 'bridge', arc: 0.02 },
  'liquid-bridge': { kind: 'liquid', arc: 0.02 },
  'mass-driver': { kind: 'driver', arc: -0.22 },
};

interface Link {
  a: Building;
  b: Building;
  kind: 'laser' | 'bridge' | 'liquid' | 'driver';
  key: number;
  born: number;
  /** Control point of the sagging curve. */
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** The ground under both ends (where a cable's shadow runs). */
  gax: number;
  gay: number;
  gbx: number;
  gby: number;
  phase: number;
}

/**
 * render-world's lines over the world: power cables between nodes and what they link (a dark cable with a sheen
 * hanging from the attach points, its shadow on the ground, a faint light pulse running along while the network
 * has energy, lit up in build mode; new cables grow in) and bridge and mass driver spans. (The drone's work beam
 * is build-beam.ts, drawn by the drones layer.) Settled links are one cached Graphics rebuilt on layout changes;
 * only links still growing and the pulses move every frame.
 */
export class LinksLayer {
  readonly links = new Graphics();
  readonly live = new Container();
  /** The cables' shadows: lies on the ground, under the sorted objects. */
  readonly ground = new Container();
  private readonly shadows = new Graphics();
  private readonly shadowsGrowing = new Graphics();
  private readonly growing = new Graphics();
  private readonly pulses: Sprite[] = [];
  private list: Link[] = [];
  private known = new Map<number, number>();
  private world: World | null = null;
  private layout = -1;
  private settleAt = Infinity;
  private checked = 0;
  private powered = '';
  private bright = false;
  private still = false;
  private readonly glow: Baked | undefined;
  private liquidColors: number[] = [];

  constructor(sprites: Map<string, Baked>) {
    this.glow = sprites.get(FX.glow);
    this.live.addChild(this.growing);
    this.ground.addChild(this.shadows, this.shadowsGrowing);
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  setLiquidColors(colors: string[]): void {
    this.liquidColors = colors.map(hexToNumber);
  }

  /** `bright`: build mode (a building or a blueprint in hand), the cables light up. */
  update(w: World, wire: Wire, view: Rect, nowMs: number, bright = false): void {
    let redraw = nowMs >= this.settleAt || bright !== this.bright;
    this.bright = bright;
    if (w !== this.world || w.layout !== this.layout) {
      // a different world starts without growing animations: its links were all there already
      if (w !== this.world) this.known.clear();
      this.collect(w, wire, nowMs, w !== this.world);
      this.world = w;
      this.layout = w.layout;
      redraw = true;
    }
    if (nowMs - this.checked > 400) {
      this.checked = nowMs;
      const key = this.poweredKey(w);
      if (key !== this.powered) {
        this.powered = key;
        redraw = true;
      }
    }
    if (redraw) this.drawSettled(w, nowMs);
    this.drawGrowing(w, nowMs);
    this.movePulses(w, view, nowMs);
  }

  /** Every link of the layout with its geometry; links never seen before get a birth time. */
  private collect(w: World, wire: Wire, nowMs: number, fresh: boolean): void {
    const seen = new Map<number, number>();
    const out: Link[] = [];
    const add: AddLink = (a, b, kind, arc) => {
      const key = Math.min(a.id, b.id) * 100003 + Math.max(a.id, b.id);
      const born = this.known.get(key) ?? (fresh ? -1e9 : nowMs);
      seen.set(key, born);
      const p = wire(a);
      const q = wire(b);
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const bow = kind === 'laser' ? 2 * (SAG_BASE + len * SAG_PER_PX) * heightScale() : arc * len;
      const ga = buildingCentre(w, a);
      const gb = buildingCentre(w, b);
      out.push({ a, b, kind, key, born, ax: p.x, ay: p.y, bx: q.x, by: q.y, cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 + bow, gax: ga.x, gay: ga.y, gbx: gb.x, gby: gb.y, phase: (key % 97) / 97 });
    };
    for (const b of w.state.buildings) if (w.ready(b)) this.spansOf(w, b, add);
    this.settleAt = out.reduce((t, l) => (nowMs - l.born < GROW_MS ? Math.min(t, l.born + GROW_MS) : t), Infinity);
    this.list = out;
    this.known = seen;
  }

  /** The laser links of a node and the span of a bridge or mass driver (each pair once, from the lower id). */
  private spansOf(w: World, b: Building, add: AddLink): void {
    for (const id of b.links) {
      const o = w.byId.get(id);
      if (o && o.id > b.id && w.ready(o)) add(b, o, 'laser', 0.07);
    }
    const span = SPANS[w.def(b).behaviour];
    if (span) this.span(w, b, span, add);
  }

  private span(w: World, b: Building, span: { kind: Link['kind']; arc: number }, add: AddLink): void {
    const partner = b.link >= 0 ? w.byId.get(b.link) : undefined;
    if (partner && partner.id > b.id && w.ready(partner)) add(b, partner, span.kind, span.arc);
  }

  /** Which lasers carry power now (a string of 0/1), so the settled layer redraws when a network wakes or dies. */
  private poweredKey(w: World): string {
    const g = powerGraph(w);
    let key = '';
    for (const l of this.list) if (l.kind === 'laser') key += (g.nets[g.netOf.get(l.a.id) ?? -1]?.made ?? 0) > 0 ? '1' : '0';
    return key;
  }

  /** Whether the network a cable belongs to has energy. */
  private powered2(w: World, l: Link): boolean {
    const g = powerGraph(w);
    return (g.nets[g.netOf.get(l.a.id) ?? -1]?.made ?? 0) > 0;
  }

  private color(w: World, l: Link): number {
    if (l.kind === 'bridge') return BRIDGE;
    if (l.kind === 'driver') return DRIVER;
    return this.liquidColors[l.a.liquidId] ?? 0x6fb6e0;
  }

  private drawSettled(w: World, nowMs: number): void {
    const g = this.links;
    g.clear();
    this.shadows.clear();
    for (const l of this.list) {
      if (nowMs - l.born < GROW_MS) continue;
      if (l.kind === 'laser') this.cable(g, this.shadows, l, 1, this.powered2(w, l));
      else this.stroke(g, l, 1, this.color(w, l));
    }
  }

  /** The curve of a link up to `f` of its length: a de Casteljau split of the quadratic, shifted down by `dy`. */
  private path(g: Graphics, l: Link, f: number, dy = 0): void {
    g.moveTo(l.ax, l.ay + dy);
    if (f >= 1) {
      g.quadraticCurveTo(l.cx, l.cy + dy, l.bx, l.by + dy);
      return;
    }
    const u = 1 - f;
    g.quadraticCurveTo(l.ax + (l.cx - l.ax) * f, l.ay + (l.cy - l.ay) * f + dy, u * u * l.ax + 2 * u * f * l.cx + f * f * l.bx, u * u * l.ay + 2 * u * f * l.cy + f * f * l.by + dy);
  }

  /**
   * A power cable grown to `f` of its length: its shadow on the ground, a dark sheath with a sheen on top, the two
   * clamps at the attach points, and in build mode a lit core (coral when the network has no energy).
   */
  private cable(g: Graphics, shadow: Graphics, l: Link, f: number, live: boolean): void {
    const ex = l.gax + (l.gbx - l.gax) * f;
    const ey = l.gay + (l.gby - l.gay) * f;
    shadow.moveTo(l.gax + SHADOW_DX, l.gay + SHADOW_DY).lineTo(ex + SHADOW_DX, ey + SHADOW_DY).stroke({ width: 2.6, color: 0x000000, alpha: 0.2 });
    if (this.bright) {
      this.path(g, l, f);
      g.stroke({ width: 7, color: live ? POWER : DEAD, alpha: 0.16 });
    }
    this.path(g, l, f);
    g.stroke({ width: 2.6, color: CABLE, alpha: 0.96 });
    this.path(g, l, f, -0.9);
    g.stroke({ width: 0.9, color: live ? SHEEN : SHEEN_DEAD, alpha: live ? 0.6 : 0.32 });
    if (this.bright) {
      this.path(g, l, f);
      g.stroke({ width: 1.2, color: live ? POWER : DEAD, alpha: 0.9 });
    }
    this.clamp(g, l.ax, l.ay);
    if (f >= 1) this.clamp(g, l.bx, l.by);
  }

  /** The small fitting where a cable meets a mast or a machine. */
  private clamp(g: Graphics, x: number, y: number): void {
    g.circle(x, y, 2.7).fill({ color: CABLE });
    g.circle(x - 0.6, y - 0.7, 1).fill({ color: SHEEN, alpha: 0.7 });
  }

  /** Strokes a bridge, liquid bridge or mass driver span (grown to `f` of its length) as glow + core line. */
  private stroke(g: Graphics, l: Link, f: number, color: number): void {
    for (const [width, a] of [[4, 0.16], [1.4, 0.6]] as const) {
      this.path(g, l, f);
      g.stroke({ width, color, alpha: a });
    }
  }

  private drawGrowing(w: World, nowMs: number): void {
    const g = this.growing;
    g.clear();
    this.shadowsGrowing.clear();
    if (nowMs >= this.settleAt) return;
    for (const l of this.list) {
      const age = nowMs - l.born;
      if (age >= GROW_MS || age < 0) continue;
      const t = age / GROW_MS;
      const f = 1 - (1 - t) * (1 - t);
      if (l.kind === 'laser') this.cable(g, this.shadowsGrowing, l, f, this.powered2(w, l));
      else this.stroke(g, l, f, this.color(w, l));
    }
  }

  private pulse(i: number): Sprite {
    let s = this.pulses[i];
    if (!s) {
      s = new Sprite(this.glow?.texture);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.scale.set(0.15);
      this.live.addChild(s);
      this.pulses.push(s);
    }
    return s;
  }

  /** Whether a link gets a pulse: on screen, carrying something (a laser needs a network with energy). */
  private pulsing(l: Link, g: ReturnType<typeof powerGraph>, view: Rect): boolean {
    if (l.kind === 'liquid') return false;
    const mx = (l.ax + l.bx) / 2;
    const my = (l.ay + l.by) / 2;
    if (mx < view.left - 200 || mx > view.right + 200 || my < view.top - 200 || my > view.bottom + 200) return false;
    return l.kind !== 'laser' || (g.nets[g.netOf.get(l.a.id) ?? -1]?.made ?? 0) > 0;
  }

  /** Light pulses run along powered lasers (nodes with energy) and bridges, only where the span is on screen. */
  private movePulses(w: World, view: Rect, nowMs: number): void {
    let used = 0;
    if (this.glow && !this.still) {
      const g = powerGraph(w);
      for (const l of this.list) if (used < MAX_PULSES && this.pulsing(l, g, view)) this.placePulse(this.pulse(used++), l, nowMs);
    }
    for (let i = used; i < this.pulses.length; i++) this.pulses[i]!.visible = false;
  }

  private placePulse(s: Sprite, l: Link, nowMs: number): void {
    const t = (((nowMs - l.born) / TRAVEL_MS + l.phase) % 1 + 1) % 1;
    const u = 1 - t;
    s.visible = true;
    s.position.set(u * u * l.ax + 2 * u * t * l.cx + t * t * l.bx, u * u * l.ay + 2 * u * t * l.cy + t * t * l.by);
    s.tint = l.kind === 'laser' ? POWER : l.kind === 'bridge' ? BRIDGE : DRIVER;
    const peak = l.kind === 'laser' ? (this.bright ? 0.95 : 0.5) : 0.9;
    s.alpha = nowMs - l.born < GROW_MS ? 0 : Math.min(1, Math.sin(t * Math.PI) * 1.4) * peak;
  }
}
