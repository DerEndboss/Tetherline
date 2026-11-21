import { useSyncExternalStore } from 'react';
import { setWorldSetting, subscribeWorldSettings, worldSettings } from '../../render/world/settings';
import { Switch } from '../tools/Switch';

/** render-world's settings: decoration (cables, props) and lighting on or off, per device. */
export function WorldSettings() {
  const s = useSyncExternalStore(subscribeWorldSettings, worldSettings);
  return (
    <section className="set-group" aria-label="World">
      <h4 className="set-title">World</h4>
      <Switch label="Decoration" hint="Cables, racks and props around your build. Looks only." checked={s.decoration} onChange={(v) => setWorldSetting('decoration', v)} />
      <Switch label="Lighting" hint="Warm light around your base, a little darker elsewhere." checked={s.lighting} onChange={(v) => setWorldSetting('lighting', v)} />
    </section>
  );
}
