# Roadmap and known weak spots

An honest list of what is still rough, and where the project could go next. Nothing here is a promise.

## Next steps

1. **A full round played by a person, measured.** Every balance number so far comes from the autopilot; the pace of a
   human (estimated at 60 to 80 minutes) and the feel of the first half hour are the most valuable feedback missing.
2. **Make small maps and the finale robust.** On small maps the autopilot wins only about 4 of 10 rounds: the finale
   (particle accelerator and coolant) can get stuck, and some rounds have pauses over 20 minutes. Medium maps are fine
   (58 to 82 minutes).
3. **Phones.** Playable, but tight, especially in landscape; touch has had far less testing than mouse and keyboard.
4. **Packaging.** A desktop build (for example Electron) would let the game ship as an app as well as a web page.

## Balance and content

- **Orders never ask for some buildings:** junction, router, overflow gate, fast conveyor, vault, laser drill, large
  battery, large power node, tank, slag tap, separator, pulverizer and carbon synthesizer. They pay off only on some
  maps, so a round never forces them.
- **The autopilot's planning is slow on large maps:** up to 8 s per look in its worker (it never blocks the game, but it
  reacts late). Its pace varies from 58 to 78 minutes per map.
- **Hotbar slots do not remember a recipe;** the pipette (Q) does carry a building's setting.

## Interface

- **The power readout confuses.** The top left shows the sum of all networks (for example 40/17); the core tooltip shows only
  the core's own network. Both are right, but nothing explains it.
- **No hint when the core store is full** ("core full, burning"): surplus is burned silently.
- **Tutorial:** the hover card can lie over the tutorial card, the belt step does not zoom out when the drill and the core
  are far apart, and power units in texts are not written the same way everywhere.
- **Touch:** decoration cannot be removed by touch.

## Look

- Ridge rock shows seams between the blocks.
- Large ore fields look scattered rather than dense.
- Wrecks look a little soft from close up.
- Items inside junctions, routers and bridges are not drawn.
- Solar panels, storage and liquid parts have no work animation.

## Technical

- **Undo of a building placed over belts does not bring the belts back.**
- **The map paint at the start of a round is synchronous.** `paintMapAsync` exists but is not wired to the loading bar.
- **Weak laptops:** under a 4x CPU throttle the oblique view reaches about 17 fps with the 3D sprites (Pixi's sprite
  collect is the cost, not the simulation). A particle container for belt items and a single additive glow layer are the
  next measured candidates.
- **Repository size:** `public/art/` is about 235 MB (every sprite in three views, plus work-loop frames). Git LFS or a
  leaner asset format would help before a larger release. Re-render a category only when its models change.
- **`src/legacy/`:** content and SVG art of the game's first design are still read by the 3D art kit. Moving the kit
  to the current content would let the folder go.
- **TypeScript is held below 6.1** until typescript-eslint supports it.
