import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import { obstacles } from '../../src/legacy/content/obstacles';
import { worlds } from '../../src/legacy/content/worlds';
import { TECH } from '../../src/legacy/art/tech';

/**
 * The shared palette of the 3D art. Colours come from the game's data (world palette, obstacle colours,
 * the player's tech colours in src/legacy/art/tech.ts), so world, UI and 3D sprites agree. Every model uses
 * these materials instead of inventing its own; docs/art.md explains when to use which.
 */

export const WORLD = worlds[0]!.palette;

/** Colours of the look (hex strings, sRGB). */
export const COLORS = {
  hull: TECH.hull,
  hullShade: TECH.hullDark,
  panel: TECH.panel,
  deep: '#1b2244',
  steel: '#a3afcc',
  gunmetal: '#454d75',
  accent: TECH.accent,
  beacon: TECH.beacon,
  tech: WORLD.tech,
  glass: '#132042',
  solar: TECH.solar,
  gold: '#ffd98a',
  rubber: '#23263c',
  hazard: '#ffd166',
  power: TECH.power,
  shadow: WORLD.shadow,
  light: WORLD.light,
  horizon: WORLD.sky.horizon,
  skyTop: WORLD.sky.top,
  skyMid: WORLD.sky.mid,
} as const;

/** Marks a material as emissive for the glow pass (its emissive colour shines into the `-glow` sprite). */
function glowing<T extends Material>(m: T): T {
  m.userData.glow = true;
  return m;
}

interface Finish {
  rough: number;
  metal?: number;
  coat?: number;
  flat?: boolean;
}

/** A physically based surface in one of the palette's finishes. */
export function surface(color: string, f: Finish): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: f.rough,
    metalness: f.metal ?? 0,
    clearcoat: f.coat ?? 0,
    clearcoatRoughness: 0.25,
    flatShading: f.flat ?? false,
  });
}

/** A self-lit material: windows, lamps, screens, crystal cores. `power` > 1 blooms. */
export function emissive(color: string, power = 2.2): MeshStandardMaterial {
  return glowing(new MeshStandardMaterial({ color: new Color('#000000'), emissive: new Color(color), emissiveIntensity: power, roughness: 0.4 }));
}

/** Glossy surface that also glows faintly from inside (lit glass, energy rings). */
export function glowSurface(color: string, glowColor: string, power = 0.8, flat = false): MeshPhysicalMaterial {
  const m = surface(color, { rough: 0.18, coat: 1, flat });
  m.emissive = new Color(glowColor);
  m.emissiveIntensity = power;
  return glowing(m);
}

/** The player's technology: one set of finishes shared by every building, drone and part. */
export const MAT = {
  /** Off-white ceramic hull, glossy. The main body colour of everything the player builds. */
  hull: surface(COLORS.hull, { rough: 0.3, coat: 0.35 }),
  /** Slate blue trim, bands and secondary plates. */
  trim: surface(COLORS.hullShade, { rough: 0.4, coat: 0.3, metal: 0.2 }),
  /** Navy panels, bases and pads. */
  panel: surface(COLORS.panel, { rough: 0.5, metal: 0.25, coat: 0.2 }),
  /** Recesses, vents, inner walls: almost black navy. */
  deep: surface(COLORS.deep, { rough: 0.7, metal: 0.2 }),
  /** Bright machined metal: pistons, rails, drill bits. */
  steel: surface(COLORS.steel, { rough: 0.32, metal: 0.6, coat: 0.3 }),
  /** Darker structural metal: frames, legs, greebles. */
  gunmetal: surface(COLORS.gunmetal, { rough: 0.4, metal: 0.45, coat: 0.2 }),
  /** The one orange accent: stripes, caps, handles. */
  accent: surface(COLORS.accent, { rough: 0.32, coat: 0.8 }),
  /** Hazard yellow (scaffold rails, warning stripes). */
  hazard: surface(COLORS.hazard, { rough: 0.38, coat: 0.5 }),
  /** Rubber, cables, tyres. */
  rubber: surface(COLORS.rubber, { rough: 0.85 }),
  /** Dark reflective glass (domes, visors) that mirrors the sky. */
  glass: surface(COLORS.glass, { rough: 0.06, metal: 0.2, coat: 1 }),
  /** Solar cells: deep blue, glossy. */
  solar: surface(COLORS.solar, { rough: 0.12, metal: 0.45, coat: 1 }),
  /** Polished gold (top levels, crowns). */
  gold: surface(COLORS.gold, { rough: 0.22, metal: 1 }),
  /** The player's teal light. */
  tech: emissive(COLORS.tech, 2.4),
  /** Warm work lamp. */
  lamp: emissive('#ffd9a0', 2.6),
  /** Red beacon. */
  beacon: emissive(COLORS.beacon, 2.6),
  /** Molten / hot (smelters, weld seams). */
  ember: emissive('#ff8a3d', 2.4),
} as const;

/** Material colours of an obstacle kind from the content (main, shade, glow). */
export function obstacleColors(kind: string): { main: string; shade: string; glow: string } {
  const def = obstacles.find((o) => o.id === kind);
  if (!def) throw new Error(`Unknown obstacle kind ${kind}`);
  return { main: def.colors[0], shade: def.colors[1], glow: def.glow ?? def.colors[0] };
}

/**
 * Crystal: flat-shaded glossy facets lit from inside. Geometry may carry an `aGlow` attribute (0 at the root,
 * 1 at the tip; `crystal()` sets it): the inner light rises along it, and facets seen edge-on glow brighter
 * (a fresnel term), so a crystal reads as lit from within instead of painted.
 */
export function crystalMat(main: string, glow: string, power = 1.1): MeshPhysicalMaterial {
  const m = surface(main, { rough: 0.12, coat: 1, flat: true });
  m.emissive = new Color(glow);
  m.emissiveIntensity = power;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nvec3 toEye = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);\nfloat edge = 1.0 - abs(dot(toEye, normal));\ntotalEmissiveRadiance *= (0.12 + 0.88 * vGlow * vGlow) * (0.45 + 2.0 * pow(edge, 2.0));\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(dot(totalEmissiveRadiance, vec3(0.45))), 0.55 * pow(vGlow, 5.0));',
      );
  };
  m.customProgramCacheKey = () => 'crystal';
  return glowing(m);
}

/** Faceted rock in a colour: matte, flat shaded (low poly). */
export function rockMat(color: string, rough = 0.82): MeshPhysicalMaterial {
  return surface(color, { rough, flat: true, coat: 0.05 });
}

/** The ground tones of the world, low to high (violet to rust). */
export const GROUND = WORLD.ground;
