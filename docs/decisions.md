# Decisions

Why things are the way they are, grouped by area. Each entry says what was decided and why. Decisions that belonged
to an earlier game design that no longer exists are not listed. Where code and this file disagree, the code wins.

## Stack and tooling

- **TypeScript is pinned to ~6.0.3.** typescript-eslint 8.73 supports only TypeScript below 6.1; TypeScript 7 would break lint.
- **Vite 8, Vitest 5, ESLint 10, React 19.3, PixiJS 8.23** (latest at build time). Fresh project, nothing legacy to carry.
- **Two tsconfigs:** `tsconfig.json` (app and art kit, with DOM) and `tsconfig.node.json` (scripts and the Vite config, no DOM).
  The headless simulation CLIs prove that `src/sim` needs no DOM.
- **Screenshots and smoke tests use Playwright's Chromium with SwiftShader.** It works headless without a GPU and is
  deterministic. Performance is measured separately on a real GPU (`npm run perf`, ANGLE on Vulkan).
- **`?dev&manual` stops the real-time loop** and exposes `groundbreak.step(frames)` on a virtual clock; renderer effects read the
  frame clock, never `performance.now`. Frame-exact capture, and screenshots are fast when nothing renders in between.
- **Committed screenshots are 256-colour palette PNGs** (about a fifth of the size), and only a small curated set is kept.
- **A clean clone passes** `npm ci`, lint, typecheck, test:run and build in well under a minute. npm prints an allowScripts note for
  esbuild's postinstall; it does not break the build, the tests or `tsx`.

## Simulation

- **Fixed tick of 20 Hz, mulberry32 RNG with its uint32 state inside the game state.** One number to save, replays stay exact.
- **Commands are applied at the start of the next tick; events are returned from `step()` and are not state.** Determinism and
  a clean hook for renderer and audio.
- **A frame counts as at most 250 ms of game time.** No catch-up burst after a background tab; there is no offline progress.
- **Buildings are plain records, hot data is typed.** Map layers are `Uint8Array`, tile occupancy `Int32Array`, belt items a
  structure of arrays with integer positions 0..1000. 3,000 buildings with 7,200 to 10,000 items cost about 0.5 ms per tick
  (`npm run bench`), so a full ECS was not needed.
- **Item hand-off follows Mindustry:** the giver asks `accept`, then `handle`; conveyors take from the back and the sides only;
  neighbours hand over directly; containers that touch the core dock into one shared stock.
- **Power networks join touching footprints and node lasers; liquids pool per network.** Conduits connect only along their
  axis so that parallel lines stay apart. Both graphs are rebuilt only on layout changes.
- **Construction pays `ceil(cost * progress)` from the core while the site rises.** No up-front cost and no progress bar; a site
  short of materials is retried after 2 s while the drone builds other ghosts.
- **The core takes every item.** What does not fit is burned and still counts as delivered (as in Mindustry). Otherwise a capped
  item stops every shared belt into the core, and a deliver order whose item sits at the cap could never move.
- **One core per run.** A core stage is never a ghost: placing the next stage starts the upgrade in place, every other stage is
  `locked` in `placementProblem`. The palette lists only the next stage.
- **Parts of the codebase get disjoint files.** Augmentable `CommandMap` / `EventMap` with `registerCommand`, HUD slot
  components with one stylesheet per part, `useWorldSelector`, and module augmentation for schema and state
  (docs/architecture.md).
- **Placeholder art:** a building draws `building-<id>` when its art exists, else its `art.placeholder` scaled to fit the
  footprint, else a generated block.

## Saves

- **Three IndexedDB slots, versioned with `SAVE_VERSION`, no migration.** A save of another version is ignored: its slot shows as empty.
- **Autosave is calm:** every 90 s (only if the run moved on, in an idle callback), after orders at most every 30 s; tab hide and
  `pagehide` still save at once. Each save structured-clones the whole state on the main thread, so it must not be frequent.
- **A running round always saves,** also with `?seed`. The running slot always shows "Resume", and "Quick Round" never
  overwrites the running round.
- **Per-device preferences live in localStorage;** a save file moves a run to another device, the volumes stay with the device.

## Content and balance

- **Content is data.** A building of an existing behaviour is one entry; code switches on `behaviour`, never on an id. The
  validator checks what each behaviour needs.
