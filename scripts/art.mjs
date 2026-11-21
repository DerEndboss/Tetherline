/**
 * Renders the low-poly 3D models of art3d/<category>/ into public/art/<category>/<id>.webp (three camera angles:
 * iso, steep/, top/) and writes that category's manifests (docs/art.md).
 *   npm run art                                  # every category
 *   npm run art -- --only nature                 # one category (several: --only base,units)
 *   npm run art -- --only nature --ids obstacle-crystal-rubble-0,obstacle-crystal-rubble-1
 *   npm run art -- --only production --samples 8 --sheet draft/sheet.png   # quick draft + contact sheet
 *   npm run art -- --only base --gpu             # hardware WebGL instead of SwiftShader (faster, not bit-exact)
 *   npm run art -- --only base --view top        # one view only: iso | steep | top (default: all three; `steep` -> public/art/<category>/steep/)
 *   npm run art -- --only ores --define ORE_STYLE=flat --out draft   # a preview: models read `__ORE_STYLE__`,
 *                                                # files go to draft/<category>/ instead of public/art/
 *
 * Safe to run several times at once: no server or port (the bundle is loaded with page.setContent), no shared
 * temp files (everything is in memory, files are written via a per-process temp name and renamed), and a run
 * only ever writes inside public/art/<its category>/.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORIES = ['base', 'production', 'power', 'units', 'nature', 'icons', 'terrain', 'deco', 'logistics', 'liquids', 'mining', 'factories', 'mega', 'ores'];

const { values } = parseArgs({
  options: {
    only: { type: 'string', default: '' },
    ids: { type: 'string', default: '' },
    samples: { type: 'string', default: '' },
    sheet: { type: 'string', default: '' },
    'sheet-zoom': { type: 'string', default: '1' },
    gpu: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    view: { type: 'string', default: 'all' },
    define: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: '' },
  },
});

/** `--define NAME=value` -> the global `__NAME__` in the models is the string "value" (previews of a style). */
const DEFINES = Object.fromEntries(
  values.define.map((d) => {
    const at = d.indexOf('=');
    if (at < 1) throw new Error(`--define wants NAME=value, got ${d}`);
    return [`__${d.slice(0, at)}__`, JSON.stringify(d.slice(at + 1))];
  }),
);
/** Where categories are written: public/art/ unless `--out <dir>` (previews that must not touch the game's art). */
const OUT = values.out ? resolve(values.out) : join(ROOT, 'public', 'art');

/** The views to render: `iso` (public/art/<category>/), `steep` (.../steep/) and `top` (.../top/). */
const ALL_VIEWS = ['iso', 'steep', 'top'];
const VIEWS = values.view === 'all' || values.view === 'both' ? ALL_VIEWS : values.view.split(',');
for (const v of VIEWS) if (!ALL_VIEWS.includes(v)) throw new Error(`Unknown view ${v} (iso, steep, top or all)`);

const only = values.only ? values.only.split(',').filter(Boolean) : CATEGORIES;
for (const c of only) if (!CATEGORIES.includes(c)) throw new Error(`Unknown category ${c} (one of ${CATEGORIES.join(', ')})`);
const ids = new Set(values.ids.split(',').filter(Boolean));

async function bundle(category) {
  const entry = join(ROOT, 'art3d', category, 'index.ts');
  if (!existsSync(entry)) throw new Error(`Missing ${entry}`);
  const out = await build({
    stdin: { contents: `import './art3d/kit/page.ts';\nimport './art3d/${category}/index.ts';\n`, resolveDir: ROOT, loader: 'ts', sourcefile: `art-${category}.ts` },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    define: DEFINES,
    logLevel: 'warning',
  });
  return out.outputFiles[0].text;
}

function launch() {
  const gpu = ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu'];
  const soft = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  return chromium.launch({ args: values.gpu ? gpu : soft });
}

/** Writes a file atomically (per-process temp name, then rename), so parallel readers never see half a file. */
function writeAtomic(path, data) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Writes one WebP sprite; returns its file name, short hash and size. */
function writeImage(dir, wire) {
  const file = `${wire.id}.webp`;
  const data = Buffer.from(wire.webp, 'base64');
  writeAtomic(join(dir, file), data);
  return { file, hash: createHash('sha1').update(data).digest('hex').slice(0, 10), bytes: data.length };
}

