import { plan } from '../kit';
import { decoIds } from '../../src/render/deco/ids';
import './props';

/**
 * Deco category: the props and junction boxes of the automatic deco wiring (src/render/deco/). Not part of the
 * game's start atlas: the deco layer loads public/art/deco/manifest.json itself and bakes its own small atlas.
 */
plan(decoIds());