- **Fixed recipes, no ratio mixer.** A crafter lists the recipes it can run and the player picks one in a setting panel.
- **Rounds target about an hour.** Measured with the autopilot on medium maps (minutes to the win, before and after a balance
  pass): 197 to 70, 237 to 65, 190 to 58, no win to 60, 145 to 76 on a large map and no win to 78 on a small one. A capable
  human is estimated at 60 to 80 minutes; that is an estimate, not a measurement.
- **Faster drills:** mechanical 2.4 to 1.6 s per item (37 per minute on four ore tiles), pneumatic 1.7 to 1.2, electric 0.7 to
  0.55, laser 0.4 to 0.3, salvage 1.1 to 0.8; 400 copper at the start (was 300). After seven minutes there were 355 copper and
  only 5x speed was fun. Doubling the rate filled shared belts so fast that side merges starved; +50 % keeps the first ten
  minutes at an order every one to two minutes.
- **Steel and silicon come two per craft** (cast steel: 2 bars + 1 graphite give 2 steel in 2.4 s; silicon: 2 sand + 1 coal or
  graphite give 2 in 2 to 2.5 s). They are in nearly every mid-game price and were the bottleneck of every slow run.
- **Faster middle and late machines, and about a third of the late costs.** The elevator alone used to take about an hour;
  from the first stage to the crown it now takes 11 to 31 minutes, a big finale but not the whole round. Order amounts are
  lower too: a deliver order is a lesson, not a grind.
- **42 orders, one new building or idea each** (sorter, bridge pair, solar panels, batteries, mechanical pump, mass driver pair,
  oil generator, tungsten carbide, coolant mixer ...), all build or deliver goals on things the round needs anyway. The
  autopilot uses 35 to 38 building kinds in a won round, up from 32 to 33.
- **"Titanium" counts mined ore (`make`), not delivered ore.** A run that rolls plates at the patch never delivers any, and the
  bot sat 40 minutes on the order.
- **Solar panel 1 unit for 8 copper wire + 4 iron bars; the unloader costs 20 copper + 10 iron bars; battery cells from tin
  need no lithium.** Solar used to be a forced order that paid nothing and needed silicon before the silicon chapter. The
  tutorial puts a wire mill against the core, which hands nothing to neighbours, so the unloader has to be affordable then.
  A map with tin but no lead and no lithium could not make cells.
- **The first helper drone costs 30 steel, 15 circuits and 40 iron bars (no motors), the second 50 steel, 25 circuits, 8 motors
  and 6 frames.** In an hour-long round one drone could not keep the drone-fed machines going, and motors needed steel that
  needed the drone.
- **Every map is winnable.** Spawns carry `needed` groups (titanium, tungsten, lead or tin, the world ore); a map that did not
  roll one, or rolled a patch under 16 tiles, gets one more of middle size, far out if need be. `sim/mapgen/winnable.ts` grows
  everything a map can give and lists what the orders ask for that it cannot; `winnable.test.ts` checks 30 seeds per size across
  the worlds. Before this only 9 of 30 small, 21 of 30 medium and 16 of 30 large maps had what the chain needs.
- **Obstacle density 0.74 to 0.5, loot raised about 1.45x** so that the loot total stays roughly equal. The field was far too packed.
- **Smelters say what happens to slag:** each ingot leaves 1 unit of slag (was 2), a conduit can carry it to a slag separator, else
  it vents away. The text used to say "a little slag" for more slag than bars and never said it vents.

## Build experience

- **Ghosts, then a drone.** Every placement is a ghost that the drone turns into a site and welds up. The drone glides to a
  stand point one tile from its piece (2.7 for a 3x3) and works as soon as the piece is in reach; stopping at the edge of the
  9-tile range made every belt of a long line cost 0.35 to 0.45 s with idle ticks between.
- **Quick pieces (belts, pipes, junctions, routers, sorters, bridges, power nodes) are built only from 0.3 x range,** so the
  drone has to glide along a dragged line. It grows at the drone's flight speed (about 9 pieces per second) in the order it
  was drawn, like Mindustry's caterpillar, instead of a burst from one spot followed by a pause. Their build times are one to
  three ticks and a ghost becomes a site and is worked on in the same tick; a quick piece short of material is retried
  after 8 ticks and the line goes on as soon as the core has the copper again.
- **Placement and drags:** the building stays in hand while Shift is held or the "keep tool" setting is on, and Shift plus a drag
  fills a rectangle. Keys 1-9 pick from the palette or the hotbar and the same key puts it back; X demolishes by rectangle and
  Delete or Backspace removes what is under the mouse. Ctrl+digit stays the browser's tab switch.
