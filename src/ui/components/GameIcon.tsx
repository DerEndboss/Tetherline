import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { artUrl, loadArtManifest, type ArtManifest, type ArtSprite } from '../../render/art-manifest';

/**
 * Pre-rendered 3D art in the UI: the same manifest the world bakes from (public/art/<category>/manifest.json,
 * docs/art.md). Icons are 3D objects rendered on a transparent background; world sprites (buildings, drones)
 * can be cropped to their object without its shadow. While the manifest loads, or for ids without a model, the
 * `fallback` shows (the SVG art), so the UI never waits on art.
 */

let manifest: ArtManifest | null = null;
const listeners = new Set<() => void>();
let started = false;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    void loadArtManifest().then((m) => {
      manifest = m;
      for (const l of listeners) l();
    });
  }
  return () => listeners.delete(listener);
}

/** The merged art manifest, or null while it loads. */
export function useArtManifest(): ArtManifest | null {
  return useSyncExternalStore(subscribe, () => manifest, () => null);
}

/** Position of a sprite's image inside a `size` square so that its object (`body`) fills and centres it. */
function cropStyle(e: ArtSprite, size: number): CSSProperties {
  const body = e.body ?? { x: -e.ax * e.w, y: -e.ay * e.h, w: e.w, h: e.h };
  const s = size / Math.max(body.w, body.h);
  return {
    position: 'absolute',
    width: e.w * s,
    height: e.h * s,
    maxWidth: 'none',
    left: -(body.x + e.ax * e.w) * s + (size - body.w * s) / 2,
    top: -(body.y + e.ay * e.h) * s + (size - body.h * s) / 2,
  };
}

export interface GameIconProps {
  /** Sprite id in the art manifest: icon-iron-ore, relic-star-seed, tech-solar-power, building-mine-1 ... */
  id: string;
  /** Square size in CSS px. */
  size?: number;
  /** Shown while the manifest loads or when the id has no 3D art yet. */
  fallback?: ReactNode;
  /** Crop a world sprite to its object (no shadow, no empty room); icons do not need it. */
  crop?: boolean;
  className?: string;
}

/** Texels per world px an image needs to fill `size` CSS px sharply (the half-size PNG is enough for small icons). */
function texels(e: ArtSprite, size: number, crop: boolean): number {
  const span = crop && e.body ? Math.max(e.body.w, e.body.h) : Math.max(e.w, e.h);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return (size * dpr) / span;
}

/** A 3D-rendered icon from the art manifest, or its fallback. */
export function GameIcon({ id, size = 24, fallback = null, crop = false, className = 'game-icon' }: GameIconProps) {
  const entry = useArtManifest()?.get(id);
  if (!entry) return <>{fallback}</>;
  const src = artUrl(entry, texels(entry, size, crop));
  if (!crop) return <img className={className} src={src} width={size} height={size} alt="" draggable={false} />;
  return (
    <span className={className} style={{ position: 'relative', display: 'inline-block', overflow: 'hidden', width: size, height: size, flex: 'none' }}>
      <img src={src} style={cropStyle(entry, size)} alt="" draggable={false} />
    </span>
  );
}
