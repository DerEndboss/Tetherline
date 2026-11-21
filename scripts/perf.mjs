#!/usr/bin/env node
/**
 * Performance check of the production build with the dev stress scene (3,000 buildings, 10,000 items on belts).
 *
 *   npm run perf                          real GPU (ANGLE on Vulkan) when there is one, 1440x900, zoomed out
 *   npm run perf -- --software            SwiftShader (no GPU): CPU-bound, much slower, a worst case
 *   npm run perf -- --view top            the top-down view (default iso)
 *   npm run perf -- --throttle 4          the main thread slowed 4x (Chrome's CPU throttling, a weak laptop)
 *   npm run perf -- --zoom 1.2 --seconds 10 --stress 3000,10000 --no-build --shot docs/screenshots/perf.png
 *
 * Prints the WebGL renderer, frames per second, the JavaScript time per frame (sim + drawing, mean and 95th
 * percentile) and the worst hitch, measured by the game itself (src/game/perf.ts, window.groundbreak.perf).
 */
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { BASE_URL, ROOT, build, startPreview } from './lib/preview.mjs';
import { join } from 'node:path';

const { values } = parseArgs({
  options: {
    'no-build': { type: 'boolean', default: false },
    software: { type: 'boolean', default: false },
    throttle: { type: 'string', default: '1' },
    zoom: { type: 'string', default: '0.5' },
    seconds: { type: 'string', default: '8' },
    stress: { type: 'string', default: '3000,10000' },
    width: { type: 'string', default: '1440' },
    height: { type: 'string', default: '900' },
    shot: { type: 'string', default: '' },
    view: { type: 'string', default: 'iso' },
  },
});

const GPU = ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
const SOFTWARE = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function main() {
  if (!values['no-build']) build();
  const stop = await startPreview();
  const browser = await chromium.launch({ args: values.software ? SOFTWARE : GPU });
  try {
    const page = await browser.newPage({ viewport: { width: Number(values.width), height: Number(values.height) } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE_URL}?dev&stress=${values.stress}&zoom=${values.zoom}&view=${values.view}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 60_000 });
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    const throttle = Number(values.throttle);
    if (throttle > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.groundbreak.perf.reset());
    await page.waitForTimeout(Number(values.seconds) * 1000);
    const result = await page.evaluate(() => {
      const { game, perf } = window.groundbreak;
      const s = game.world.state;
      const belts = s.buildings.filter((b) => b.slot >= 0);
      const items = belts.reduce((n, b) => n + s.belts.count[b.slot], 0);
      return { ...perf.summary(), buildings: s.buildings.length, items, belts: belts.length };
    });
    if (values.shot) await page.screenshot({ path: join(ROOT, values.shot) });
    const round = (n) => Math.round(n * 10) / 10;
    console.log(
      JSON.stringify(
        {
          renderer,
          throttle,
          view: values.view,
          viewport: `${values.width}x${values.height}`,
          zoom: Number(values.zoom),
          ...Object.fromEntries(Object.entries(result).map(([k, v]) => [k, round(v)])),
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
