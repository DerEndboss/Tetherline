import { Application, Container, type Sprite } from 'pixi.js';
import type { ThemeDef } from '../../content/types';
import type { Game } from '../../game/game';
import type { Interaction } from '../../game/interaction';
import type { World } from '../../sim/world';
import { wreckAt } from '../../sim/wrecks';
import { hexToNumber } from '../art/color';
import { FX } from '../art/fx';
import { loadArtManifest, type ArtManifest } from '../art-manifest';
import { BAKE_BUDGET_PX, bakeAtlas, type BakeOptions, type Baked } from '../bake';
import { bakeScaleFor, Camera, startZoom } from '../camera';
import { decoAtPoint } from '../deco/pick';
import { DecoView } from '../deco/view';
import { attachCameraInput } from '../input';
import { footprintDepth, footprintWidth, footprintCentre } from './geometry';
import { mapBounds, worldToGrid, worldToTile } from '../iso';
import { depthKey } from '../sprite-pool';
import { Sky } from '../sky';
import { BeltsLayer } from './belts-layer';
import { LightLayer, mapTint } from './light';
import { worldSettings } from './settings';
import { decoSource } from './deco-source';
import { mapSprite, paintMap } from './ground';
import { ObjectsLayer } from './objects';
import { OresLayer, WreckSprites } from './ores-layer';
import { WaterLayer } from './water';
import { terrainOf } from '../../content/themes';
import { DronesLayer } from './drones-layer';
import { LinksLayer } from './links';
import { ToolsLayer } from './tools-layer';
import { itemSpriteId, worldSprites } from './sprites';

export const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * The world renderer (the rendering adapter): PixiJS, the camera, sky, 3D sprite atlases and deco
 * wiring, drawing the grid world. It reads the world read-only; pointer input becomes Interaction calls.
 * Layers bottom to top: sky, painted map, liquids (water.ts), ore chunks (ores-layer), deco cables, belts and conduits, depth-sorted objects (buildings,
 * boulders, items, ghosts, drone), power lasers and tool lines, horizon and vignette.
 */
export class WorldView {
  readonly camera = new Camera();
  private readonly world = new Container();
  private readonly mapLayer = new Container();
  private readonly objects = new Container();
  private readonly sky: Sky;
  private readonly belts: BeltsLayer;
  private readonly things: ObjectsLayer;
  private readonly links: LinksLayer;
  private readonly light: LightLayer;
  private readonly tools = new ToolsLayer();
  private readonly drones: DronesLayer;
  private readonly deco: DecoView;
  private readonly ores: OresLayer;
  private readonly wrecks: WreckSprites;
  private readonly water = new WaterLayer();
  private shownWorld: World | null = null;
  private still = prefersReducedMotion();
  /** The mouse over the canvas, in canvas px (null: it is elsewhere), and what the hover was last worked out for. */
  private pointer: { x: number; y: number } | null = null;
  private hoverCamera = -1;
  private hoverView: unknown = null;

  private constructor(
    readonly app: Application,
    private readonly game: Game,
    private readonly interaction: Interaction,
    private readonly sprites: Map<string, Baked>,
    private readonly art: ArtManifest,
    theme: ThemeDef,
    bake: BakeOptions,
  ) {
    this.objects.sortableChildren = true;
    this.sky = new Sky(theme.palette, sprites);
    const itemIds = game.content.materials.list.map((_m, i) => itemSpriteId(game.content, art, i));
    this.belts = new BeltsLayer(this.objects, app.renderer, bake.scale, game.content, (i) => sprites.get(itemIds[i] ?? ''), footprintWidth(1));
    this.things = new ObjectsLayer(this.objects, sprites, art, theme.boulders, hexToNumber(theme.palette.tech), bake);
    this.drones = new DronesLayer(this.objects, sprites);
    this.ores = new OresLayer(bake);
    this.wrecks = new WreckSprites(this.objects, art, bake);
    this.wrecks.setStill(this.still);
    this.water.setStill(this.still);
    this.links = new LinksLayer(sprites);
    this.light = new LightLayer(sprites.get(FX.glow));
    this.links.setLiquidColors(game.content.liquids.list.map((l) => l.color));
    this.deco = new DecoView(decoSource(() => this.game.world, interaction, theme.palette.tech), this.objects, bake, this.camera);
    // liquids and ore chunks lie on the painted map; deco cables under the belts (the planner never crosses one, but a
    // belt laid over a cable must hide it at once); power cable shadows on the ground under the objects
    this.world.addChild(this.mapLayer, this.water.layer, this.ores.ground, this.deco.layer, this.belts.ground, this.things.ground, this.light.layer, this.links.ground, this.objects, this.links.links, this.links.live, this.tools.layer);
    // the horizon band lives behind the world: it shows only past the map's edge
    app.stage.addChild(this.sky.back, this.sky.front, this.world, this.sky.wash, this.sky.vignette);
  }