/** Writes a sprite and returns its manifest entry plus the bytes written (no half-size copy: WebP is small enough). */
function saveImage(dir, wire) {
  const img = writeImage(dir, wire);
  return { file: img.file, w: wire.w, h: wire.h, ax: round(wire.ax), ay: round(wire.ay), scale: wire.scale, hash: img.hash, bytes: img.bytes };
}

const round = (n) => Math.round(n * 1e5) / 1e5;

function readManifest(path, category) {
  if (!existsSync(path)) return { version: 1, category, sprites: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { version: 1, category, sprites: {} };
  }
}

/** Removes images (WebP, and old PNGs) of this view that no manifest entry names any more (only after a full category run). */
function prune(dir, manifest) {
  const keep = new Set(Object.values(manifest.sprites).flatMap((e) => [e.file, ...(e.half ? [e.half.file] : [])]));
  for (const f of readdirSync(dir)) if (/\.(png|webp)$/.test(f) && !keep.has(f)) unlinkSync(join(dir, f));
}

async function renderCategory(browser, category) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.addScriptTag({ content: await bundle(category) });
  if (errors.length) throw new Error(`${category}: ${errors.join('\n')}`);
  const models = await page.evaluate(() => window.__art.models());
  const planned = await page.evaluate(() => window.__art.planned());
  const todo = models.filter((m) => !ids.size || ids.has(m.id));
  console.log(`${category}: ${models.length} of ${planned.length} planned ids have a model${values.list ? '' : `; rendering ${todo.length} (${await page.evaluate(() => window.__art.gl())})`}`);
  if (values.list) {
    const glows = new Set(models.filter((m) => m.glow).map((m) => `${m.id}-glow`));
    const kind = (id) => (models.some((m) => m.id === id) ? 'model' : glows.has(id) ? 'glow ' : 'svg  ');
    console.log(planned.map((id) => `${kind(id)}  ${id}`).join('\n'));
    await page.close();
    return;
  }
  const samples = values.samples ? Number(values.samples) : undefined;
  for (const view of VIEWS) {
    // Fixed-box sprites (icons, particles, sky) are screen things: the top-down view reuses their iso render.
    const list = view === 'iso' ? todo : todo.filter((m) => !m.fixed);
    await renderView(page, category, view, list, samples);
  }
  if (errors.length) console.warn(`${category}: page errors\n${errors.join('\n')}`);
  await page.close();
}

/** One view of a category: its images and manifest (steep in public/art/<category>/steep/, top in .../top/). */
async function renderView(page, category, view, list, samples) {
  const dir = join(OUT, category, ...(view === 'iso' ? [] : [view]));
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, 'manifest.json');
  const manifest = ids.size ? readManifest(manifestPath, category) : { version: 1, category, sprites: {} };
  if (view !== 'iso') manifest.view = view;
  if (VIEWS.length > 1) console.log(`  ${view} view: ${list.length} sprites`);
  for (const m of list) await renderOne(page, dir, manifest, m.id, samples, view);
  if (!ids.size) prune(dir, manifest);
  manifest.sprites = Object.fromEntries(Object.entries(manifest.sprites).sort(([a], [b]) => a.localeCompare(b)));
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  if (values.sheet && list.length) await writeSheet(page, list.map((m) => m.id), view);
}

/** Renders one sprite (and its glow), writes its files and puts it into the manifest. */
async function renderOne(page, dir, manifest, id, samples, view) {
  const r = await page.evaluate(([i, s, v]) => window.__art.render(i, { view: v, ...(s ? { samples: s } : {}) }), [id, samples, view]);
  const { bytes, ...entry } = saveImage(dir, r);
  manifest.sprites[id] = { ...entry, meta: r.meta, body: r.body };
  let line = `  ${id}  ${r.width}x${r.height}  ${(bytes / 1024).toFixed(0)} KB  ${r.ms} ms`;
  if (r.glow) {
    const { bytes: gb, ...g } = saveImage(dir, r.glow);
    manifest.sprites[r.glow.id] = g;
    line += `  + glow ${(gb / 1024).toFixed(0)} KB`;
  }
  console.log(line);
}

async function writeSheet(page, list, view) {
  const url = await page.evaluate(([l, z]) => window.__art.sheet(l, { zoom: z }), [list, Number(values['sheet-zoom'])]);
  const out = resolve(VIEWS.length > 1 && view !== 'iso' ? values.sheet.replace(/(\.png)?$/, `-${view}.png`) : values.sheet);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  console.log(`sheet -> ${out}`);
}

const browser = await launch();
try {
  for (const category of only) await renderCategory(browser, category);
} finally {
  await browser.close();
}
