import { ownedIds, plan } from '../kit';
import './reactor';
import './accelerator';
import './elevator';

/**
 * Category "mega" (docs/architecture.md): fusion reactor, particle accelerator and the
 * space elevator in stages, `building-<id>` plus work frames `-w<i>` (and `-s1..s3` for the elevator's stages).
 */
plan(ownedIds('mega'));
