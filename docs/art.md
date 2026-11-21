# Tetherline art: pre-rendered low-poly 3D

The game looks like real low-poly 3D with soft light, glossy high-tech surfaces and glowing crystals, but the world
still draws **2D sprites from atlases**, so runtime cost stays low. The 3D is rendered **offline** into
high-resolution WebP images (lossy quality 88, alpha kept; one file per sprite and view). Every model is built in
code with three.js: no external assets, no AI images, no stock.

Read this file before you model anything. It describes the bar, the rules and the map of the categories.

## The pipeline

```
art3d/kit/            the shared kit (palette, light rig, camera, shapes, renderer)
art3d/<category>/     the models of one category, index.ts registers them
        │  npm run art -- --only <category>   (headless Chromium + WebGL, no server, no port)
        ▼
public/art/<category>/<id>.webp + manifest.json       (iso; steep/ and top/ hold the other two views; written atomically)
        │  at boot: src/render/art-manifest.ts merges the category manifests
        ▼
src/render/bake.ts    a sprite id with an image is baked from it, every other id keeps its SVG art
src/ui/components/GameIcon.tsx   <GameIcon id="icon-iron-ore" size={24} fallback={...}/> for the UI
```

- `npm run art` renders every category; `--only nature` (or `--only base,units`) one or a few.
- `--ids a,b` renders only those ids and merges them into the category's existing manifest (fast iteration).
- `--samples 8` drafts fast (default 32 samples: anti-aliasing, soft shadows, sky occlusion).
- `--sheet <png> [--sheet-zoom 2]` writes a contact sheet: each sprite on ground colour over its tile diamond.
- `--list` prints every id the category owns and whether it has a model (`model`), a glow from a model (`glow`) or
  still uses its SVG (`svg`).
- `--view iso|steep|top` renders one view only (default: all three).
- `--gpu` uses the real GPU (ANGLE/Vulkan) instead of SwiftShader: faster, not bit-exact. The default is SwiftShader
  (works headless everywhere, same result on every machine).
- `--out <dir>` writes to `<dir>/<category>/` instead of `public/art/`, and `--define NAME=value` sets a global
  `__NAME__` the models can read: previews of a variant without touching the game's art.
- **Parallel-safe:** several categories can be rendered at the same time. Each run bundles in memory, loads the page with
  `page.setContent`, writes only `public/art/<its category>/`, and replaces files via a per-process temp name. A full
  category run deletes images of that category that no model produces any more; an `--ids` run never deletes.
- Speed: a 1x1 building at 32 samples takes 2 to 4 s in SwiftShader, a 2x2 core about 10 s. When several renders share
  the CPU, iterate with `--ids` and `--samples 8` and render the full category at the end.
- Every category keeps its `manifest.json` committed, even when empty: the game loads all of them at boot, and a missing
  file would be a 404 in the console (the smoke test fails on console errors).
- Commit the images and the manifest together with the model source. Never edit them by hand. Do not commit a second
  copy of an image set (a full category run deletes the old files and half-size copies of its sets).

## Three camera angles (three sprite sets)

The settings offer a camera view (`src/settings/preferences.ts`, `VIEW_MODES` in `src/render/iso.ts`):

| view | camera | tile on screen | sprite set |
|---|---|---|---|
| `iso` (default, "Oblique") | 2:1 isometric, 30 degrees, from +X+Z | diamond 128 x 64 | `public/art/<category>/` |
| `steep` | looks north from +Z, **50 degrees** above the horizon | 96 x 73.5, a height unit is 61.7 px | `.../steep/` |
| `top` ("Top-down") | straight down, **90 degrees** (plan view like Mindustry) | 96 x 96, a height adds no offset | `.../top/` |

`npm run art` renders every world sprite three times and writes one manifest per set (`"view": "steep" | "top"`).
Fixed-box sprites (icons, particles, sky) are screen things: iso only; in the steep and top views the game lays that
view's set over the iso set id by id (`art-manifest.ts`, `artSubdir`).

