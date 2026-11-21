import { metaStore } from '../save/meta';
import { Presence } from './components/Presence';
import { TipLayer } from './components/TipLayer';
import { useMenuOpen } from './context';
import { Hud } from './hud/Hud';
import { bootLoading } from './progression/loading';
import { MainMenu } from './progression/MainMenu';

// A reload from "new world" or "switch view" shows the loading screen at once, before the game is ready.
bootLoading();
// The meta tree loads while the world is being made, so a run's first tick already knows its bonuses.
void metaStore.load();

/**
 * The UI over the world: the main menu (game paused behind it) or the HUD. Both fade over each other (the closing
 * one lets clicks through at once), and the one shared kit tooltip lives here.
 */
export function App() {
  const menu = useMenuOpen();
  return (
    <>
      <Presence open={!menu} from="fade" className="app-layer app-layer-hud">
        <Hud />
      </Presence>
      <Presence open={menu} from="fade" className="app-layer app-layer-menu">
        <MainMenu />
      </Presence>
      <TipLayer />
    </>
  );
}

export function BootError({ message }: { message: string }) {
  return (
    <div className="boot" role="alert">
      <div className="boot-error">
        <p className="boot-title">The landing failed</p>
        <p>{message}</p>
        <p>Reload the page to try again.</p>
      </div>
    </div>
  );
}
