import { ownedIds, plan } from '../kit';

/**
 * Units category: every drone kind (two rotor frames each) and the drone shadow, the freighter and its shadow, the cargo crate.
 * Every owned id is listed in docs/art.md; ids without a model keep their SVG art in the game.
 */
plan(ownedIds('units'));

import './drones';
