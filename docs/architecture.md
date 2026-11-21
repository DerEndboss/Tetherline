# Tetherline architecture

The map of the codebase: where things live, which interfaces to build on, and which folder owns what. Read this
together with `CLAUDE.md` (rules and traps) and `docs/art.md` (the sprite pipeline). If this file and the code
disagree, the code wins and this file gets fixed.

A reference point for performance: 3,000 buildings with 7,200 to 10,000 items on belts cost the simulation about
0.5 ms per tick (`npm run bench`); drawing the whole stress scene zoomed out costs about 3 ms of JavaScript per frame
on a GTX 1660-class GPU (`npm run perf`).

## 1. Principles

- **Deterministic fixed tick** (20 Hz, `sim/constants.ts`). No `Math.random`, `Date` or `performance.now` in
  `src/sim`. Every change goes through `step(world, commands)`. Iteration order is the `state.buildings` order.
- **State outside React.** The UI reads the 10 Hz snapshot (`useSnapshot`) or `useWorldSelector`; it sends commands
  with `game.enqueue`. The renderer reads the world read-only.
- **Content is data.** Code switches on `BuildingDef.behaviour` (a fixed set of code paths), never on an id.
- **Data-oriented where it is hot.** The map is typed arrays (one byte per tile per layer), belt items live in a
  structure-of-arrays store, tile occupancy is an `Int32Array`. Buildings are plain records (3,000 at 20 Hz is cheap).
- **Graphs only on layout changes.** Power and liquid networks, neighbour lists, storage docking and drill ore
  counts are derived and cached; `world.touch()` (called by every add/remove/rotate/link) drops them.
- **Every commit builds and runs.** Lint with 0 warnings, complexity <= 10, TypeScript strict,
  `npm run lint && npm run typecheck && npm run test:run && npm run build` before each commit.
- **Ports.** Scripts that start a preview server default to 4340 (`scripts/lib/preview.mjs`); set `GB_PORT=43xx` to run
  several at once, and stop only the processes you started.

## 2. Module map