- Cameras (`art3d/kit/iso.ts`): the same model space and the same `k.*` marks in every view; the meta is projected per
  view. The light rig turns with the view (`viewYaw`) so the key still comes from the screen's left. The top camera
  uses -Z as screen-up (straight down has no horizon). `meta.top` in the top view uses a stand-in lift (`topPx`), since
  a height has no screen offset there.
- Runtime: `src/render/iso.ts` holds the projection (`setViewMode`, once at boot; `?view=iso|steep|top` for screenshots).
  All tile <-> screen maths goes through it (`gridToWorld`, `worldX/worldY`, `depthOf`, `footprintExtent`,
  `groundEllipse`, `heightScale()` for heights given in iso px: 1, 0.78, 0). `isTopDown()` is true for steep and top.
  Switching the view saves, fades out and reloads the page as the same run.
- Design for the plan view: in `top` only the roof and the shadow show, so every building needs a readable roof
  (panel lines, rings, lamps), not just a good side.

## Buildings (square bases, open ports)

A building is `building-<content id>`; its owner is the art category of its palette category
(`art3d/kit/ownership.ts`). Helpers in `art3d/kit/v2.ts`: `model`, `rotating`, `bends`, `slab`, `sector`, `chevron`,
`heading`, `sizeOf`.

- **Square slab, whole footprint.** Every building stands on a slab (`slab(w, d, h, MAT.panel)`) that fills the
  footprint exactly, so neighbours touch without a gap. Belts and conduits are low (slab 0.045, rails 0.088); machines
  have a deck 0.05 to 0.07 and keep their rim low where ports are (see "Ports" below).
- **Open ports.** Anything that carries items or liquid is open at the middle of its edges: lanes and pipes run to the
  edge, ends are closed by a collar that meets the next tile's collar.
- **Rotation ids.** Pieces with a heading add `-r0..3` (0 = +x, 1 = +y (screen lower left), 2 = -x, 3 = -y, the sim's `rot`)
  and the plain id is rot 0. Belts and conduits that bend add `-curve-l-r0..3` and `-curve-r-r0..3`: the piece leaves
  through its front, and is fed from the left or the right side (seen along the heading). Nothing is mirrored.
- **Core family.** `core-shard`, `core-foundation`, `core-nucleus` (sizes from the content) are one design that grows in
  place: reactor drum with a window band (stage 1), a second tier, solar modules and a dish (stage 2), gold crown, four
  pylons, spire and floating ring (stage 3). `container` and `vault` dock to it.
- **Belt look.** Straight belt: rubber lane between two rails, chevrons; fast belt: orange rails, glowing orange chevrons.
  The game draws its own animated belts (`render/world/belt-art.ts`); these sprites are for palette icons, ghosts and
  overviews.

## Model space, scale, camera

- three.js is Y-up. **+X is grid x** (towards the screen's lower right), **+Z is grid y** (towards the screen's
  lower left), **+Y is up**. The camera looks from +X+Z, 30 degrees down: faces pointing +X and +Z are the ones you see.
- **One unit = one tile edge.** A 1x1 building fits in x, z within -0.46..0.46; a 2x2 one within -0.96..0.96.
- The origin is the sprite's **anchor**: the tile centre (boulders, 1x1 buildings) or the footprint centre
  (bigger buildings). Build the model around it, standing on y = 0.
- Height: one unit up is 78.4 world px on screen. `px(156)` converts SVG heights (world px) to units.
- The camera in `kit/iso.ts` is derived from `src/render/iso.ts` (TILE_W 128, TILE_H 64): a rendered tile diamond
  lands exactly on the game's tile. Never build your own camera.
- Scale reference: the core shard about 2 tall including its mast, a drill 0.9 to 1.3, a crystal cluster up to 1.1,
  a boulder 0.5 to 0.9, a drone about 0.35 across.
- Output: world sprites at **5 px per world px** (crisp at the closest zoom, 2.5, on a 2x screen); icons at 8. WebP is about
  5 to 10 times smaller than PNG. The game bakes them down to what the screen needs (`bakeScaleFor`, within a texel
  budget), so the image size is not GPU memory.

## The look

- **Smooth and glossy, never comic.** No outlines, no black strokes, no flat cel shading. Every hard edge gets a bevel
  (`bevelBox`, the chamfer of `cylinder`): bevels catch the light and make it read as premium.
- **One light rig** (`kit/rig.ts`): warm key from the screen's left, a little in front (soft shadows to the right and a
  little up), cool sky light from many directions (this is the ambient occlusion and the soft contact shadow),
  pink-orange rim from the horizon behind, faint hemisphere fill, a dusk-sky environment for reflections. Do not add
  directional lights. A small `PointLight` inside a model is fine for local glow spill (crystals, furnaces).
