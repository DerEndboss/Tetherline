import { useEffect, useSyncExternalStore } from 'react';
import { metaStore, type MetaSave } from '../../save/meta';

/** The saved meta tree (Blueprints, owned nodes, counters); loads it on first use. */
export function useMeta(): MetaSave {
  useEffect(() => {
    void metaStore.load();
  }, []);
  return useSyncExternalStore(metaStore.subscribe, metaStore.get);
}
