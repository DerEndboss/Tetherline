import type { Id } from '../content/types';
import type { Dir } from './state';

/** A ghost to queue: building id, top-left tile, rotation, optional config. */
export interface PlanSpec {
  kind: Id;
  x: number;
  y: number;
  rot: Dir;
  config?: number;
}

/** An inclusive rectangle of tiles. */
export interface TileBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Player input by type. An interface (not a union) so a module can add its own commands from its folder with
 * module augmentation (`declare module '../commands' { interface CommandMap { 'drone-go': {...} } }`) and
 * `registerCommand` in tick.ts, without touching this file.
 */
export interface CommandMap {
  /** Queue a ghost (the drone builds it). */
  place: PlanSpec;
  /** Queue many ghosts at once (a dragged belt line, a pasted blueprint). */
  'place-many': { plans: PlanSpec[] };
  /** Mark buildings in a rectangle for removal and drop ghosts there. */
  remove: TileBox;
  /** Drop ghosts in a rectangle without touching buildings. */
  cancel: TileBox;
  rotate: { id: number; rot: Dir };
  /** Sorter/unloader item (material index), crafter recipe index; -1 clears. */
  configure: { id: number; value: number };
  /** Bridge or mass driver partner, or a power node laser link (toggles). */
  link: { id: number; target: number };
  /** Remove dust boulders in a rectangle. */
  'clear-boulders': TileBox;
  /** Remove the decoration on a tile (Backspace / right click on deco); it stays gone in this run. */
  'remove-deco': { x: number; y: number };
  /** Salvage the wreck around a tile: its blueprint unlocks a building for this run, plus some scrap. */
  salvage: { x: number; y: number };
  /** Start upgrading the core to its next stage (in place). */
  'upgrade-core': object;
  /** Development: put items into the core. */
  'dev-give': { item: Id; n: number };
}

export type CommandType = keyof CommandMap;
export type Command = { [K in CommandType]: { type: K } & CommandMap[K] }[CommandType];
export type CommandOf<K extends CommandType> = { type: K } & CommandMap[K];

/** What happened in a tick, for renderer, audio and UI (never read back by the sim). Augmentable like CommandMap. */
export interface EventMap {
  site: { id: number };
  built: { id: number; kind: number };
  removed: { id: number; kind: number; x: number; y: number };
  crafted: { id: number; item: number };
  mined: { id: number; item: number };
  shot: { from: number; to: number; n: number };
  'plan-dropped': { kind: number; x: number; y: number; reason: string };
  'core-upgraded': { id: number; kind: number };
  'order-done': { id: Id };
  'wreck-salvaged': { building: Id; x: number; y: number };
  won: object;
}

export type SimEvent = { [K in keyof EventMap]: { type: K } & EventMap[K] }[keyof EventMap];
