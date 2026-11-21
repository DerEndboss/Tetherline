import type { ViewMode } from '../../src/render/iso';
import { project, setArtView } from './iso';
import { ArtRenderer, type Image, type Rendered } from './render';
import { plannedIds, registered } from './registry';

/**
 * The bridge between scripts/art.mjs (Node) and the models (browser): the script bundles a category's
 * index.ts together with this file, loads it into headless Chromium with page.setContent (no server, no
 * port) and calls `window.__art`. Images travel back as base64 WebP; the script writes the files.
 */

export interface Wire {
  id: string;
  /** The picture as a WebP file (lossy, quality WEBP_QUALITY, alpha kept), base64. */
  webp: string;
  width: number;
  height: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  scale: number;
}

export interface WireResult extends Wire {
  meta: Rendered['meta'];
  body: Rendered['body'];
  ms: number;
  glow?: Wire;
}

/** WebP quality of every sprite (0..1): visually clean at a fraction of the PNG size, alpha stays lossless. */
const WEBP_QUALITY = 0.88;

async function base64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('FileReader failed'));
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

async function encodeWebp(img: Image): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) => toCanvas(img).toBlob(resolve, 'image/webp', WEBP_QUALITY));
  if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP');
  return base64(blob);
}

async function wire(r: Omit<Rendered, 'meta' | 'body' | 'glow'>): Promise<Wire> {
  return {
    id: r.id,
    webp: await encodeWebp(r.image),
    width: r.image.width,
    height: r.image.height,
    w: r.w,
    h: r.h,
    ax: r.ax,
    ay: r.ay,
    scale: r.scale,
  };
}

let renderer: ArtRenderer | null = null;
const done = new Map<string, Rendered>();

function art(): ArtRenderer {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    renderer = new ArtRenderer(canvas);
  }
  return renderer;
}

/** Draws rendered sprites on a ground-coloured sheet with each tile diamond under its anchor (for review). */
function sheet(ids: readonly string[], opts: { cols?: number; zoom?: number; ground?: string } = {}): string {
  const list = ids.map((id) => done.get(id)).filter((r): r is Rendered => r !== undefined);
  const zoom = opts.zoom ?? 1;
  const cell = Math.max(160, ...list.map((r) => Math.max(r.w, r.h))) * zoom + 24;
  const cols = Math.min(list.length, opts.cols ?? Math.max(1, Math.round(Math.sqrt(list.length * 1.6))));
  const rows = Math.ceil(list.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * (cell + 18);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = opts.ground ?? '#62384d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  list.forEach((r, i) => drawCell(ctx, r, (i % cols) * cell, Math.floor(i / cols) * (cell + 18), cell, zoom));
  return canvas.toDataURL('image/png');
}

function drawCell(ctx: CanvasRenderingContext2D, r: Rendered, x: number, y: number, cell: number, zoom: number): void {
  const img = toCanvas(r.image);
  const dw = r.w * zoom;
  const dh = r.h * zoom;
  const cx = x + cell / 2;
  const cy = y + cell * 0.62;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  // the tile under the anchor, in the view the sprite was rendered for
  const corners = [project(-0.5, 0, -0.5), project(0.5, 0, -0.5), project(0.5, 0, 0.5), project(-0.5, 0, 0.5)];
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(cx + p.x * zoom, cy + p.y * zoom) : ctx.lineTo(cx + p.x * zoom, cy + p.y * zoom)));
  ctx.closePath();
  ctx.stroke();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cx - r.ax * dw, cy - r.ay * dh, dw, dh);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px sans-serif';
  ctx.fillText(r.id, x + 6, y + cell + 12);
}

function toCanvas(img: Image): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  return c;
}

declare global {
  interface Window {
    __art: {
      planned: () => string[];
      /** `fixed`: the sprite has a fixed box (icons, particles, sky): it is rendered for the iso view only. */
      models: () => { id: string; glow: boolean; fixed: boolean }[];
      render: (id: string, overrides?: { samples?: number; view?: ViewMode }) => Promise<WireResult>;
      sheet: typeof sheet;
      gl: () => string;
    };
  }
}

window.__art = {
  planned: plannedIds,
  models: () => registered().map((s) => ({ id: s.id, glow: s.glow ?? false, fixed: s.box !== undefined })),
  async render(id, overrides = {}) {
    const spec = registered().find((s) => s.id === id);
    if (!spec) throw new Error(`No model for ${id}`);
    setArtView(overrides.view ?? 'iso');
    const t0 = performance.now();
    const r = art().render({ ...spec, ...(overrides.samples ? { samples: overrides.samples } : {}) });
    done.set(id, r);
    const out: WireResult = { ...(await wire(r)), meta: r.meta, body: r.body, ms: Math.round(performance.now() - t0) };
    if (r.glow) out.glow = await wire(r.glow);
    return out;
  },
  sheet,
  gl: () => {
    const gl = art().renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  },
};
