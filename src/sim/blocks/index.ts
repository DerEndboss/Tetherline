import type { Behaviour } from '../../content/types';
import { conveyor } from './conveyor';
import { generator, passivePower, powerNode } from './energy';
import { liquidBridge, liquidMember, pump } from './fluid';
import { crafter, drill } from './production';
import { junction, overflow, router, sorter } from './routing';
import { core, storage } from './storage';
import { bridge, massDriver, unloader } from './transport';
import { BLOCKS } from './registry';
import type { BlockBehaviour } from './types';

/** The code of every behaviour. A new building of an existing behaviour needs no entry here. */
const TABLE: Record<Behaviour, BlockBehaviour> = {
  core,
  storage,
  drill,
  pump,
  conveyor,
  junction,
  router,
  sorter,
  overflow,
  bridge,
  unloader,
  'mass-driver': massDriver,
  crafter,
  generator,
  solar: passivePower,
  battery: passivePower,
  'power-node': powerNode,
  conduit: liquidMember,
  'liquid-junction': liquidMember,
  'liquid-router': liquidMember,
  tank: liquidMember,
  'liquid-bridge': liquidBridge,
  // Mega buildings: staged crafters (the Space Elevator); the Fusion Reactor is a generator, the accelerator a crafter.
  mega: crafter,
};
Object.assign(BLOCKS, TABLE);

export { BLOCKS };

export type { BlockBehaviour, TickContext } from './types';
