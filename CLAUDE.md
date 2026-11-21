# Tetherline: working notes for AI assistants

A factory builder in the style of Mindustry, played as a one-hour "Quick Round" in the browser (TypeScript, PixiJS,
React). All visible game text is English. `docs/architecture.md` is the module map and the interface reference;
decisions with their reasons are in `docs/decisions.md`; known weak spots are in `docs/ROADMAP.md`.

**Naming.** The game is called Tetherline. Its codename was Groundbreak, and a few internal identifiers keep that
name on purpose, because saves and tools depend on them: the IndexedDB database `groundbreak`, localStorage keys
`groundbreak.*`, DOM events `groundbreak:*`, drag-and-drop MIME types `application/x-groundbreak-*`, and the dev hook
`window.groundbreak`. Do not rename them. Everything the player sees says Tetherline.

`src/legacy/` holds the content and SVG art of the game's first design. It is frozen and only read by the 3D art kit
(`art3d/`); do not build new things on it.

## Commands

```bash
npm ci
npm run dev          # Vite dev server, dev hooks on (window.groundbreak)
npm run build        # production build -> dist/
npm run preview      # vite preview on port 4317
npm run lint         # ESLint, 0 warnings (complexity <= 10 per function!)
npm run typecheck    # tsc for src + art3d (tsconfig.json) and scripts (tsconfig.node.json)
npm run test:run     # Vitest (node environment)
npm run bench [-- --buildings 3000 --items 10000 --ticks 400]   # sim ms per tick of the stress scene
GB_PORT=4341 npm run shots -- --name x --query "seed=7" [--only 1440x900] [--eval "groundbreak.demo()" --play 50] [--out <dir>]
GB_PORT=4343 npm run perf [-- --view top --zoom 0.3 --stress 3000,10000 --software --shot <png>]   # real GPU, fps + JS ms
npm run art [-- --only logistics --ids a,b --samples 8 --sheet <png> --list --gpu]   # 3D sprites (docs/art.md)
npm run artsheet -- --filter=obstacle --scale 2   # sheet of the SVG sprites
npm run listen       # offline audio render (music part)
npm run smoke [-- --no-build]   # menu, drone checkpoint, belts, deco picking, drag areas, recipe panel, tutorial clicks, views
npm run autopilot [-- --seeds 1,7 --minutes 90 --size medium --quiet]   # whole rounds headless with the bot, log per minute
npm run test:bot     # seed 1, two game hours: the bot must win within 90 minutes with no stall over 20 (2-4 min real time, not in test:run)
```

Scripts that start a preview server use port 4340 (`scripts/lib/preview.mjs`) unless `GB_PORT` says otherwise. Give
parallel runs their own `GB_PORT`, and only stop processes you started. Scripts that drive Chromium need
`npx playwright install chromium` once.

URL options (src/main.tsx): `?seed=<text>` (fresh run, `&size=`, `&theme=`), `?slot=1..3`, `?menu`, `?zoom=`,
`?view=iso|steep|top`, `?dev` (window.groundbreak: game, view, interaction, step, demo(), perf, content),
`?dev&manual` (virtual clock: `groundbreak.step(frames)`), `?dev&stress=3000,10000` (performance scene).

## Architecture

See `docs/architecture.md` (module map, data model, interfaces). In one breath: `src/content` (schema + data,
validated), `src/sim` (World over SimState; typed-array map and belt store; blocks by behaviour; power and liquid
graphs rebuilt on layout changes; ghosts built by the drone; `step(world, commands)` at 20 Hz), `src/game` (Game shell,
Interaction tools, snapshot, autopilot), `src/save` (3 IndexedDB slots), `src/render` (Pixi; the world adapter in
`render/world/` over camera, sky, atlases, deco), `src/ui` (React HUD, one folder per part), `src/audio`,
`src/tutorial`.

