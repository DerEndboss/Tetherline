#!/usr/bin/env node
/**
 * Renders the game's sound offline in Chromium and measures it (no speakers or listening needed).
 *
 *   npm run listen                       -> levels per channel + docs/audio/soundtrack.ogg (60 s)
 *   npm run listen -- --seconds 30 --seed 7 --out <dir>
 *   npm run listen -- --track 1 --from 20     -> track 1 (0..2) starting at bar 20
 *   npm run listen -- --track 0 --from 72 --next 1 --seconds 60   -> the crossfade from track 0 into track 1
 *
 * Starts the Vite dev server (the audio modules are imported as source), renders music, effects and ambience
 * alone and together with an OfflineAudioContext (src/audio/offline.ts), prints peak and loudness per stem and
 * per 10 s, writes a WAV of the full mix and turns it into an OGG with ffmpeg when it is installed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { ROOT } from './lib/preview.mjs';

const { values } = parseArgs({
  options: {
    seconds: { type: 'string', default: '60' },
    seed: { type: 'string', default: '7' },
    out: { type: 'string', default: 'docs/audio' },
    track: { type: 'string', default: '0' },
    from: { type: 'string', default: '0' },
    next: { type: 'string', default: '' },
  },
});
const PORT = Number(process.env.GB_LISTEN_PORT ?? 5199);
const BASE = `http://localhost:${PORT}/`;

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('dev server did not start');
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // gone
  }
};
process.on('exit', stop);
await waitFor(`${BASE}robots.txt`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error(String(e)));
await page.goto(`${BASE}robots.txt`);
const seconds = Number(values.seconds);
const result = await page.evaluate(
  async ({ seconds, seed, opts }) => {
    const { renderSound } = await import('/src/audio/offline.ts');
    const { content } = await import('/src/content/index.ts');
    const key = content.themes.get(content.rules.defaultTheme).sound;
    const db = (x) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -Infinity);
    // Peak, loudness, and how the loudness splits below and above 200 Hz (a one-pole split): a mix that lives
    // below 200 Hz is mud on laptop and phone speakers.
    const stats = (r, from = 0, to = r.left.length) => {
      let peak = 0;
      let sum = 0;
      let low = 0;
      let high = 0;
      let y = 0;
      const a = 1 - Math.exp((-2 * Math.PI * 200) / r.sampleRate);
      for (let i = from; i < to; i++) {
        const x = (r.left[i] + r.right[i]) / 2;
        peak = Math.max(peak, Math.abs(r.left[i]), Math.abs(r.right[i]));
        sum += (r.left[i] ** 2 + r.right[i] ** 2) / 2;
        y += a * (x - y);
        low += y * y;
        high += (x - y) ** 2;
      }
      const n = Math.max(1, to - from);
      return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)), lowDb: db(Math.sqrt(low / n)), highDb: db(Math.sqrt(high / n)) };
    };
    const stems = {};
    for (const ch of ['music', 'effects', 'ambience']) stems[ch] = stats(await renderSound(key, seconds, seed, [ch], opts));
    const all = await renderSound(key, seconds, seed, ['music', 'effects', 'ambience'], opts);
    const windows = [];
    for (let s = 0; s < seconds; s += 10) windows.push({ from: s, ...stats(all, s * all.sampleRate, Math.min(all.left.length, (s + 10) * all.sampleRate)) });
    // 16-bit stereo WAV of the full mix.
    const n = all.left.length;
    const buf = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, t) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    buf.setUint32(4, 36 + n * 4, true);
    str(8, 'WAVEfmt ');
    buf.setUint32(16, 16, true);
    buf.setUint16(20, 1, true);
    buf.setUint16(22, 2, true);
    buf.setUint32(24, all.sampleRate, true);
    buf.setUint32(28, all.sampleRate * 4, true);
    buf.setUint16(32, 4, true);
    buf.setUint16(34, 16, true);
    str(36, 'data');
    buf.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      buf.setInt16(44 + i * 4, Math.max(-1, Math.min(1, all.left[i])) * 32767, true);
      buf.setInt16(46 + i * 4, Math.max(-1, Math.min(1, all.right[i])) * 32767, true);
    }
    let bin = '';
    const bytes = new Uint8Array(buf.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { stems, mix: stats(all), windows, wav: btoa(bin) };
  },
  { seconds, seed: Number(values.seed), opts: { track: Number(values.track), fromBar: Number(values.from), next: values.next === '' ? undefined : Number(values.next) } },
);
await browser.close();
stop();

console.log('Stem levels (dBFS):', JSON.stringify(result.stems));
console.log('Full mix:', JSON.stringify(result.mix));
for (const w of result.windows) console.log(`  ${w.from}s  peak ${w.peakDb}  rms ${w.rmsDb}`);
const dir = join(ROOT, values.out);
mkdirSync(dir, { recursive: true });
const wav = join(dir, 'soundtrack.wav');
writeFileSync(wav, Buffer.from(result.wav, 'base64'));
const ogg = join(dir, 'soundtrack.ogg');
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '3', ogg]);
if (ff.status === 0) {
  spawnSync('rm', [wav]);
  console.log(`wrote ${ogg}`);
} else {
  console.log(`wrote ${wav} (no ffmpeg for an OGG)`);
}