- **Even sizes (2x2, 4x4, 6x6) sit centred on the tile corner under the pointer,** so a building lands exactly where the
  tutorial ring is.
- **A single belt turns so that it continues or feeds the line beside it;** pressing R makes the player's direction final. A belt
  pointing east used to push against a drill ("output blocked").
- **Belts and pipes give way:** a plan may cover conveyors and conduits. A belt over a belt of another tier is swapped in place
  and keeps its items; anything bigger removes the belts under it when its site starts (cost and items come back).
- **Right click with no tool takes away what is under the pointer:** a queued ghost is cancelled, a building demolished (never
  the core; Ctrl+Z brings it back), else the boulder or decoration. With a tool in hand it only lets go of the tool.
- **The hover tile is computed again when the camera moves or the tool changes while the mouse stands still,** so the card never
  describes what used to be under the pointer after a tutorial pan or a WASD move.
- **Area tools are screen-aligned rectangles in the oblique view** (demolish, copy, fill and the right-drag sweep): the
  rectangle between the two pointer positions in world px, a tile counts when its centre lies in it. Steep and top-down keep
  the box of tiles, which already is the screen rectangle. The sim still gets box commands: a screen rectangle demolishes by one
  single-tile `remove` per covered building, so costs and refunds match taking the buildings one by one.
- **A picking pass finds the frontmost building with a visible pixel under the pointer,** falling back to the frontmost sprite
  box. The core's tall box used to swallow taps on buildings beside it. The box reaches at least to the footprint's back edge,
  because in top-down a flat pad's sprite top lies below its far half.
- **Camera glides end when the player pans or zooms** and at the pan bounds. WASD and arrows drive a camera velocity with
  exponential easing (`render/camera-motion.ts`); every key repeat used to jump 48 px with a stall in between.
- **A setting panel opens beside the building** (`src/ui/config`) when a factory has several recipes, a sorter or an unloader.
  A recipe change only changes `config`: items already inside stay and wait, and the panel says so. Without it the sim only ever
  ran recipe 0 for a human, and a round could not be won from the middle on. Q (pipette) carries the setting along.
- **Pause lets building go on;** P or Space toggles it and a badge shows it. H or Home brings the camera back to the core.

## Rendering and look

- **The world draws 2D sprites from atlases; the art is pre-rendered low-poly 3D.** Three.js models in code (`art3d/`) are
  rendered offline in headless Chromium (`npm run art`) into images with a manifest per category. Real light on low-poly shapes
  gives a polished, glossy look that flat SVG solids cannot fake, and offline rendering keeps the runtime cheap.
- **One light rig for every model:** warm key from the screen's left (shadows right and a little up), cool sky light sampled from
  a different direction per pass (averaged: ambient occlusion and soft contact shadows), pink-orange rim from the horizon,
  faint fill, a procedural dusk sky for reflections; 32 jittered passes in float, Khronos PBR Neutral tone mapping. Neutral
  tone mapping keeps the palette's colours true.
- **The 3D camera is derived from `src/render/iso.ts`** (30 degrees, 64 px per half tile, 78.38 px per unit of height). One model
  unit is one tile, so a rendered tile diamond lands exactly on the game's tile.
- **Sprites are baked at screen resolution for the closest zoom** (`bakeScaleFor` = resolution x 2.5, at most 5) within a 24 M texel
  budget for the start set (`planScale`; a 2x screen gets about 4.6). Construction stages and upgrade scaffolds bake on first use,
  and each sprite is trimmed on a 1x draft first, so no full sprite box is ever allocated at a high scale. Fixed 2x bakes looked
  pixelated: zoom and HiDPI stretched them up to 2.5x. Baked sprites are trimmed to their visible pixels.
- **The runtime prefers a manifest image per sprite id and keeps the SVG for every other id;** a model's meta (lights, hatch, goods,
  vents, wire, glints, top) overrides the SVG meta key by key. Artists can fill categories one by one while the game keeps working.
- **Art categories** (`art3d/<category>/` and `public/art/<category>/`, each with its own `manifest.json`) are owned in code
  (`art3d/kit/ownership.ts`, derived from content), and a test checks that every baked sprite has exactly one owner.
- **Atlas pages are drawn only after their Pixi `CanvasSource` exists.** With a fractional bake scale Pixi computed a height of
  3642.9999 px and resized the canvas, which wipes it: on a 2x screen whole pages (the base, the sky planet, the fog) were blank.