  static async create(host: HTMLElement, game: Game, interaction: Interaction): Promise<WorldView> {
    const app = new Application();
    const theme = game.content.themes.get(game.world.state.map.theme);
    await app.init({ resizeTo: host, background: theme.palette.void, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), preference: 'webgl' });
    host.appendChild(app.canvas);
    const art = await loadArtManifest();
    const wanted = bakeScaleFor(app.renderer.resolution);
    const { baked, scale } = await bakeAtlas(worldSprites(game.content, theme, art), { scale: wanted, art, budget: BAKE_BUDGET_PX });
    const view = new WorldView(app, game, interaction, baked, art, theme, { scale, art });
    view.attach();
    return view;
  }

  private attach(): void {
    const { app, camera } = this;
    const resize = (w: number, h: number): void => {
      camera.resize(w, h);
      this.sky.resize(w, h);
    };
    resize(app.screen.width, app.screen.height);
    app.renderer.on('resize', resize);
    const tile = (sx: number, sy: number) => this.groundTile(sx, sy);
    const canvas = app.canvas;
    const track = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointermove', track);
    canvas.addEventListener('pointerdown', track);
    canvas.addEventListener('pointerleave', () => (this.pointer = null));
    // taps, hover and right clicks aim at the decoration piece under the pointer when there is one (drags use the ground)
    const aim = (sx: number, sy: number) => this.pointTile(sx, sy, tile(sx, sy));
    attachCameraInput(app.canvas, camera, {
      pointTile: aim,
      onTap: (sx, sy) => {
        const t = aim(sx, sy);
        this.interaction.tap(t.x, t.y);
      },
      onHover: (sx, sy) => {
        const t = aim(sx, sy);
        this.interaction.hoverAt(t.x, t.y, camera.screenToWorld(sx, sy));
      },
      // drag areas are rectangles on the screen: the tools get the pointer in world px next to its tile
      onDragStart: (sx, sy) => {
        const t = tile(sx, sy);
        return this.interaction.dragStart(t.x, t.y, camera.screenToWorld(sx, sy));
      },
      onDrag: (sx, sy) => {
        const t = tile(sx, sy);
        this.interaction.hoverAt(t.x, t.y, camera.screenToWorld(sx, sy));
      },
      onDragEnd: (sx, sy) => {
        const t = tile(sx, sy);
        this.interaction.dragEnd(t.x, t.y, camera.screenToWorld(sx, sy));
      },
      onSecondaryTap: () => this.interaction.cancel(),
      onLeave: () => (this.interaction.hover = null),
    });
  }

  /** The ground tile under a screen point; the nearest tile corner goes to the tools too (an even-sized building centres on it). */
  private groundTile(sx: number, sy: number): { x: number; y: number } {
    const p = this.camera.screenToWorld(sx, sy);
    const g = worldToGrid(p.x, p.y);
    this.interaction.corner = { x: Math.round(g.x), y: Math.round(g.y) };
    return worldToTile(p.x, p.y);
  }

  /**
   * The hover follows the world, not only the mouse: when the camera moved (a tutorial pan, WASD, a zoom) or the
   * tool changed (Esc, a new tool) while the mouse stood still, the tile under it is worked out again. Without
   * this the hover card kept describing what used to be there, and R after Esc found no hover.
   */
  private followPointer(): void {
    const p = this.pointer;
    const view = this.interaction.getView();
    if (!p || (this.hoverCamera === this.camera.version && this.hoverView === view)) return;
    this.hoverCamera = this.camera.version;
    this.hoverView = view;
    const t = this.pointTile(p.x, p.y, this.groundTile(p.x, p.y));
    this.interaction.hoverAt(t.x, t.y, this.camera.screenToWorld(p.x, p.y));
  }

  /**
   * The tile a tap, hover or right click at screen point (sx, sy) works on: the decoration piece whose body is under
   * the pointer (a tall rack is hit on its upper body too, not only on the ground tile under it), else `ground`.
   * Only with no tool in hand (a tool needs the ground tile) and only where nothing solid stands in front of the
   * piece: a building or belt nearer the viewer keeps the click.
   */
  private pointTile(sx: number, sy: number, ground: { x: number; y: number }): { x: number; y: number } {
    if (this.interaction.mode.kind !== 'none') return ground;
    const p = this.camera.screenToWorld(sx, sy);
    const hit = decoAtPoint(p.x, p.y, (depth) => this.solidInFront(ground.x, ground.y, depth));
    return hit ? { x: hit.x, y: hit.y } : ground;
  }

  /** Whether a building, belt or wreck at ground tile (x, y) is nearer the viewer than `depth` (a prop's sort key). */
  private solidInFront(x: number, y: number, depth: number): boolean {
    const w = this.game.world;
    const b = w.at(x, y);
    if (!b) return wreckAt(w, x, y) !== undefined && depthKey(x, y) > depth;
    const def = w.def(b);
    const flat = def.behaviour === 'conveyor' || def.behaviour === 'conduit';
    return (flat ? depthKey(x, y) : footprintDepth(b.x, b.y, def.size)) > depth;
  }

  /** A new world (load, new round): repaint the map and centre the camera on the core. */
  private show(w: World): void {
    this.shownWorld = w;
    this.deco.reset();
    this.repaintGround();
    this.camera.bounds = mapBounds(w.state.map.w, w.state.map.h);
    this.camera.fitMinZoom();
    this.camera.setZoom(startZoom(this.camera.viewW, this.camera.viewH, this.app.renderer.resolution) * 0.5);
    this.centreOnCore();
  }

  /** Paints the ground again from the map (a new world; dev: after `groundbreak.sim.paint`) and redraws the ores. */
  repaintGround(): void {
    const w = this.game.world;
    this.ores.reset();
    for (const c of this.mapLayer.removeChildren()) c.destroy({ texture: true, textureSource: true });
    const theme = this.game.content.themes.get(w.state.map.theme);
    this.mapLayer.addChild(mapSprite(paintMap(w.state.map, this.game.content, theme.palette, w.state.seed)) as Sprite);
    this.water.paint(w.state.map, this.game.content, theme.palette, terrainOf(theme).shore, w.state.seed);
  }

  /** Puts the core in the middle of the screen (H / Home), keeping the zoom. */
  centreOnCore(): void {
    const w = this.game.world;
    const core = w.core;
    const c = core ? footprintCentre(core.x, core.y, w.def(core).size) : { x: 0, y: 0 };
    this.camera.lookAt(c.x, c.y);
  }

  setStill(still: boolean): void {
    this.still = still;
    this.belts.setStill(still);
    this.links.setStill(still);
    this.drones.setStill(still);
    this.things.setStill(still);
    this.wrecks.setStill(still);
    this.water.setStill(still);
  }

  /** Called every frame after the sim (alpha = progress to the next tick, for smooth belts). */
  render(alpha: number, nowMs: number): void {
    const w = this.game.world;
    if (w !== this.shownWorld) this.show(w);
    const { camera } = this;
    this.followPointer();
    this.world.position.set(camera.viewW / 2 + camera.offsetX - camera.x * camera.zoom, camera.viewH / 2 + camera.offsetY - camera.y * camera.zoom);
    this.world.scale.set(camera.zoom);
    this.sky.update(camera.viewW, camera.x, camera.y, nowMs, this.still);
    const lighting = worldSettings().lighting;
    this.light.setOn(lighting);
    this.mapLayer.tint = mapTint(lighting);
    this.ores.ground.tint = this.mapLayer.tint;
    this.water.layer.tint = this.mapLayer.tint;
    this.light.update(w, camera, nowMs, this.still);
    this.ores.update(w, camera);
    this.wrecks.update(w, camera, nowMs, this.mapLayer.tint);
    this.water.update(camera, nowMs);
    this.belts.update(w, camera, alpha, nowMs, this.interaction.preview());
    this.things.update(w, camera, nowMs, this.interaction.preview(), this.interaction.hover);
    this.drones.update(w, nowMs, (b) => this.things.wirePoint(w, b), camera.zoom);
    this.links.update(w, (b) => this.things.wirePoint(w, b), camera.viewRect(), nowMs, this.building());
    this.tools.update(w, this.interaction);
  }

  /** Whether the player has a building or a blueprint in hand (build mode: cables light up). */
  private building(): boolean {
    const { kind } = this.interaction.mode;
    return kind === 'place' || kind === 'paste';
  }

  /** Puts the middle of the map in the middle of the screen (the stress scene, overviews). */
  centreOnMap(): void {
    const { map } = this.game.world.state;
    const c = footprintCentre(0, 0, 0);
    const m = footprintCentre(map.w / 2, map.h / 2, 0);
    this.camera.lookAt(m.x - c.x, m.y - c.y);
  }

  /** World tile at the middle of the screen. */
  centreTile(): { x: number; y: number } {
    return worldToTile(this.camera.x, this.camera.y);
  }

  /** Screen point of a tile centre (dev hooks, screenshots). */
  screenOfTile(x: number, y: number): { x: number; y: number } {
    const c = footprintCentre(x, y, 1);
    return this.camera.worldToScreen(c.x, c.y);
  }

  /** The art manifest the world uses (the UI shows the same icons). */
  get artManifest(): ArtManifest {
    return this.art;
  }
}
