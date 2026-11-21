# Tetherline art direction

How everything in Tetherline is drawn, so that every contribution looks like it belongs. Colours are data (world
themes in `src/content/themes.ts`, materials and obstacles in `src/content`) or tokens (`src/ui/styles/tokens.css`,
`art3d/kit/palette.ts`), and light and shading come from one rig (`art3d/kit/rig.ts`). Use the helpers instead of
inventing materials; then new art is lit right automatically. How sprites are produced is in
[art.md](art.md).

Look at art large before it goes into the game: `npm run art -- --only <category> --ids <id> --sheet <png>` writes a
contact sheet, and `npm run shots` shows it in the game.

## The mood in one sentence

A warm rust-and-violet alien ground at dusk under a deep blue sky with a pink-orange horizon; on it the player's
clean white-and-teal technology, glowing crystals and soft pink bioluminescence. Calm, warm, readable, a little
magical. Never neon, never grimy, never plastic.

## Palette (Rust Desert, `src/content/themes.ts`)

| Token (theme palette) | Value | Used for |
|---|---|---|
| `sky.top` | `#0a1130` | zenith, top of the horizon band, UI paper |
| `sky.mid` | `#173a6b` | blue sky; cool fill light on faces in shadow |
| `sky.horizon` | `#ff9a76` | horizon glow, planet, some dust motes |
| `sky.haze` | `#b4607e` | haze where the ground meets the sky |
| `ground` (5 tones) | `#6b3f36` ... `#a87350` | painted ground: rust, darker in the low tones |
| `dust` | `#c08a68` | dust around the base, puffs |
| `light` | `#ffc99a` | warm key light: rim lights, sparks, motes, the light wash |
| `shadow` | `#170c2a` | cast shadows, vignette |
| `tech` | `#6fe8dc` | the player's light: windows, pad lights, UI accent |
| `groundSide`, `groundEdge` | `#2a1622`, `#d08a6a` | map slab faces and its rim |
| `ridge` | `#4a2a2c` | rock ridges |

The other worlds (Green Meadow, Ice & Snow) change ground, sky, water and boulders; buildings look the same everywhere.

Technology colours are the same on every world: hull `#eef2f8`, hull shade `#5d6a94`, panels `#3d4870`, accent orange
`#ff9a4d`, beacon `#ff6b6b`, solar cells `#2f4f9a`, power cables and reach `#ffd27a`. Obstacles carry
`colors: [main, shade]` and an optional `glow`; materials carry `color`.

Rules:
- Warm light, cool shadows. A lit face moves towards `light`, a face turned away moves towards its shade colour and
  picks up a little `sky.mid`. Never shade with plain black.
- Saturated colour is for things that matter: crystals, bioluminescence, ore (its material colour), the player's tech
  light (teal), the accent orange. The ground and rocks stay muted.
- One glowing colour per object. A field of one kind must not become a light show: glows breathe slowly (alpha 0.1 to
  0.6), they do not flash. Small emissive extras are rare finds, not a pattern.
- At night the ground goes dark and the player's base glows warm (Settings has a lighting switch).

## Light

