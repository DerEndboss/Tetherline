/**
 * Art sheet: renders every sprite the world bakes onto one page and screenshots it, so the art can be
 * judged large without the game around it.
 *   npm run artsheet [-- --filter obstacle --scale 2 --out docs/screenshots/artsheet.png]
 *   npm run artsheet -- --levels --filter building-smelter   (adds every building level 2..max, baked lazily in game)
 *   npm run artsheet -- --ids building-lab-1,building-lab-5,building-lab-10   (exactly these, in this order)
 *   npm run artsheet -- --ids building-megastructure-1,building-megastructure-3-grow-1   (growth stages of the Skyforge)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { content } from '../src/legacy/content';
import { BUILD_STAGES, buildingSprite, growthSprite, grows, printSprites, worldSprites } from '../src/legacy/art';
import { relicSprite } from '../src/legacy/art/relics';

const { values } = parseArgs({
  options: {
    filter: { type: 'string', default: '' },
    scale: { type: 'string', default: '1.5' },
    out: { type: 'string', default: 'docs/screenshots/artsheet.png' },
    bg: { type: 'string', default: '' },
    levels: { type: 'boolean', default: false },
    ids: { type: 'string', default: '' },
  },
});

const world = content.worlds.get(content.rules.startWorld);
const scale = Number(values.scale);
const ids = (values.ids ?? '').split(',').filter(Boolean);
const levels =
  values.levels || ids.length
    ? content.buildings.list.flatMap((b) => [
        ...Array.from({ length: b.maxLevel - 1 }, (_, i) => buildingSprite(b, world.palette, i + 2)),
        // Levels that rise on their own (the Skyforge's stages) while drones build them.
        ...(grows(b, world.palette) ? Array.from({ length: (b.maxLevel - 1) * BUILD_STAGES }, (_, i) => growthSprite(b, world.palette, 2 + Math.floor(i / BUILD_STAGES), i % BUILD_STAGES)) : []),
      ])
    : [];
const all = [...worldSprites(content, world), ...printSprites(content, world.palette), ...content.relics.list.map(relicSprite), ...levels];
const sprites = ids.length ? ids.map((id) => all.find((s) => s.id === id)).filter((s) => s !== undefined) : all.filter((s) => s.id.includes(values.filter ?? ''));
const bg = values.bg || world.palette.ground[2]!;
const cells = sprites
  .map((s) => {
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`;
    const ax = s.ax * s.w * scale;
    const ay = s.ay * s.h * scale;
    return `<figure><div class="box" style="width:${s.w * scale}px;height:${s.h * scale}px"><img src="${src}" width="${s.w * scale}" height="${s.h * scale}"><i style="left:${ax - 2}px;top:${ay - 2}px"></i></div><figcaption>${s.id}</figcaption></figure>`;
  })
  .join('');
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:${bg};font:12px system-ui;color:#fff;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
figure{margin:0}.box{position:relative;outline:1px dashed #ffffff22}img{display:block}
i{position:absolute;width:4px;height:4px;background:#0f0;border-radius:2px}
figcaption{opacity:.7;max-width:220px;overflow-wrap:anywhere}</style>${cells}`;

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const scratch = join(root, 'node_modules', '.artsheet');
mkdirSync(scratch, { recursive: true });
const file = join(scratch, 'sheet.html');
writeFileSync(file, html);
const out = join(root, values.out ?? 'docs/screenshots/artsheet.png');
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`file://${file}`);
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`${sprites.length} sprites -> ${out.replace(root + '/', '')}`);
