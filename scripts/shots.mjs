#!/usr/bin/env node
/**
 * Screenshots of the production build at the three review viewports.
 *
 *   npm run shots                                  -> docs/screenshots/shot-<w>x<h>.png
 *   npm run shots -- --name base                    -> docs/screenshots/base-<w>x<h>.png
 *   npm run shots -- --name panel --query "seed=7&panel=build"
 *   npm run shots -- --no-build --wait 3000 --only 390x844
 *   npm run shots -- --name played --play 60      (manual clock: the game runs 60 s before the shot)
 *   npm run shots -- --name x --eval "groundbreak.interaction.startPlacing('conveyor')" --play 5  (dev-hook code first)
 *
 * Builds (unless --no-build), starts `vite preview` on the fixed port, opens each viewport in a fresh
 * browser context (so no autosave leaks in), waits for <html data-ready="true"> plus --wait ms,
 * saves the PNG and stops the server. Fails if the page reports a boot error or logs console errors.
 * URL options the game understands: seed, slot, menu, size, theme, zoom, view, dev, manual (see src/main.tsx).
 * Port: 4340 unless GB_PORT says otherwise (4317 is the default preview port).
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BASE_URL, ROOT, build, launchBrowser, openGame, startPreview } from './lib/preview.mjs';

const VIEWPORTS = [
  { w: 390, h: 844, mobile: true },
  { w: 844, h: 390, mobile: true },
  { w: 1440, h: 900, mobile: false },
];

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: 'shot' },
    query: { type: 'string', default: 'seed=7' },
    wait: { type: 'string', default: '1200' },
    only: { type: 'string' },
    out: { type: 'string', default: 'docs/screenshots' },
    'no-build': { type: 'boolean', default: false },
    play: { type: 'string', default: '0' },
    eval: { type: 'string', default: '' },
  },
});

/** With --play: the game runs `seconds` on the manual clock (1/30 s steps). */
async function play(page, seconds) {
  for (let left = seconds * 30; left > 0; left -= 150) {
    await page.evaluate((n) => window.groundbreak.step(n), Math.min(150, left));
  }
}

async function capture(browser, vp, file) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const errors = [];
  const playing = Number(values.play) > 0 || values.eval !== '';
  const query = playing ? `${values.query}&dev&manual` : values.query;
  const page = await openGame(context, `${BASE_URL}?${query}`, errors);
  if (values.eval) await page.evaluate((code) => new Function(code)(), values.eval);
  if (playing) await page.evaluate(() => window.groundbreak.step(2));
  if (Number(values.play) > 0) await play(page, Number(values.play));
  else if (playing) await page.evaluate(() => window.groundbreak.step(90));
  else await page.waitForTimeout(Number(values.wait));
  await page.screenshot({ path: file });
  await context.close();
  return errors;
}

async function main() {
  if (!values['no-build']) build();
  const stop = await startPreview();
  let failed = false;
  try {
    const browser = await launchBrowser();
    const outDir = resolve(ROOT, values.out); // absolute paths (a scratch folder) work too
    mkdirSync(outDir, { recursive: true });
    for (const vp of VIEWPORTS) {
      const size = `${vp.w}x${vp.h}`;
      if (values.only && values.only !== size) continue;
      const file = join(outDir, `${values.name}-${size}.png`);
      const errors = await capture(browser, vp, file);
      console.log(`${errors.length ? 'FAIL' : 'ok  '} ${size} -> ${file.replace(ROOT + '/', '')}`);
      for (const e of errors) console.log(`     ${e}`);
      failed ||= errors.length > 0;
    }
    await browser.close();
  } finally {
    stop();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