```
src/
  content/              the schema and all game data
    types.ts            schema: MaterialDef, LiquidDef, FloorDef, BuildingDef (+ specs), RecipeDef, OrderDef,
                        MetaNodeDef, ThemeDef, MapSizeDef, MapPropertyDef, ResourceSpawnDef, RulesDef, RawContent
    registry.ts         Table<T>: get / find / has / indexOf (O(1), the number stored in typed arrays) / at
    validate.ts         validateContent(raw) -> problems[] (validate.test.ts keeps it at [])
    index.ts            rawContent + content (the registry)
    materials.ts liquids.ts floors.ts recipes.ts buildings/<category>.ts themes.ts map.ts orders.ts meta.ts rules.ts
  sim/                  deterministic simulation (no DOM, no Pixi, no React)
    state.ts            SimState (saved as is), MapState, Building, BeltStore, Plan, DroneState, RunStats, ProgressState
    world.ts            World: state + derived indices (occ, byId, neighbours, cache), add/remove/reshape/touch,
                        at(x,y), facing(b,dir), def(b), rect(b), ready(b); newBuilding()
    grid.ts             DX/DY, opposite/turnLeft/turnRight, sideOf, touches, edgeTiles, gapBetween
    belts.ts            BeltStore helpers (alloc/free slots, beltItems)
    items.ts            THE item hand-off: accepts, offer, dump, dumpFrom, itemTotal
    storage.ts          core stock + docked containers: storageInfo, coreRoom, storeInCore, heldBy, takeFrom
    power.ts            power graph, powerMade/powerWanted, stepPower, powerFactor, laser links (autoLink ...)
    liquids.ts          liquid networks, drawLiquid, pushLiquid, fillNet, netOfMember, settleLiquids
    placement.ts        placementProblem(world, def, x, y), topLeftFor(size, cx, cy)
    construction.ts     ghosts -> sites -> buildings: startSite, buildSite, finishSite, unbuild, removeNow,
                        clearBoulders, core upgrade in place (startUpgrade, upgradeSpot)
    commands.ts         CommandMap / EventMap (augmentable), Command, SimEvent, PlanSpec, TileBox
    tick.ts             step(world, commands) -> events; run(world, ticks); registerCommand(type, handler)
    newgame.ts          createRun(content, {seed, size?, theme?}) -> World
    map-effects.ts      mapEffect(world, 'solar' | 'wind' | 'drill' | 'slagFields')
    dev.ts              testWorld, paint, placeNow, beltLine (tests, dev, stress)
    stress.ts           stressWorld(content, {buildings, items})
    bot*.ts             the autopilot's planner (script, field, hub, supply, late game, space search)
    rng.ts clock.ts hash.ts constants.ts
    blocks/             behaviour code: types.ts (BlockBehaviour, TickContext), registry.ts (BLOCKS table),
                        index.ts (fills it), storage, conveyor, routing (junction, router, sorter, overflow),
                        transport (bridge, mass driver, unloader), production (drill, crafter), energy, fluid
    drones/             the build drones: nextJob, stepDrones, hauling, upgrades
    mapgen/             generateMap(content, {seed, size, theme}) -> {map, core}; winnable.ts checks every map can be won
    progression/        orders: orderProgress, startOrders, stepProgress
  game/                 browser-side game shell (DOM-free logic)
    game.ts             Game: world, clock, command queue, events, snapshot store, paused, replaceWorld(world, slot)
    snapshot.ts         Snapshot (HUD data, 10 Hz)
    interaction.ts      Interaction: tools (place / remove / select), rotation, preview ghosts, pointer API
    line.ts hotkeys.ts  dragged lines; R / Q / X / B / Escape
    tools/              blueprints, undo, multi-place, region rectangles, power-pole auto path
    inspect/            what is at a tile (data for the hover card)
    autopilot*.ts       main-thread side of the autopilot and its Web Worker
    demo.ts             demoCommands(world): a small checkpoint as commands (dev hook)
    perf.ts             FramePerf
  save/                 serialize.ts (SaveRecord, saveKind, files with typed arrays), slots.ts (3 IndexedDB slots),
                        autosave.ts, meta.ts (the meta tree across rounds)
  settings/             per-device preferences (volumes, motion, autopilot, speed, view)
  tutorial/             the guided first round: steps, spots, help for belts that cannot work
  render/               PixiJS
    iso.ts camera.ts camera-motion.ts input.ts   projection (views), camera, pan/zoom input
    bake.ts pack.ts art-manifest.ts sprite-pool.ts sky.ts particles.ts art/   atlases, 3D art loading, sky, fx
    deco/               decoration wiring (plan.ts, view.ts with DecoSource, ids.ts)
    world/              the world adapter
      view.ts           WorldView: app, layers, render(alpha, now), show(world) on a new world, centreOnMap
      sprites.ts        sprite ids: buildingSpriteId, spriteFor (own art > placeholder > block), worldSprites
      ground.ts         paintMap (ground tones, ore stones, liquids, ridges) -> mapSprite
      belts-layer.ts    conveyors and conduits on the ground + items on belts (item size: `ITEM_PITCH`)
      belt-art.ts       belt atlas (straight, bends, merges, tread phases);  belt-shape.ts feed masks, item path points
      pipe-art.ts       conduit atlases: shell (base), liquid per fill level, flow streaks per phase, gloss + flanges (top)
      pipe-shape.ts     which of the 11 pipe shapes (2 straights, 4 round bends, 4 tees, cross) a conduit is drawn as, from
                        the sides it is really joined on (`pipeArms`), plus the lane geometry for the bake and the flow
      objects.ts        buildings (fit to footprint), holographic sites, ghosts, boulders
      ores-layer.ts water.ts   3D ore fields and ridges, liquids
      drones-layer.ts   drones + their work beams (build-beam.ts);  links.ts power cables, bridge spans;  tools-layer.ts removal box, selection
      deco-source.ts    the world as DecoSource for render/deco
      geometry.ts       footprintCentre, footprintDepth, footprintWidth, band
  ui/                   React 19 HUD
    App.tsx             menu or HUD;  context.ts GameServices + hooks;  hud/Hud.tsx slot frame, speed button
    palette/ tools/ progression/ drones/ world/ sound/ config/   one folder per part (slot component, settings, css)
    components/ (Icon, GameIcon, Presence, AnimatedNumber, tooltips)  format.ts  styles/ (tokens, base, kit, app.css imports every part's css)
  audio/                engine, music, composer, tracks, instruments, sfx, ambience, machines, ui-sounds, offline,
                        sound.ts (GameSound), types.ts
  legacy/               content and SVG art of the game's first design, frozen: only art3d/ imports it
art3d/                  3D models (docs/art.md): base, mining, logistics, liquids, power, factories, mega, units, nature,
                        icons, terrain, ores, deco, and the shared kit
scripts/                art.mjs, artsheet.ts, shots.mjs, perf.mjs, bench.ts, listen.mjs, autopilot.ts, smoke.mjs, lib/preview.mjs
```