- **Three camera views** (oblique 30 degrees, steep 50, top-down 90) with a pre-rendered sprite set each. Switching saves and
  reloads the page instead of rebuilding in place, so every cached view (belts, lanes, ground) rebuilds cleanly and few shared
  files are touched. The cost is a lot more image data in the repository; a player downloads only one set.
- **Work animations are overlays on a still work base** (`art3d/kit/loop.ts`): `building-<id>-wb` is the machine without its
  moving parts and `-w0..w11` carry only the pixels that change, so pad, housing and silhouette cannot move. Whole-picture
  frames rattled whenever anything in the picture differed, and 12 of them per view would have tripled the art (an overlay is
  15 to 30 % of a frame). Moving parts are detected by comparing the frames' meshes, not marked by hand. Loops run at 12 frames
  per second, 12 frames per loop; they are rendered with `--gpu` because SwiftShader took 10 to 40 s per sprite.
- **Which buildings play their loop:** steering pieces (junction, router, sorter, overflow gate, unloader) while items pass
  (a render-side traffic fingerprint held for 1.5 s), the core, power nodes and powered mass drivers always, batteries while more
  than half charged, the rest while they work. A loop that blinks on and off with every item would read as flicker.
- **Nothing may float:** structures stand on bolted foot plates on the ground, with a contact shadow.
- **Power links are cables:** a dark sheath with a soft sheen, hanging from attach points with a sag of 6 px plus 5 % of the
  length (none from straight above), clamps at both ends, a thin shadow on the ground, a faint warm pulse only while the network
  has energy, and a lit core (coral without energy) while a building or blueprint is in hand. Only a spanning forest is drawn.
- **One work beam for every drone and job** (`render/world/build-beam.ts`): it starts at the weld torch, tapers from a hairline to a
  soft additive glow with light pulses, lands in a glowing spot with a few sparks, and lingers 0.22 s between two pieces. The old
  beam flickered at 22 Hz and lay along the belts for nine tiles.
- **Ore fields are 3D:** 64 pre-rendered tile sprites (16 ores x 4 variants, three views, 4 px per world px, 5.2 MB) in their own
  flat layer under belts, drawn from a pool that refills only when the view leaves the covered tiles, the layout changes or a
  bake lands. The painted ground keeps a soft ore tint for the far-out view. The style switch `ORE_STYLE` has three values
  (`flat`, `crystal`, `mixed`); `mixed` (chunks plus a few crystals) is the one in the game (docs/screenshots/ore-styles.png).
- **Wrecks are the nature category's 3D wreck** (scaled 2.1 to the 7x7 hull, two pieces of debris, its glow breathing until
  salvaged); the ground keeps only a soft round scorch.
- **Liquids are their own layer** (`render/world/water.ts`): 20 texels per tile in 16x16-tile chunks that hold liquid, a blurred
  signed distance field for a round shore, a wet band on the land, a surf line, oil with a rainbow rim, slag with glowing cracks.
  The ground stays at 12 texels (a 272-tile map is 3264 px, near the 4096 texture limit).
- **Ridges read as rock:** a cliff-sided 3D rock block per ridge tile, tinted with the theme's `ridgeLit`, plus a stronger painted
  ridge for the far-out view. Single ridge tiles had looked like shadows.
- **Decoration is planned from the layout and never state** (`src/render/deco/`): cables, junction boxes and props from a seeded
  router (spanning tree up to 9 tiles + 25 % short extra links, turns cost, bundling is cheap), redrawn only on layout, level
  or fog changes (2 to 4 ms per rebuild).
  - Cables never cross a belt, a pipe or a footprint: occupied tiles are walls to the router, so a cable goes around or the link
    is left out. Measured on 6 bases with 60 buildings: 10 cable points on belts before, 0 after.
  - Queued ghosts are walls to the deco from the moment they are queued, so a prop under a ghost line steps aside at once.
  - Amount: every building of size 2+ is dressed for sure (an anchor on its best-scoring free ring tile: 1 prop from 2x2, 4 from
    3x3, 6 from 5x5), props are 2.5 % of the ring tiles, a small service box sits on a third of the cable ends. An early base went
    from 2.5 props and 2.5 boxes to 7.8 and 7.7. Doubling would still have read as nothing.
  - Deco is picked by what is drawn: every piece carries the body box of its sprite (manifest `body`), the front-most box under
    the pointer wins. With a tool in hand deco is never picked. A removed piece is kept in `deco.removed` (saved with the run).