- One key light for the whole world: from the upper left of the screen, high, warm (the rig turns with the camera view
  so it always comes from the screen's left). Top faces are brightest, faces towards the screen's left are lit, faces
  towards the screen's right are in shadow.
- Cast shadows fall to the right and a little up, soft, plus a contact shadow right under each object (the cool sky
  light averaged over many directions).
- A soft warm wash over the upper left of the screen and a vignette in the corners (`render/sky.ts`).
- Emissive parts (crystals, windows, lamps) are baked into the sprite and, where they should breathe, also into a
  separate glow sprite that the renderer adds on top.

## Shapes and surfaces

- Models are low-poly where that is a style (rocks, crystals) and smooth where it is machined (hulls, tanks). Every
  hard edge has a bevel that catches the light. No outlines, no black strokes, no flat cel shading.
- Facets must be big enough to read at zoom 0.5, and a building needs a readable roof for the top-down view.
- Organic things (scrub) are soft shapes with the same light.

## Shape language

- **Obstacles:** chunky, grounded, wider at the bottom; four variants per shape, chosen per obstacle, never mirrored.
  Boulders are rust rock clusters. Crystal rubble is cyan prisms leaning out of a rock bed, with a halo. Wrecks are the
  player's kind of hull crashed (white-grey, orange stripe) and blink amber until salvaged. Scrub is a fan of pointed
  violet fronds; one variant in four has a single glowing bulb. Monoliths are tall dark slabs with gold glyphs, rare
  landmarks placed with `scatter`, never in patches.
- **Buildings:** the player's tech. Off-white hulls, slate pads with teal markings, one orange accent band, teal glass,
  a red beacon. Round and friendly where possible, never boxy-industrial. Every building sits on a slab that fills its
  footprint. Higher levels add parts, they do not recolour.
- **Construction:** a site is holographic: the building rises from the bottom as a teal wireframe and scan line while
  the drone welds, and turns solid when finished.
- **Belts and pipes:** normal view is a slim dark strip with muted rails and visible items; build mode (placing,
  laying belts) is a brighter strip with chevrons sliding along. Belts fill almost the whole tile and meet buildings
  and neighbours: curves are quarter circles, a side feed is a clean T. Conduits are glass pipes with flanges and
  flowing liquid, also around corners.
- **Ghosts:** the building's art tinted teal (it fits) or coral (it does not), with a footprint plate in the same
  colour and the reason in the hover card.
- **Drones:** small, round, a little cute: white shell, the accent band, four arms with rotor rings, one glowing eye.
  They fly above the ground and cast a soft shadow. The work beam is a thin warm line that tapers from a hairline into a
  soft glow and lands in a glowing spot with a few sparks.
- **Power:** nodes are slim masts with a lamp. Cables hang between them with a sag and a faint warm pulse while the
  network has energy (a lit core in build mode, coral when the network has none). A machine that gets no power goes
  dark and still under a small bobbing badge (a dark disc with a yellow bolt struck through in coral).
- **Decoration:** generated cables, junction boxes, racks, terminals, masts and lamps around buildings; one piece per
  tile, sitting in a faint pool of light. Cables never cross belts or pipes. Pieces can be removed.
- **Terrain:** ore fields are chunks of the ore's colour, ridges are cliff-sided grey rock, lakes have a shore, a wet
  band and a surf line, oil has a rainbow rim, slag glowing cracks.
- **Icons:** generated from content. One silhouette per family: raw (nugget with flecks, sand heap, lump), refined
  (bar with a stamp, wafer, rods), mixed (ingot, plate, block), parts (truss, coil, board, orb). Filled with the
  material colour, lit top left. The same image is loot in the world, an item on a belt and a HUD cell. UI icons
  (`ui/components/Icon.tsx`) are 24 px stroke icons (1.75 px, round caps) in `currentColor`.

## Motion

- Everything alive moves a little: crystals and bulbs breathe, wreck beacons blink, lights chase along routers, dust
  motes drift, stars twinkle. Nothing spins forever.
- Working machines play loops in which only parts move (drill heads turn, furnace doors glow, the elevator cabin
  climbs); the base plate stays pixel-still.
- Construction is a holographic rise from the bottom.
- Drones lift off, cruise, tilt into their flight, descend to work and weld with a beam.
- `prefers-reduced-motion` (and the in-game motion choice): no shake, no wobble, no breathing, particles cut to a
  third. Feedback (flash, counter) stays.

## Sound (same mood)

All sound is synthesized (`src/audio`), in the world's key (`world.sound`). Effects are soft and round; the player's own
actions are the loudest thing and the base's work is a bed under them. See [audio/README.md](audio/README.md) for the tracks, the channels and how to measure levels.

## Camera and framing

- The start zoom fits the base and its surroundings on a phone; bigger screens start closer (up to 1.3), but never
  past `BAKE_SCALE / devicePixelRatio`, so baked sprites are never upscaled (`startZoom` in `render/camera.ts`).
- An open panel never hides the base: the panel reports what it covers (`setCovered`), the view centre glides into the
  visible part (`camera.offsetX/Y`) and the horizon band lifts with it.
- Three views (oblique, steep, top-down) share one world; see [art.md](art.md).

## UI

- The HUD is glass over the world: `--color-glass` navy at 72 to 88 % with a 14 % white top edge and a blur,
  pill or 18 px radius, Manrope, numbers in tabular figures and heavy weight. Accent teal marks only the primary
  action and the current selection.
- Everything on the world floats; the world runs to the screen edge. HUD controls share one height (`--hud-control`,
  48 px) and every hit area is at least `--hit-min` (44 px).
- No inner tiles: no card in a card. Missing price parts are coral (`--color-short`), never red alarms. Advice that is not
  a blocker (no power at this spot) is amber (`--color-warn`).
- Build lists show the world art as thumbnails, prices as icon chips and one primary action per surface.
- Panels slide in and out, buttons press in, numbers count up, tooltips use the game look (`data-tip`); all of it goes
  through the shared motion kit (`ui/styles/kit.css`, `ui/components/Presence.tsx`).
- Floor rules: every colour and font is a token, no `transition: all`, visible focus, a reduced-motion fallback, no emoji
  icons, no card in card.
