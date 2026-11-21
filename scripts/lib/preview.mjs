/** Shared helpers for scripts that drive the production build in Chromium (shots, smoke). */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PORT = Number(process.env.GB_PORT) || 4340; // own port for scripts (4317 is the default preview); GB_PORT picks another
export const BASE_URL = `http://localhost:${PORT}/`;

export function build() {
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('npm run build failed');
}

async function waitForServer(url, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Preview server did not answer at ${url}`);
}

/** Starts `vite preview` on the fixed port; returns a stop function. */
export async function startPreview() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  const stop = () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  process.on('exit', stop);
  await waitForServer(BASE_URL);
  return stop;
}

/** Headless Chromium with software WebGL, so screenshots work without a GPU. */
export function launchBrowser() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

/** Opens a page and waits until the game booted. Collects console errors into `errors`. */
export async function openGame(context, url, errors) {
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 30_000 });
  const ready = await page.evaluate(() => document.documentElement.dataset.ready);
  if (ready !== 'true') errors.push(`boot failed (data-ready="${ready}")`);
  return page;
}