- **The palette is shared** (`kit/palette.ts`, colours from the game's data). The player's technology always uses `MAT`:
  `hull` (glossy off-white ceramic: the main body), `trim` (slate blue bands and secondary plates), `panel` (navy pads
  and bases), `deep` (recesses, vents), `steel` and `gunmetal` (structure), `accent` (the one orange: stripes, caps,
  tanks), `hazard` (yellow stripes, scaffold rails), `rubber`, `glass` (dark, mirrors the sky), `solar`, `gold` (top
  levels only), and the lights `tech` (teal, the player's light), `lamp`, `beacon` (red), `ember` (hot). Nature uses
  the obstacle colours from content (`obstacleColors(kind)`), ground tones (`GROUND`, `rockMat`) and `crystalMat`.
- **Emissive accents, one glowing colour per object.** Teal for the player's tech (windows, pad rings, work lights),
  the obstacle's own `glow` for nature. Glow is an accent, not a light show; big lit areas use a lower power
  (`emissive(color, 1.5)`), small lamps the full one.
- **Detail density in three layers:** a calm, readable silhouette first; then secondary forms (bands, modules, tanks,
  legs, braces); then small details (rivets, vents, cables, grilles, hazard stripes, crates). Look at the exemplars:
  the core has a window band, an orange band, grooves, rivets, vents on the pad skirt, an airlock with a lit strip,
  crates and a cable on the deck.
- **Light from the left: never mirror a sprite.** Variety comes from variants, not flips.
- **Things the game draws on top stay out of the model:** belts, power wires, items, ore heaps (`goods`), drones,
  particles, the pulsing light glows (`k.light`).
- **Poly budget:** offline, so generous, but keep it sane: up to ~60k triangles per sprite; smooth turned parts 32 to
  64 sides, low-poly rocks 12 to 24 hull points. Low poly where it is a style (rocks, crystals), smooth where it is
  machined (hulls, tanks).
- **Keep sprite boxes tight:** the image is trimmed to visible pixels, but a huge `lightPool`, a very tall thin mast or
  a far shadow make it big. Every image is downloaded by players.
- **Nothing floats.** Structures stand on the ground: legs and feet touch y = 0 with a contact shadow.

## Work loops (moving parts, the base stays still)

A working machine never shakes, squashes or swaps its whole picture. Only parts move: drill heads and fans turn,
pistons stamp, lights run, embers breathe. A loop is registered with `workLoop` (`art3d/kit/loop.ts`;
`register(..., true)` in mining/power and `machine({ frames: LOOP })` in factories and mega do it for you) and gives
three kinds of sprite:

| id | what | drawn |
|---|---|---|
| `building-<id>` | the idle picture (the whole model, frame 0 or the idle model) | while the machine waits |
| `building-<id>-wb` | the work base: frame 0 **without the parts that move** | still, under the loop, while it works |
| `building-<id>-w0..wN` | one frame as an **overlay**: only the pixels that differ from the work base, trimmed | over the base, at `meta.fps` |

- **Moving parts are found, not declared.** Every frame is built once; a mesh whose world transform, geometry and
  material look the same in every frame belongs to the base. Pad, housing and silhouette therefore can not move.
- **One box per loop.** All sprites of a loop (idle, base, frames) share the union of the frames' bounds, so the light
  rig and the shadow camera stand the same for each and the still pixels match exactly. The overlay is the
  smallest alpha that turns base into frame (`overlay()` in render.ts; differences under 3/255 count as equal).
- **Write the model as a function of the frame** `(k, frame) => Object3D` and keep every frame's tree the same shape.
  12 frames at `LOOP_FPS` (12) is one second; the elevator uses 24 (two seconds). Make it seamless: turn parts by
  whole symmetry steps over the loop (a 4-bladed fan turns 90 or 180 degrees), use `tri`/`breathe`/`stamp`/`loopT`
  for strokes and pulses (cosine based, frame N equals frame 0). A material that pulses is a new `emissive(...)` per
  frame with a different power; the overlay picks it up.
- **Inside the footprint.** Moving parts stay over the deck; nothing swings out past the square.
- Size: an overlay is 15 to 30 % of a full frame (it is mostly transparent and trimmed), so 12 overlays plus the base
  cost about what four whole pictures did. Render loops with `--gpu` (about 3.5 s a sprite instead of 10 to 40 s on
  SwiftShader with other renders running); frames of one run are deterministic, so the still pixels still match.
- Runtime (`objects.ts`): a loop plays while the machine is busy (work-fx activity above 0.5; steering pieces count as
  busy while items pass), never under reduced motion; base and frames are baked together into one atlas the first
  time a kind works (`LazySprites.ready`), so a field of the same machine keeps batching. Old loops of whole pictures
  without `-wb` still play, at 240 ms a frame.
- Proof per loop: a contact sheet of 8 frames composited as the game does, a heat map of the pixels that move, and the
  check that the alpha of the lowest band of the sprite (the plinth) never changes.

## What the game reads from a model (meta)

The kit's `k` collects marks; the renderer projects them to world px. They replace the SVG art's meta key by key, so
keep what the old sprite had (check `src/render/art/<file>.ts`):

| call | used for | who needs it |
|---|---|---|
| `k.light(x, y, z, color, {r, phase, work})` | pulsing additive glow on top (also returns a small lamp mesh) | buildings with lamps; `work: true` flickers while the machine runs |
| `k.hatch(x, y, z)` | where drones leave and loot flies in | the core |
| `k.goods(x, y, z)` | where the game piles ore or crates | drills, smelters |
| `k.vent(x, y, z)` | where smoke, steam or dust leaves | drills (dust), smelters, generators |
| `k.wire(x, y, z)` | where power cables attach | core, poles, generators, solar panels |
| `k.glint(x, y, z)` | 4-point glints flashing on crystal tips and ore | crystals, ore fields |
| `k.top(y)` | visual top (picking box, site bar, laser aim, menu anchor); default: the model's highest point | override for very thin masts |

## Building a model

1. Find your ids (`npm run art -- --only <cat> --list`).
2. Make a file in `art3d/<category>/`, import it in that category's `index.ts`.
3. Buildings: write one function `(k, level) => { pad, body }` and call `building('<kind>', fn)`, or use the helpers in
   `art3d/kit/v2.ts` and `art3d/kit/building.ts`. They register every level and the four construction stages (the body
   clipped at 16/40/64/86 % with a glowing weld seam and scaffold poles). `pad` stands complete from the first stage.
4. Other sprites: `sprite({ id, build: (k) => object })`, or `frames(ids, { build: (k, i) => ... })` for animation
   frames. Options: `glow: true` writes `<id>-glow` (obstacles with a `glow` colour need it), `bloom` (halo baked into the
   sprite, default 0.35), `ground: 'none'` (floating things: drones, lids), `box: { w: 32, h: 32 }` (fixed box: the
   model is scaled to fit; icons), `shadow` (ground shadow opacity).
5. Render: `npm run art -- --only <cat> --ids <id> --samples 8 --sheet <scratch>/sheet.png --sheet-zoom 2`, look at it,
   fix, repeat. Final: a full `npm run art -- --only <cat>` at 32 samples.
6. Check it in the game: `npm run shots -- --name x --out <scratch dir>`. The game uses your image for that id
   automatically; nothing in `src/` changes.

## Review checklist

- Side by side with the old SVG sprite (`npm run artsheet -- --ids <id> --scale 2`): is the new one clearly better?
- Smooth, glossy, softly lit, rich in detail, calm silhouette?
- Does it sit on its tile (sheet diamond), read at zoom 0.5 (small) and hold up at zoom 2.5 (large)?
- Is it consistent with its neighbours: same light, same palette, same scale, same bevel softness?
- Levels: does each level add something you can see? Construction stages: does it rise believably?
- Meta: lights, hatch, goods, vents, wire where the old sprite had them?

## Categories

A category's `npm run art -- --only <category>` only ever writes `public/art/<category>/`. A test
(`art3d/kit/ownership.test.ts`) checks that every sprite the game bakes belongs to exactly one category. The id lists
are derived from the content, so a new building, material or ore shows up in its category's plan automatically; use
`--list` to see every id a category owns.

| category | folders | sprites |
|---|---|---|
| **base** | `art3d/base/`, `public/art/base/` | core shard, foundation and nucleus, container, vault |
| **mining** | `art3d/mining/`, `public/art/mining/` | drills and pumps |
| **logistics** | `art3d/logistics/`, `public/art/logistics/` | conveyors, junctions, routers, sorters, overflow gates, bridges, unloaders, mass drivers |
| **liquids** | `art3d/liquids/`, `public/art/liquids/` | conduits, liquid junctions and routers, tanks, conduit bridges, pumps |
| **power** | `art3d/power/`, `public/art/power/` | generators, solar panels, wind turbines, batteries, power nodes |
| **factories** | `art3d/factories/`, `public/art/factories/` | smelters, kilns, presses, assemblers, printers and the other crafters |
| **mega** | `art3d/mega/`, `public/art/mega/` | accelerator, reactor, Space Elevator |
| **units** | `art3d/units/`, `public/art/units/` | the build drone (two rotor frames) |
| **nature** | `art3d/nature/`, `public/art/nature/` | boulders, crystal rubble, wrecks, scrub, monoliths, shards and leaves |
| **icons** | `art3d/icons/`, `public/art/icons/` | every material icon and the small UI marks |
| **terrain** | `art3d/terrain/`, `public/art/terrain/` | ground decals, sky planet and moon, mist banks |
| **ores** | `art3d/ores/`, `public/art/ores/` | ore field tiles and ridge rock (below) |
| **deco** | `art3d/deco/`, `public/art/deco/` | cable boxes, props and circuit-board decoration (below) |
| **production** | `art3d/production/`, `public/art/production/` | buildings of the game's first design, kept until the art kit moves off `src/legacy/` |

Other owners: `art3d/kit/` and `scripts/art.mjs` (pipeline), `src/render/` (runtime), `src/ui/` (HUD, `GameIcon.tsx`).

- **Drones** float: `ground: 'none'` (their shadows are separate shadow sprites). Frames 0 and 1 are the rotor positions.
- **Nature:** obstacles carrying a `glow` colour need `glow: true`. Tap picking uses `SHAPE_REACH` in
  `src/render/art/obstacles.ts` (how tall each shape is); keep the tallest point near it.
- **Icons** use `box: { w: 32, h: 32 }` (the game draws loot and belt items at this world size) and render at 8x (256 px)
  for the UI. **Every icon gets its own silhouette**, never the same circle twenty times: ore as rough nuggets with
  flecks, sand as a heap, coal as a matte lump, bars as ingots with a stamp, silicon as a wafer, graphite as rods,
  glass as a glowing pane, alloys as ingots, plates and blocks with their input colours, slag as a sad blob, frames as a
  truss, conductors as a copper coil, circuits as a chip, cores as an energy orb. Colours come from content
  (`content.materials`, `color`, `accent`).
- **Ores:** `field-<floor id>-{0..3}` for the 16 ore floors of `src/content/floors.ts` (sand and the scrap heap too). One
  sprite fills one tile with a cluster of the ore's chunks spread over the whole tile (so a field joins up), rendered at
  4 px per world px (ground detail; keeps the repository small: 5.2 MB for all three views). Each ore is three builders in
  `art3d/ores/looks.ts` (`chunk` = the silhouette of its icon, `spike` = its upright form, `grit`); the layout of a tile and
  **the style switch** live in `layout.ts` and `style.ts` (`ORE_STYLE`: `flat`, `crystal`, `mixed`; `mixed` is the one in
  the game, see `docs/screenshots/ore-styles.png`). Preview a style without touching `public/art`:
  `npm run art -- --only ores --define ORE_STYLE=flat --out <dir> --sheet <png>`. Ores are not in the start atlas:
  `src/render/world/ores-layer.ts` loads `public/art/ores/manifest.json` itself and bakes only the ores the map has. In
  game a tile picks its variant from the seed (never the same as its left or upper neighbour), nudged a little; the painted
  ground under a field keeps a soft tint of the ore colour (the far-out view). `ridge-{0..3}` (`art3d/ores/ridges.ts`) are
  the unbuildable ridge tiles as a cliff-sided rock block that fills its tile, so a ridge joins into one plateau; rendered
  light grey and tinted in game with the theme's `ridgeLit`.
- **Deco** is its own category, loaded by `src/render/deco/view.ts` itself and deliberately not in `ART_CATEGORIES`
  (`npm run art -- --only deco`).
- **Kept as procedural SVG on purpose (no model):** `fx-glow`, `fx-spark`, `fx-puff`, `fx-ring`, `fx-star`, `fx-mote`,
  `fx-arrow`, `fx-beam` (white shapes the renderer tints per use).

## Ports

Belts and power cables are drawn by the game (`src/render/world/belts-layer.ts`, `belt-art.ts`, `links.ts`), never baked
into a model. So that they meet every building in the same place, models keep these spots free:

| port | where (model space, origin = anchor) | what the game draws there | what the model must do |
|---|---|---|---|
| belt port | the middle of every footprint edge tile, at ground level: for a 1x1 building (±0.5, 0, 0) and (0, 0, ±0.5); for a 2x2 one (±1, 0, ±0.5) and (±0.5, 0, ±1) | the belt runs 0.16 tiles under the footprint edge; a gate (two posts, 17 world px = 0.22 units tall, with a lit teal bar) stands 0.07 tiles outside the edge, 0.24 tiles either side of the port centre | keep the pad's skirt low there (top of the pad at most ~0.08 units), no tanks, crates or legs within 0.3 of a port centre on the +X and +Z faces |
| wire | `k.wire(x, y, z)` (meta `wire`) | an insulator node and the sagging cable with energy pulses | put `k.wire` on a real insulator, mast tip or bracket: the line must hang from hardware, not from a wall |
| belt height | belts are a low rail body: top 5 world px (0.064 units) over the ground, 0.36 tiles wide in the normal view | | nothing on the ground plane between buildings belongs to the model |

The sim lets a belt touch any side of a building, so every edge tile has a port; the +X and +Z faces (the ones the
camera sees) are where ports show.

## Runtime notes

- `bakeAtlas(sprites, { scale, art, budget })`: the start set (`startSprites`) is baked at `bakeScaleFor(resolution)`
  (device px per world px at the closest zoom, at most 5) unless the visible area of all start sprites would exceed
  `BAKE_BUDGET_PX` (24 M texels); then the whole set is baked a little smaller (`planScale` in pack.ts; a 2x screen
  gets about 4.6). Lazy sprites (levels 2+, construction stages, scaffolds, work loops) bake at the same scale on first
  use. Images come at one size (5x, WebP); older sets may still carry a half-size copy, `artUrl` uses it when present.
- A manifest entry's `meta` overrides the SVG meta key by key (`mergeMeta`); a model without `hatch` keeps the SVG's.
- `<id>-glow` entries load with their sprite even when the SVG had no glow sprite.
- `GameIcon` (`src/ui/components/GameIcon.tsx`) reads the same manifest; `crop` fits a world sprite's object (no
  shadow) into a square for build-list thumbnails. `ResourceIcon` already prefers the 3D icon.
- Atlas pages are drawn after their Pixi `CanvasSource` exists: Pixi rounds the pixel size of a fractional scale
  and resizes (wipes) the canvas otherwise.