## Rules
- New content is a data entry in `src/content/`, never a code change; code switches on `behaviour`, never on ids.
- Game state lives outside React; UI reads `useSnapshot()` / `useWorldSelector()`, sends commands via `game.enqueue`.
- Simulation: fixed 20 Hz tick, deterministic. Never use Math.random, Date or performance.now inside `src/sim`.
  Every change to the state goes through `step()`. Every add/remove/rotate/link calls `world.touch()`.
- Items move between buildings only through `offer` / `dump` (src/sim/items.ts).
- Renderer never mutates game state; visual-only randomness is derived from ids/tiles.
- UI follows these rules: every colour/font is a token in `tokens.css`, no `transition: all`, focus-visible,
  reduced motion in base.css, no emoji icons (own SVGs in `ui/components/Icon.tsx`), no invented numbers.
- Keep to the module that owns a feature; use the extension points in docs/architecture.md (augmentable
  `CommandMap` / `EventMap`, optional state fields, HUD slots) rather than editing shared files.
- Before every commit: lint, typecheck, test:run, build green; after visual changes take screenshots and look.
- Buildings never move in their square: no shake or squash of a whole sprite. Work animation = work loops
  (`building-<id>-wb` still base + `-w0..wN` overlay frames, rendered by `npm run art`, docs/art.md "Work loops");
  only parts move, the base plate stays pixel-still.
- Belts behave like Mindustry's (behaviour only, no code from it): side items enter mid-belt, a line dragged across a
  belt lays a junction, line ends aim into their target, lines pass straight through junctions
  (src/game/tools/line-terrain.ts), bridges are spaced by reach. Belt and tread art: render/world/belt-art.ts.
- The autopilot plans in a web worker (src/game/autopilot-worker.ts); the main thread only sends a packed snapshot.
  Never put bot search back on the main thread (it caused 350 ms hitches every 5 s).
- UI motion goes through src/ui/components/Presence.tsx (panels in and out), AnimatedNumber and the shared kit
  tooltip (`data-tip`); see the comment at the top of src/ui/styles/kit.css. A presence element must not keep an
  animation of its own, or its exit never plays.
- Public repository: everything is English (code, comments, test names, docs); no personal names, local paths,
  hostnames or deployment details in files or commit messages; no `repository` field in package.json; do not commit
  generated output that contains absolute paths (`.vitest/`, logs). Do not change the Git identity; commits are signed.

## Traps
- ESLint runs with `--max-warnings 0` and `complexity: 10`: split long functions early.
- `noUncheckedIndexedAccess` is on: array/record reads are `T | undefined`.
- TypeScript is pinned to ~6.0 because typescript-eslint 8 supports `<6.1`; TS 7 (native) is out but unsupported there.
- Screenshots run Chromium with SwiftShader (software WebGL): ~28 fps in the dev readout there is expected, not a bug.
- Atlas pages must be drawn after `new CanvasSource(...)`: with a fractional resolution Pixi resizes the canvas
  (rounding), which wipes anything drawn before (bake.ts `pageSource`).
