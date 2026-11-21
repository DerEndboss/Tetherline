import type { SpriteMeta } from './art/svg';
import { viewMode, type ViewMode } from './iso';

/**
 * Pre-rendered 3D art (docs/art.md). `npm run art` renders the models in art3d/<category>/ into
 * public/art/<category>/<id>.webp and writes one manifest per category, so artists working in parallel never
 * touch each other's files. At boot the game merges the category manifests; a sprite id found there is drawn
 * from its image, every other id keeps its SVG art. Pure data and fetch: no Pixi, usable by the UI.
 * The steep and the top view (iso.ts `viewMode`) lay their own set, public/art/<category>/steep/ or /top/
 * (`manifest.json` each), over the iso set: fixed-box sprites (icons, particles, sky) only exist in the iso set
 * and stay as they are.
 */

export const ART_CATEGORIES = ['base', 'production', 'power', 'units', 'nature', 'icons', 'terrain', 'logistics', 'liquids', 'mining', 'factories', 'mega'] as const;
export type ArtCategory = (typeof ART_CATEGORIES)[number];

/** One rendered sprite as the manifest stores it. Sizes in world px, anchor as fractions (like SpriteArt). */
export interface ArtEntry {
  /** File name inside the category's folder for the view (a .webp; older sets may hold .png). */
  file: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  /** Image px per world px. */
  scale: number;
  /** Short content hash, used as a cache key in the URL. */
  hash: string;
  /** Optional smaller copy at half the scale (older sets only; new renders no longer write it). */
  half?: { file: string; hash: string; scale: number };
  /** Lights, hatch, top ... in world px relative to the anchor; overrides the SVG art's meta key by key. */
  meta?: SpriteMeta;
  /** The object without its shadow, world px relative to the anchor (UI crops thumbnails to it). */
  body?: { x: number; y: number; w: number; h: number };
}

export interface CategoryManifest {
  version: 1;
  category: ArtCategory;
  /** 'steep' or 'top' for those sets (public/art/<category>/steep/, .../top/); absent for the iso set. */
  view?: 'steep' | 'top';
  sprites: Record<string, ArtEntry>;
}

/** A manifest entry with the URLs to load it from. */
export interface ArtSprite extends ArtEntry {
  id: string;
  category: ArtCategory;
  url: string;
  halfUrl?: string;
}

/** The URL with the fewest texels that still holds `scale` texels per world px. */
export function artUrl(s: ArtSprite, scale: number): string {
  return s.halfUrl && s.half && scale <= s.half.scale ? s.halfUrl : s.url;
}

export type ArtManifest = ReadonlyMap<string, ArtSprite>;

/** Folder of a view's sprite set below public/art/<category>/ ('' for iso, 'steep/', 'top/'). */
export function artSubdir(view: ViewMode): string {
  return view === 'iso' ? '' : `${view}/`;
}

const EMPTY: ArtManifest = new Map();

async function loadCategory(base: string, category: ArtCategory, sub = ''): Promise<ArtSprite[]> {
  try {
    const dir = `${base}${category}/${sub}`;
    const res = await fetch(`${dir}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const m = (await res.json()) as CategoryManifest;
    if (m.version !== 1 || !m.sprites) return [];
    return Object.entries(m.sprites).map(([id, e]) => ({
      ...e,
      id,
      category,
      url: `${dir}${e.file}?v=${e.hash}`,
      ...(e.half ? { halfUrl: `${dir}${e.half.file}?v=${e.half.hash}` } : {}),
    }));
  } catch {
    return [];
  }
}

let loading: Promise<ArtManifest> | null = null;
let loadedView: ViewMode | null = null;

/** Every category's sprites of one set ('' = iso, 'steep/', 'top/'). */
function loadSet(base: string, sub: string): Promise<ArtSprite[]> {
  return Promise.all(ART_CATEGORIES.map((c) => loadCategory(base, c, sub))).then((lists) => lists.flat());
}

/**
 * Loads and merges every category's manifest once per view (missing categories are empty); in the steep and top
 * views their own set overrides the iso set id by id. Never rejects: without a manifest the game simply draws its SVG art.
 */
export function loadArtManifest(base = 'art/'): Promise<ArtManifest> {
  if (typeof fetch !== 'function') return Promise.resolve(EMPTY);
  const view = viewMode();
  if (loading && loadedView === view) return loading;
  loadedView = view;
  const sets = view === 'iso' ? [loadSet(base, '')] : [loadSet(base, ''), loadSet(base, artSubdir(view))];
  loading = Promise.all(sets).then((lists) => new Map(lists.flat().map((s) => [s.id, s])));
  return loading;
}

/** Sprite meta of an SVG sprite overridden by the 3D model's, key by key. */
export function mergeMeta(svg: SpriteMeta | undefined, art: SpriteMeta | undefined): SpriteMeta | undefined {
  if (!art) return svg;
  return { ...svg, ...art };
}
