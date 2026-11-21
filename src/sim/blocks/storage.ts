import { deliverToCore, isCoreStock, storageInfo, storeInCore } from '../storage';
import type { BlockBehaviour } from './types';

/** The core: takes every item; everything in it can be built with, and what does not fit is burned. */
export const core: BlockBehaviour = {
  accept: () => true,
  handle: (w, _b, item) => deliverToCore(w, item),
};

/**
 * Container / vault. Touching the core it docks: it adds its room to the core and hands what it held over;
 * standing alone it is a store of its own (unloaders take from it).
 */
export const storage: BlockBehaviour = {
  accept: (w, b, item) => isCoreStock(w, b) || (b.items[item] ?? 0) < (w.def(b).storage?.capacity ?? 0),
  handle: (w, b, item) => {
    if (isCoreStock(w, b)) deliverToCore(w, item);
    else b.items[item] = (b.items[item] ?? 0) + 1;
  },
  update: (w, b) => {
    if (!storageInfo(w).docked.has(b.id)) return;
    for (let i = 0; i < b.items.length; i++) {
      const n = b.items[i]!;
      if (n > 0) b.items[i] = n - storeInCore(w, i, n);
    }
  },
};
