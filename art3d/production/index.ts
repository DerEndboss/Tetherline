import { ownedIds, plan } from '../kit';
import './mine';
import './smelter';
import './mixer';
import './fabricator';
import './print';

plan(ownedIds('production'));
