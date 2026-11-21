import { AnimatedNumber } from '../components/AnimatedNumber';
import { Presence } from '../components/Presence';
import { useServices, useSnapshot } from '../context';
import { MAX_DRONES, canAfford, helperPrice, nextPrice, TRACKS } from '../../sim/drones';
import { ToolIcon } from '../tools/icons';
import { useCompact } from '../tools/compact';
import { useEscapeClose } from '../tools/escape';
import { useFollowCursor } from './hooks';
import { DronePanel } from './DronePanel';
import { setDroneUi, useDroneUi } from './store';

/** How many things the core could pay for right now: upgrades and a helper. Shown on the chip so it can say "go and look". */
function affordableCount(world: ReturnType<typeof useServices>['game']['world']): number {
  let n = 0;
  for (const t of TRACKS) {
    const price = nextPrice(world, t.id);
    if (price && canAfford(world, price)) n++;
  }
  const helper = helperPrice(world);
  return helper && canAfford(world, helper) ? n + 1 : n;
}

/**
 * The drones module of the HUD: a lit chip under the core window (the drone count, a badge when something can be
 * bought, a dot while a drone works) that opens the drone window with upgrades, helpers and standing orders.
 * Phones: a square plate on the left edge, and the window rises from below as a sheet.
 */
export function DronesHud() {
  const { game } = useServices();
  const { open } = useDroneUi();
  const compact = useCompact();
  useSnapshot();
  useFollowCursor();
  const world = game.world;
  const count = world.state.drones.length;
  const busy = world.state.drones.some((d) => (d.act ?? 'idle') !== 'idle');
  const buyable = affordableCount(world);
  const close = (): void => setDroneUi({ open: false });
  useEscapeClose(open, close);
  return (
    <div className="dock-drones">
      <button
        type="button"
        className="hud-card dr-chip k-press"
        aria-expanded={open}
        aria-label={`Drones, ${count} of ${MAX_DRONES}${buyable ? `, ${buyable} to buy` : ''}`}
        data-tip={buyable ? `Drones: ${buyable} upgrade${buyable === 1 ? '' : 's'} you can pay for` : 'Drones: upgrades, helpers and orders'}
        data-tip-side="right"
        data-busy={busy}
        onClick={() => setDroneUi({ open: !open })}
      >
        <span className="k-plaque dr-chip-icon">
          <ToolIcon name="drone" size={22} />
        </span>
        <span className="dr-chip-count">
          <AnimatedNumber value={count} pop="up" tween={false} />
          <span className="dr-chip-max">/{MAX_DRONES}</span>
        </span>
        {buyable > 0 && <span className="k-badge dr-chip-badge">{buyable}</span>}
      </button>
      <Presence open={open} from={compact ? 'up' : 'left'} className="hud-card dr-panel" role="dialog" aria-label="Drones">
        <DronePanel onClose={close} />
      </Presence>
    </div>
  );
}