- **The horizon band is drawn behind the world** and shows only past the map's edge.
- **Performance, measured** (`npm run perf`, production build, stress scene of 500 drones and 2,000 items on 672 belts, 459
  obstacles, 1440x900, zoom 0.5, GTX 1660-class GPU): oblique 67.7 fps (14.4 ms per frame, p95 16.1); top-down 106 fps (9.1 ms).
  Under 4x CPU throttle the oblique view reaches 17 fps, so a weak laptop does not hold 60 fps with the 3D sprites; Pixi's own
  sprite collect is the cost, not the simulation at 0.1 ms. A building's picture is chosen before its sprite is taken from the
  pool, so each sprite gets one texture per frame (600 working machines cost about 4 ms when set twice).
  Drone under-lights are one additive layer, off-screen and parked drones are hidden, and the stats memo key is a number.
- **Ore fields are clusters, not tiles:** up to three small clusters per tile at hashed spots, denser in the middle and
  smaller at a ragged rim; far out (below zoom 0.55) one bigger cluster per tile keeps the sprite count down.
- **Rock ridges are one massif:** top sheets with equal rim height overlap by 0.025 tile, only open east and south edges get
  a cliff, boulders cross tile borders. No seams, no inner side walls.
- **Items show inside logistics blocks:** an item glides through a junction in the sim's own delay, waits in the middle of
  a router or sorter and arcs over a bridge span (`hub-items.ts`, a pure function of sim state and clock).

## UI

- **Manrope Variable (bundled via @fontsource) for all UI text.** Friendly, technical, has tabular figures; no external font requests.
- **The HUD is glass over the world.** HUD controls are one height (`--hud-control`, 48 px) and every hit area is at least 44 px
  (`--hit-min`); `npm run smoke` checks it on a phone in both orientations.
- **Tooltips, panels and buttons share one motion kit:** panels slide in and out (`Presence`), buttons press in, numbers count
  up, tooltips use the game look (`data-tip`) instead of the browser's grey.
- **Reduced motion is a preference over the system setting:** the renderer holds still at runtime (`setStill`) and
  `html[data-motion]` switches the CSS fallback either way. Rolling counters and tree scrolling read the in-game choice
  (`ui/motion.ts`), not the media query.
- **An open panel shifts the view centre into the visible part** (`camera.offsetX/Y`, eased) and lifts the horizon band with it;
  without it a portrait sheet covers the base.
- **Panel sub-tabs wrap onto a second row** instead of a clipped, fade-masked scroll row.
- **Game speeds 1x, 2x, 3x, 5x and 10x in the HUD;** `.` and `,` step through them and stop at the ends (a click wraps round).
- **Quick Round asks before it replaces a save slot,** there is a single "Resume", and Esc closes the menu.
- **Phones keep the map:** on both phone formats more than half the screen stays map, every control is a 44 px thumb
  target and no two cards overlap (`hud-stack.css`); windows are sheets from below (portrait) or the right (landscape).
- **Touch can remove decoration:** a tap shows a card with Remove, a long press removes at once.
- **A hotbar slot keeps a recipe:** a machine picked with Q (with its recipe or item) and dropped on a slot keeps that
  setting; the slot shows a small icon of it.

## Audio

- **Everything is synthesized** (WebAudio, no samples), in three channels the player sets apart (music, effects, ambience;
  sliders map squared to gain). Each has a fader into one low cut (2 x 45 Hz high-pass), a soft compressor and the master.
  Music and effects send into a synthesized room reverb. Nothing under 45 Hz reaches laptop or phone speakers; it only
  muddied the mix and ate headroom.
- **Three build tracks that crossfade** (docs/audio/README.md), generated from data (`audio/tracks.ts`) by a pure, seeded
  composer, so no stretch of music repeats exactly and a new session sounds different.
- **The music is a look-ahead scheduler on the audio clock** (0.8 s ahead, checked every 120 ms) and schedules nothing while muted,
  at zero volume or hidden. Exact timing whatever the frame rate, and no wasted nodes.
- **Machine ambience follows the camera** (`audio/machines.ts`): buildings name their sound in data, each layer fades with the
  number on screen and the zoom, and thumps fall on the music's beat so the base grooves with the score.
- **World sounds are heard where the camera is:** drone work, batches and crates fade with their distance from the screen; the
  player's own actions are always full.