Frame loop (main.tsx): Pixi ticker -> `game.frame(ms, now)` (0..n ticks, events, snapshot at most every 100 ms)
-> `view.render(clock.alpha, now)`. Boot: `bootWorld` (URL `?seed`, `?slot`, `?dev&stress`, else the last slot) ->
`Game` -> `WorldView.create` (bakes the theme's atlas) -> React. A new run on another theme saves into its slot and
reloads the page with `?slot=N` (sky and boulders are baked per theme).

## 3. The data model

**MapState** (`state.map`): `w`, `h`, `theme`, `size`, `props` (map property ids), and four `Uint8Array` layers of
`w * h` (index `y * w + x`): `ground` (0 = no land, n = theme ground tone n-1), `floor` (0 = plain, n = floors index
n-1: ore, water, oil, slag), `ridge` (1 = unbuildable rock), `boulder` (0 = none, n = theme boulder variant n-1,
decoration only), plus `wrecks` (blueprint markers, mapgen fills them).

**Building** (`state.buildings`, placement order): `id` (never reused), `kind` (buildings index), `x, y` (top-left),
`rot` (0 E, 1 S, 2 W, 3 N), `build` (0..1, 1 = working), `spent` (items paid per cost entry), `items` (per material
index, [] when it has no inventory), `liquid` + `liquidId`, `work` (craft/mine progress, burn seconds, transfer
accumulator), `charge` (battery), `config` (sorter/unloader item, recipe index), `link` (bridge/driver partner),
`links` (node lasers), `rr` (round-robin), `queue` (small item queues: junction per direction, router, bridge,
made liquid), `slot` (belt store slot), `removing`, `upgrade` (core upgrade in place).

**BeltStore** (`state.belts`): `item: Int16Array`, `pos: Int16Array` (0..`BELT_LEN` = 1000 along the tile),
`count: Uint8Array`, `BELT_SLOTS` (4) per conveyor slot, front item first. `rules.beltSlots` (3) items fit a tile;
the gap is `BELT_LEN / beltSlots`.

**Core stock** (`state.stock`, per material index): the core's store; containers and vaults that touch the core dock
into it (they add room; the core and docked storage share one stock). Capacity: `storageInfo(world).capacity`.

**Ghosts** (`state.plans`): `{kind, x, y, rot, config}` in build order. Sites are buildings with `build < 1`.

**Drones** (`state.drones`): `{id, x, y, task, target, waiting}`; index 0 is the player's drone.

**RunStats** (`state.stats`): `delivered` and `made` per material, `built` per building kind (orders read these).
**ProgressState** (`state.progress`): `done`, `active`, `unlocked`, `won`. **deco.removed**: tile indices where the
player removed decoration. **bonus**: meta multipliers for this run (`build`, `drill`, `capacity`, `belt`, `power`).

**Save format**: `SAVE_VERSION` in `sim/constants.ts`. IndexedDB keeps typed arrays; files encode them as base64
(`recordToText`, `textToRecord`). A save of another version is not migrated and is ignored.
Change the shape of SimState -> bump `SAVE_VERSION`. New optional fields of a part do not need a bump.

## 4. Interfaces

### Content (adding things is data)

- A building of an existing behaviour: one entry in `src/content/buildings/<category>.ts`. The validator checks what
  the behaviour needs (`NEEDS` in validate.ts). Sizes 1..6 (mega 4x4+). Sprite id is `building-<id>` (see art).
- Behaviours: core, storage, drill, pump, conveyor, junction, router, sorter, overflow, bridge, unloader,
  mass-driver, crafter, generator, solar, battery, power-node, conduit, liquid-junction, liquid-router, tank,
  liquid-bridge, mega (empty: content writes its code). A new behaviour = a `Behaviour` member + a
  `BlockBehaviour` in `src/sim/blocks/` registered in `blocks/index.ts`.
- Recipes: fixed `inputs`/`outputs` (+ `liquidIn`/`liquidOut`), `seconds`; a crafter lists recipe ids
  (`config` picks one, default the first). By-products are just more outputs (slag as `liquidOut`).
- Map data: `floors` (ore/liquid tiles, hardness), `spawns` (chance, density, radius, `nearStart`, `themes`,
  `minDistance`, `needed`), `sizes`, `mapProperties` (effects read with `mapEffect`), `themes` (palette, boulders, sound).
- Extending the schema without editing types.ts (when the field is only used in one folder): module augmentation,
  ```ts
  declare module '../../content/types' { interface BuildingDef { hotbarHint?: string } }
  ```
  and validate it in that folder's own test. A field meant for everyone belongs in `types.ts`.

### Simulation

```ts
interface BlockBehaviour {            // sim/blocks/types.ts
  accept?(w, b, item, source): boolean;   // would b take this item from source now?
  handle?(w, b, item, source): void;      // take it (only right after accept)
  update?(w, b, ctx: TickContext): void;  // once per tick while finished
  built?(w, b): void;  removed?(w, b): void;
  wantsPower?(w, b): boolean;             // consumers with nothing to do use no power
}
interface TickContext { dt; tick; events: SimEvent[]; power(b): number }   // power(b) = share of demand met (0..1)
```
- Items move only through `offer(w, from, to, item)` / `dump(w, b, item, except?)` / `dumpFrom(w, b, items)`.
  Conveyors take from the back and the sides, never from the tile they face; neighbours hand over directly.
- Power: `powerGraph(w)` (nets of members joined by touching footprints and node `links`), `powerFactor(w, b)`,
  `autoLink(w, b)` (called when any power building finishes), `addLink` / `removeLink`, `inLaserRange`.
  Units are per second; the core makes `power.make` (4 for the shard).
- Liquids: members (conduit, liquid junction/router, tank, conduit bridge, pump) form networks that pool one liquid;
  a conduit connects along its axis and takes a feed from the side of a conduit that points into it (an L-line is a
  bend, a stem into a line is a T; parallel lines stay apart: `opens` in sim/liquids.ts, drawn by render/world/pipe-shape.ts
  from the same rule, tests in sim/liquids.test.ts); machines next to a member use `drawLiquid(w, b, liquid, n)` /
  `pushLiquid(w, b, liquid, n)`; `settleLiquids` writes amounts back each tick.
- Placement: `placementProblem(w, def, x, y, ignore?)` -> `'out-of-bounds' | 'no-land' | 'ridge' | 'deep-liquid' |
  'occupied' | 'no-ore' | 'no-liquid' | 'locked' | null`. Boulders never block: building over them clears them.
- Construction: plans -> `startSite` -> `buildSite(w, site, ctx, speed)` (pays `ceil(cost * progress)` from the core
  as it rises; returns the missing material id) -> `finishSite`. Removal: `b.removing = true` -> `unbuild` -> refund.
- Tick order (`step`): commands, drones (construction), power balance, every finished building in order, liquids
  settle, progression, `tick++`.
- Commands: `place`, `place-many`, `remove`, `cancel`, `rotate`, `configure`, `link`, `clear-boulders`, `remove-deco`,
  `upgrade-core`, `salvage`, `dev-give`, plus the drone commands. Events: `site`, `built`, `removed`, `crafted`, `mined`,
  `shot`, `plan-dropped`, `core-upgraded`, `order-done`, `won`, `wreck-salvaged`. **Adding your own**: augment
  `CommandMap` / `EventMap` in your folder and call `registerCommand('your-type', handler)` from a module that is loaded
  (tick.ts imports `drones/` and `progression/`; UI-side parts import theirs where they send them).
- Extra state of a part: augment `SimState` (or `DroneState`, `ProgressState`) with an **optional** field in your
  folder and create it lazily (`state.yourThing ??= ...`). Saves carry it automatically.
- Map generation contract: `generateMap(content, {seed, size, theme}) -> {map, core}`; the core's footprint and a
  ring around it must be buildable, the start ores (copper, iron) and a power path reachable, and every ore the order
  chain needs must exist (`winnable.ts`); no `Math.random`.

### Shell, UI and rendering

- `Game`: `world`, `slot`, `enqueue(cmd)`, `onEvents(fn)`, `onReset(fn)`, `subscribe`/`getSnapshot`, `paused`,
  `setTimeScale`, `replaceWorld(world, slot)`.
- `GameServices` (ui/context.ts): `game`, `interaction`, `audio`, `preferences`, `menu` (open/close/isOpen),
  `newRun(opts, slot)`, `loadSlot(slot)`, `saveNow()`. Hooks: `useSnapshot`, `useWorldSelector(fn)`,
  `useInteraction`, `usePreferences`, `useMuted`, `useMenuOpen`.
- HUD slots (ui/hud/Hud.tsx renders them): `PaletteHud` (ui/palette), `ToolsHud` (ui/tools), `ProgressionHud`
  (ui/progression), `DronesHud` (ui/drones). Settings sections (rendered by the menu's Settings):
  `PaletteSettings`, `ToolsSettings`, `WorldSettings` (ui/world), `SoundSettings` (ui/sound). A part's own settings
  live in its own small localStorage store in its folder (guard every access, like settings/preferences.ts).
- `Interaction`: `mode` (`none | place | remove | select`), `rot`, `selected`, `hover`; `startPlacing(id)`,
  `startRemoving()`, `cancel()`, `rotate(by)`, `pipette()`; pointer API from the renderer `tap`, `hoverAt`,
  `dragStart` (true = the tool takes the drag; otherwise the camera pans), `dragEnd`; `preview()` -> ghosts to draw,
  `removeRect()`.
- `WorldView` layers (bottom -> top): sky.back, map (ground.ts), ores and liquids, belts/conduits (belts-layer), deco
  cables, depth-sorted objects (buildings, sites, ghosts, boulders, items, drones, deco props), power cables + beam
  (links), tool lines (tools-layer), sky wash/front/vignette. Depth: `footprintDepth(x, y, size)` (front-most tile).
- Sprite ids (docs/art.md applies): a building is `building-<id>`; rotated art may add `building-<id>-r0..3`;
  until it exists `art.placeholder` is drawn scaled so its body fits the footprint, else a generated block
  (`block-<id>`). Items draw `MaterialDef.icon` (a 32x32 fixed-box sprite), else a chip. Boulders are
  `ThemeDef.boulders`. Drones `drone-build-drone-0/1`. Construction is drawn by the renderer (holographic,
  bottom-up), so no stage sprites are needed.

## 5. Areas and where they live

Each area keeps to its own folders; use the extension points above for anything else.

| area | folders |
|---|---|
| content and block behaviour | `src/content/` (except themes, map, orders, meta), `src/sim/blocks/` |
| map generation | `src/sim/mapgen/`, `src/content/themes.ts`, `src/content/map.ts`, `src/render/world/ground.ts` |
| palette, hotbar, hover card | `src/ui/palette/`, `src/game/inspect/` |
| build tools | `src/game/interaction.ts`, `src/game/line.ts`, `src/game/hotkeys.ts`, `src/game/tools/`, `src/ui/tools/`, `src/render/world/tools-layer.ts`, `src/render/input.ts`, `src/render/camera.ts`, `src/render/camera-motion.ts` |
| drones | `src/sim/drones/`, `src/render/world/drones-layer.ts`, `src/ui/drones/` |
| progression (orders, story, meta tree, menus, slots, victory, loading screen) | `src/sim/progression/`, `src/content/orders.ts`, `src/content/meta.ts`, `src/ui/progression/`, `src/ui/App.tsx`, `src/save/` |
| autopilot | `src/sim/bot*.ts`, `src/game/autopilot*.ts` |
| tutorial | `src/tutorial/` |
| art kit and pipeline | `art3d/kit/`, `scripts/art.mjs`, `src/render/iso.ts`, `src/render/art-manifest.ts`, `docs/art.md` |
| 3D models | `art3d/<category>/` and `public/art/<category>/` |
| world rendering (belts, liquids, cables, work loops, construction, deco, light) | `src/render/world/` (except the files named above), `src/render/deco/`, `src/render/{sky,bake,pack,sprite-pool,particles}.ts`, `src/render/art/`, `src/ui/world/` |
| sound | `src/audio/`, `src/ui/sound/`, `scripts/listen.mjs`, `docs/audio/` |
| shell and glue | `src/main.tsx`, `src/game/{game,snapshot,demo,perf}.ts`, `src/ui/{context.ts,format.ts}`, `src/ui/hud/`, `src/ui/components/`, `src/ui/styles/`, `src/sim/*.ts` (top level), `index.html`, `package.json`, configs, shell scripts |

Notes:
- **Content:** some ids are used by tests and the demo checkpoint (`copper-ore`, `iron-ore`, `iron-bar`,
  `mechanical-drill`, `conveyor`, `smelter`, `wire-mill`, `core-shard`, `container`); rename them together with
  `sim.test.ts` and `game/demo.ts`. New icon ids are owned by the icons category automatically
  (`art3d/kit/ownership.ts` reads `MaterialDef.icon`).
- **Drones:** `stepDrones` is called by tick.ts; keep `nextJob` semantics (sites, removals, ghosts). Up to 5 drones in total.
- **Progression:** rate goals, radio lines, tutorial highlights (`OrderDef.tutorial`), victory, the meta tree saved
  across rounds (its own IndexedDB key in `src/save/`), the loading screen.
- **Art:** the kit renders every category in all three views; see `docs/art.md`.

## 6. Cross-cutting behaviour

What spans several areas, so later work builds on it:
- **Replacing instead of tearing down** (sim/placement.ts `replaceable`, construction.ts `startSite`): conveyors and
  conduits never block a plan. A belt over a belt of another tier (or a pipe over a pipe) is swapped in place and
  keeps its items or liquid; the same kind only turns. Anything bigger removes the belts and pipes under it when its
  site starts (cost and items back to the core). `removeNow` also refunds the items riding on a belt.
- **Side items** (blocks/conveyor.ts): an item from a side lands at the middle of a straight belt once the rearmost item is 0.7
  along, but never closer than a gap to it (so up to 0.17 tile before the middle); `shownPos` draws it at the middle until the
  sim position catches up, so it never jumps back along the edge. On screen a full belt's items only just touch:
  `ITEM_PITCH` (belts-layer.ts) is the sprite width per screen distance of two neighbours; raise it for bigger, overlapping items.
- **Belt jams** (blocks/conveyor.ts `frontLimit`): the front item stops one gap before the last item of the belt
  ahead, so a jam closes up evenly across tile seams; tests in sim/replace.test.ts.
- **Unlocks**: `placementProblem` returns `'locked'` unless `isUnlocked` (progression/meta.ts). **Wrecks**
  (sim/wrecks.ts): a plain click on a wreck's 7x7 hull sends `salvage`; it unlocks the wreck's building for the run,
  gives 60 scrap and emits `wreck-salvaged` (toast).
- **Orders** have a fourth goal kind `make` (n made in the run). The Space Elevator chapter follows the staged
  building: build it, then 1, 2, 3 `elevator-segment`s made (foundation, tower, crown).
- **Art in the world**: a busy machine plays its work loop, `building-<id>-wb` (the still base) with the overlays
  `-w0..` on top at the rate in the sprite's meta (12 frames per second); a staged mega building shows `-s1..-s3` until it
  is finished. Both bake on first use (`LazySprites`), never up front, because they would blow the texel budget.
- **Views**: `?view=iso|steep|top`; `startZoom` keeps the same ground area in every view; min zoom 0.1. The sky's
  horizon band is drawn behind the world.
- **Commands registered outside tick.ts**: main.tsx imports `sim/drones` (drone commands); headless code must too.
- **Audio**: `sound.watch` gets the on-screen machines from the camera; interaction.ts emits the ghost and belt cues.
- **Deco**: `probes.decoAt` and a hover-card inspector are wired in main.tsx (`wireDeco`).
- **Checks**: `npm run smoke` (menu -> Quick Round, the checkpoint through the drone, a smelter over belts, all
  three views and the stress scene boot without console errors).

## 7. Known gaps

The map paint at a new round is synchronous (`paintMapAsync` exists in ground.ts but is not wired to the loading bar);
`src/legacy` and the first design's `production` art category are still there for the art kit; items inside junctions,
routers and bridges are not drawn; undo of a building placed over belts does not bring the belts back. The broader list
is in `docs/ROADMAP.md`.
