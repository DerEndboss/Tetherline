import { ownedIds, plan } from '../kit';
import './core';
import './storage';

/**
 * Base category (v2): the core in three stages (3x3 growing), container and vault, `building-<id>`. docs/art.md
 * lists the ids. `building-storage-1` (the v1 depot) stays until the other parts stop using it as a placeholder.
 */
plan(ownedIds('base'));