- **Interface sounds come from one capture listener on the HUD root** that reads each control's role (tabs, toggles, the
  primary action, disabled controls, sliders ticking at a pitch that follows the value); `data-sound` overrides it. No component
  needs audio code, and every new button sounds right.
- **Levels are measured, not guessed** (`npm run listen`, OfflineAudioContext in Chromium). A first draft had a mix dominated
  by sub-bass; the measured numbers fixed it.

## Autopilot

- **The bot plays with the player's commands** and plans in a Web Worker (`src/game/autopilot-worker.ts`); the main thread sends
  a packed snapshot (buildings as one transferred `Float64Array`, no belts, the map once per world) every 10 game ticks and
  enqueues the commands that come back. A bot look took 0.3 to 4 s on the main thread (belt A*), which was a stutter every 5 s.
  With the worker, early and late bases have no long task. The snapshot costs about 1 ms at 700 buildings and under 4 ms at 3,000.
- **Stations fall back to drone supply:** the bot marks them (`drone-supply`, the player's command), most urgent first, unmarks a
  machine above twice its mark and sorts the marks by urgency every 30 s. Drone supply is first-come in mark order; without the
  sorting one printer turned all steel into 300 motors.
- **Production chains away from the crowded hub:** an ore line into a small crafter touching the main one, or straight into the
  next machine; the rest by drone top-up. Early versions needed a lane from a new unloader on the core's ring, and the ring
  was full of incoming belts by minute 15.
- **Valves:** a crafter whose product reaches 95 % of the core's cap switches to an idle recipe and comes back under 60 %. Nothing
  can burn surplus, and a capped item on a shared belt stops everything else on it. It never pauses a crafter that feeds
  another crafter.
- **Steps that serve a story order hold what they need;** other steps only set aside what they lack. A step that was too dear is
  planned again only once its last price is free; at most three steps are planned per look; failing steps back off 20 s, 40 s
  ... 5 min.
- **A watchdog** wakes every resting step after four game minutes without progress, opens the hub zone to all planners and
  widens station searches. It turns "no room" into another try; it cannot make missing ore appear.
- **Mega stages pull their missing inputs,** and get drone supply for a stage only once the core holds the whole stage (the
  crown used to take every star alloy as it arrived, none was left for the singularities).
- **It builds what a running build order asks for** (sorter, bridges, pump, batteries, mass drivers), lays a direct line for an
  ore a delivery order waits on, lays far ore lines as soon as steel is cast, pauses crafters at half the core's cap, plans power
  only from networks that make power, and asks for late helpers only after the accelerator.
- **`npm run test:bot`** asks for a win of seed 1 within 90 game minutes with no stall over 20 minutes (it wins at 70, longest
  stall 11). `npm run autopilot` prints the kinds of building each round used.

## Tutorial

- **While the guide runs it is the one instruction:** `html[data-tutorial]` shrinks the order card to its header and silences the
  radio, so beginners do not have to guess between two guides with different goals.
- **Layers:** ground rings lie under the HUD, so cards and tooltips cover them; a HUD ring is portalled into `.hud`.
- **A step's ring is gone while the drone holds its ghost** (the card says "Ghost placed"), and the recommended patch skips tiles a
  ghost claims; the ring used to hop to the neighbour tile the moment the drill was placed.
- **Steps look at the world, not at what the guide taught:** "Build a smelter" is done by any finished smelter and "Drill for
  iron" by any drill on iron, because the autopilot and experienced players build their own way.
- **Help instead of silence:** a belt that cannot work is found by walking it from its source: it ends beside the core without
  facing it, stops in the open, runs into a building that takes nothing or into a belt that faces it, does not touch the
  source, or points at it. The guide waits 4 s of game time before speaking, then puts the ring on the one piece.
- **Step 7 "Feed the mill":** the core hands nothing to its neighbours, so an unloader on a tile that touches both the core and
  the mill takes copper out. It is done by the first wire that reaches the core, so any way of feeding the mill counts.
- **Off-screen marks sit on the screen edge and step around HUD pieces,** and the camera puts a spot in the free part of the
  screen; on a phone on its side the screen's middle is under the card.
- **An unloader without a setting used to write its queue at index 1 of an empty array;** `trafficOf` in `work-fx.ts` then read
  `undefined` and threw in every frame, which froze the world picture. Fixed there; the sim keeps the sparse queue.