- A sprite id in public/art/*/manifest.json is drawn from its 3D image, not its SVG; after changing an SVG generator
  check that no 3D model hides it. 3D art changes go through `npm run art` (never edit the images or manifests).
- Overlays on a solid (bands, stripes, windows) must be `overlay(...)` and usually `open`, or the depth sort
  draws them behind the body or their caps cover it.
- Do not mirror obstacle sprites: the light comes from the left; mirroring flips it. Variety = variants.
- `src/ui` may import `render/art/*` generators (pure) for HUD images, never Pixi.
- Camera has a screen-px view offset (`offsetX/Y`, set by `renderer.setCovered` when a panel is open). Use
  `camera.worldToScreen/screenToWorld/viewRect` (they include it); never rebuild screen positions from
  `camera.x/y` and `viewW/2` by hand, or taps and culling drift while a panel is open.
- CSS cascade: single-class rules of equal specificity, last one wins. `.icon-button` and `.resource` are
  shared bases; a variant that must win over them is written with both classes (`.icon-button.hud-button`,
  `.resource.resource-primary`). Two such bugs once made HUD controls 30 and 40 px instead of 48.
- HUD sizes are tokens (`--hit-min` 44, `--hud-control` 48, `--resource-cell`, `--rail-size`); the right edge
  reserve for the corner buttons is `--corner-w` (set on `.hud` / `.hud-dev`).
- Review screenshots: `npm run shots -- --name <x> --out <dir>` (out is relative to the repo root; use a scratch
  folder for work in progress) and quantise the ones you commit (see "Committed screenshots" below).
- Audio levels are measured, not guessed: after changing a sound, run `npm run listen` and compare the stem levels
  with decisions.md ("audio"); look at a spectrogram (`ffmpeg -i x.ogg -lavfi showspectrumpic=s=1400x500:fscale=log x.png`).
  Keep music under the effects and nothing heavy below 200 Hz.
- New buttons sound by their role automatically (`audio/ui-sounds.ts`); give a control `data-sound="none"` (mute)
  or a kind (`data-sound="confirm"`) when its role says the wrong thing. Range inputs tick by value.
- Reduced motion: never read `prefers-reduced-motion` directly in new code; the renderer gets `setStill`, the CSS
  `html[data-motion]` (base.css has both the media query and the attribute rule).
- Frame timing: the renderer's own `render()` only updates sprites; Pixi draws afterwards in its ticker (LOW priority).
  main.tsx records the whole frame at UTILITY priority, so `perf.renderMs` includes Pixi's drawing.
- GPU measurements in headless Chromium use `--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist
  --enable-gpu` (scripts/perf.mjs); screenshots keep SwiftShader (deterministic, no GPU needed).
- Committed screenshots are quantised with Pillow's libimagequant through RGBA:
  `im.convert('RGBA').quantize(256, method=Image.Quantize.LIBIMAGEQUANT)`. On a resized RGB image it returns one
  flat colour, so always convert to RGBA first and check a few results by eye. Phone shots (device pixel ratio 2)
  are halved to their CSS size first. Keep only a small curated set in `docs/screenshots/`.
- View: `?view=iso|steep|top` overrides the stored view for one load; the Settings > View switch saves and reloads.
  World code places things only through iso.ts (gridToWorld, worldX/worldY, footprintExtent, groundEllipse) and
  scales heights given in iso px by `heightScale()`; a hard-coded `* 64` / `* 32` breaks the top-down view.
- Deco (`src/render/deco/`): cables, junction boxes and props are planned from the layout (pure, seeded `plan.ts`)
  and drawn by `DecoView`; never sim state. Its art is its own category (`npm run art -- --only deco`), loaded by
  the layer itself, deliberately not in ART_CATEGORIES.
- Panels slide in with a transform, which a ResizeObserver does not see: `useCoverReport` measures again on
  `animationend` (a smoke check was flaky because the first measure was ~20 px short).
- Changing SimState shape: bump `SAVE_VERSION` (sim/constants.ts); saves of another version are not migrated, their
  slot shows as empty. Optional fields a part adds need no bump.
- The block table lives in `sim/blocks/registry.ts` and is filled by `sim/blocks/index.ts`; modules that blocks
  import (items.ts, power.ts) must import the registry, not the index, or tsx hits an import cycle at load.
- A new world theme needs a reload: sky and boulder sprites are baked per theme at boot (`WorldView.create`).
- Conveyors and conduits are drawn by `render/world/belts-layer.ts`, not as building sprites (objects.ts skips them).
  Belt atlas: `belt-art.ts` + `belt-shape.ts`. Conduits: `pipe-art.ts` (four atlases) + `pipe-shape.ts` (11 shapes picked
  from the sides a conduit is really joined on; the same rule as `opens` in `sim/liquids.ts`, change both together).
- Repository size: `public/art/` is the bulk of the repository (rendered sprites, three views, work loops). Re-render a
  category only when its models change, and never commit a second copy of an image set.
