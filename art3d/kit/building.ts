import { Box3, DoubleSide, Mesh, Plane, Vector3, type Material, type Object3D } from 'three';
import { content } from '../../src/legacy/content';
import { BUILD_STAGES, buildingId, buildingStageId, scaffoldId } from '../../src/legacy/art/buildings';
import { emissive, MAT } from './palette';
import { Kit, sprite } from './registry';
import { group, strut, type V } from './shapes';

/**
 * Buildings: one model function per art kind gives the whole building at a level; this file turns it into the
 * game's sprites, so every artist's buildings rise, weld and stand in scaffolds the same way:
 * - `building-<kind>-<level>` for every level (the model adds parts per level)
 * - `building-<kind>-stage-<0..3>`: the level-1 body clipped at 16/40/64/86 % of its height, a glowing weld
 *   seam on the cut (it follows any shape), scaffold poles around the footprint; no lights (it is a site)
 * - `scaffold-<w>x<h>`: the scaffold that stands around a building while it is upgraded
 */

export interface BuildingParts {
  /** Ground-level parts that stand complete from the first stage (pads, foundations). */
  pad?: Object3D;
  /** Everything that rises while drones build it. */
  body: Object3D;
}

export type BuildingModel = (k: Kit, level: number) => BuildingParts;

/** Same cuts as the SVG art (render/art/buildings.ts STAGE_CUTS). */
export const STAGE_CUTS = [0.16, 0.4, 0.64, 0.86] as const;

/** The hot weld seam on a construction cut. */
const SEAM = emissive('#ffe9a8', 3.2);

function clipped(mat: Material, planes: Plane[], extra: Partial<Material> = {}): Material {
  const m = mat.clone();
  m.clippingPlanes = planes;
  m.clipShadows = true;
  m.side = DoubleSide;
  Object.assign(m, extra);
  return m;
}

/** Clips every mesh under `root` at height `cut` (keeps y <= cut) and returns a glowing seam band at the cut. */
export function clipAt(root: Object3D, cut: number, seam = 0.022): Object3D {
  const keep = [new Plane(new Vector3(0, -1, 0), cut)];
  const band = [new Plane(new Vector3(0, -1, 0), cut), new Plane(new Vector3(0, 1, 0), -(cut - seam))];
  const seams: Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.material = clipped(o.material as Material, keep);
    const s = new Mesh(o.geometry, clipped(SEAM, band, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    s.matrixAutoUpdate = false;
    s.matrix.copy(o.matrixWorld);
    seams.push(s);
  });
  return group(...seams);
}

/** Scaffold around a footprint (w x d tiles): corner poles, a steel mid rail, a yellow top rail, cross braces. */
export function scaffoldModel(w: number, d: number, height: number): Object3D {
  const hx = w / 2 - 0.06;
  const hz = d / 2 - 0.06;
  const corners: V[] = [
    [-hx, 0, -hz],
    [hx, 0, -hz],
    [hx, 0, hz],
    [-hx, 0, hz],
  ];
  const parts: Object3D[] = [];
  corners.forEach(([x, , z], i) => {
    const [nx, , nz] = corners[(i + 1) % 4]!;
    parts.push(strut([x, 0, z], [x, height, z], 0.022, MAT.steel, 8));
    parts.push(strut([x, height * 0.5, z], [nx, height * 0.5, nz], 0.016, MAT.steel, 8));
    parts.push(strut([x, height, z], [nx, height, nz], 0.024, MAT.hazard, 8));
    parts.push(strut([x, 0.02, z], [nx, height * 0.5, nz], 0.01, MAT.gunmetal, 6));
  });
  return group(...parts);
}

function footprint(kind: string): { w: number; h: number } {
  return content.buildings.get(kind).footprint;
}

/** Height of the top of an object (model units). */
export function topOf(o: Object3D): number {
  o.updateMatrixWorld(true);
  return new Box3().setFromObject(o, true).max.y;
}

function stageModel(model: BuildingModel, kind: string, stage: number, k: Kit): Object3D {
  const m = model(new Kit(), 1);
  const cut = topOf(m.body) * STAGE_CUTS[stage]!;
  const seam = clipAt(m.body, cut);
  const fp = footprint(kind);
  k.top(cut);
  return group(...(m.pad ? [m.pad] : []), m.body, seam, scaffoldModel(fp.w, fp.h, cut + 0.14));
}

/** Registers every level and construction stage of a building kind from its model function. */
export function building(kind: string, model: BuildingModel, opts: { stages?: boolean; levels?: number[] } = {}): void {
  const def = content.buildings.get(kind);
  for (let level = 1; level <= def.maxLevel; level++) {
    if (opts.levels && !opts.levels.includes(level)) continue;
    sprite({
      id: buildingId(kind, level),
      build: (k) => {
        const m = model(k, level);
        return group(...(m.pad ? [m.pad] : []), m.body);
      },
    });
  }
  if (opts.stages === false) return;
  for (let s = 0; s < BUILD_STAGES; s++) sprite({ id: buildingStageId(kind, s), build: (k) => stageModel(model, kind, s, k) });
}

/** Registers the upgrade scaffold for a footprint size. */
export function scaffoldSprite(w: number, d: number): void {
  sprite({ id: scaffoldId(w, d), build: () => scaffoldModel(w, d, 0.8 + (w + d) * 0.08), shadow: 0.35 });
}
