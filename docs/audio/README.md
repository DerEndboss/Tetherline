# Sound

Everything is synthesized in code (WebAudio), nothing is a sample. Three channels, each with its own volume in the
settings: music, effects, ambience.

## Music: three build tracks

| Track | Key | BPM | Groove | Length |
|---|---|---|---|---|
| Cranes at Dawn | D dorian | 82 | lo-fi boom-bap, lazy 16th swing, Rhodes + vibes | ~3.9 min |
| Copper Loop | G mixolydian | 100 | light funk, plucked stabs, busy bass | ~3.8 min |
| Warm Furnace | F major | 90 | eighth-note shuffle, brushed backbeat, singing Rhodes | ~3.9 min |

- `tracks.ts` is the data (chords, bass, comp and drum patterns, form). `composer.ts` turns a track, a bar number and a
  seed into notes (pure, tested). `instruments.ts` is the band. `music.ts` plays it with a look-ahead scheduler.
- Form: drone intro, verse, groove (melody), lift (doubled melody), breakdown, drone outro. Each melodic section grows
  its own motif from the seed and varies it from phrase to phrase.
- Crossfade: the last 4 bars of a track (a bare root-fifth-octave drone) overlap the next track's first 4 bars on an
  equal-power curve. Order is a seeded shuffle, never one track twice in a row.
- Settings window: "Now playing" and "Next track" (`AudioEngine.music`, set by `GameSound`).
- Add a track: append a `TrackDef` to `TRACKS` (eight chords, form with intro and outro); `music.test.ts` checks the rest.

## Effects and ambience

`GameSound` (sound.ts) maps sim events to sounds: `site` (servo), `built` (thump + clank + notes, bigger with the
footprint size), `removed`, `boulder-cleared`, `core-upgraded`, `order-done`, `won`, `drone-added`, `plan-dropped`.
Player actions the sim cannot see go through `emitCue` (cues.ts): `ghost`, `ghost-cancel`, `belt-tick` (length so far),
`belt-done`. Machine layers (belts, hiss, whirr, hum, burn, drill thumps on the music's beat) follow the camera when
`sound.watch(() => ({ state, zoom, onScreen }))` is wired.

## Listening without ears

`npm run listen -- --track 1 --from 20 --seconds 40` renders offline and prints levels per channel;
`--track 0 --from 74 --next 1 --seconds 40` renders the crossfade (`docs/audio/soundtrack.ogg`, a 40 s clip, is that
render, made by the game's own synthesizer). The port can be set with `GB_LISTEN_PORT`.
