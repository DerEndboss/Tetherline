# Assets and licenses

Everything the game draws and plays is generated from code in this repository and is covered by the project's
[MIT license](LICENSE). Nothing was taken from stock libraries, other games or generated image or audio services.

| What | Where | How it is made |
| --- | --- | --- |
| Sprites (buildings, drones, nature, ore fields, icons, decoration) | `public/art/` | Rendered offline from low-poly three.js models in `art3d/` with `npm run art`. The models are code; the images are their output. |
| Remaining flat sprites and effects | `src/render/art/`, `src/legacy/art/` | Drawn procedurally as SVG at runtime. |
| UI icons and favicon | `src/ui/components/Icon.tsx`, `public/favicon.svg` | Hand-written SVG paths. |
| Music, sound effects, ambience | `src/audio/` | Synthesized live with WebAudio. No samples. |
| `docs/audio/soundtrack.ogg` | `docs/audio/` | A short clip rendered offline from the game's own synthesizer (`npm run listen`). |
| Screenshots | `docs/screenshots/` | Captures of the game itself. |

## Third-party software

- **Manrope Variable** (UI font), bundled through `@fontsource-variable/manrope`, under the SIL Open Font License 1.1,
  Copyright 2019 The Manrope Project Authors. The license text ships with that package.
- **PixiJS**, **React** and **React DOM** (runtime dependencies) are MIT licensed.
- **three.js** is a development dependency used only to render the sprites offline. It is not part of the game bundle.
- The remaining development dependencies (Vite, Vitest, ESLint, TypeScript, Playwright, esbuild, tsx and others) are
  tools and are not shipped with the game. Their licenses are listed in `package-lock.json` and in each package.

## Inspiration

The game design is inspired by Mindustry (belt and logistics behaviour, the idea of a core you feed). No code, art,
sound or data from Mindustry or any other game is used.
