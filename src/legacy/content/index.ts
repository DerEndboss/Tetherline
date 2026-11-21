import type { RawContent } from './types';
import { materials } from './materials';
import { currencies } from './currencies';
import { stats } from './stats';
import { recipes } from './recipes';
import { alloys } from './alloys';
import { buildings } from './buildings';
import { belts } from './belts';
import { freighters } from './freighters';
import { upgrades } from './upgrades';
import { obstacles } from './obstacles';
import { drones } from './drones';
import { techs } from './techs';
import { skillBranches, skills } from './skills';
import { relics } from './relics';
import { worlds } from './worlds';
import { rules } from './rules';
import { createRegistry } from './registry';

/** All content as raw lists. Add entries in the kind folders; this file only gathers them. */
export const rawContent: RawContent = {
  materials,
  currencies,
  stats,
  recipes,
  alloys,
  buildings,
  belts,
  freighters,
  upgrades,
  obstacles,
  drones,
  techs,
  skillBranches,
  skills,
  relics,
  worlds,
  rules,
};

/** The validated-by-test registry the game runs on. */
export const content = createRegistry(rawContent);

export type { ContentRegistry } from './registry';
