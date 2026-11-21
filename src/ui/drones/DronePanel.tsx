import { useCallback, useRef, useState } from 'react';
import { droneCommand, canAfford, fleetStats, helperPrice, MAX_DRONES, MAX_LEVEL, nextPrice, opsOf, TRACKS, techOf, type Price } from '../../sim/drones';
import type { DroneTrack } from '../../sim/drones';
import { useFlashOnChange } from '../components/AnimatedNumber';
import { Icon } from '../components/Icon';
import { tip } from '../components/TipLayer';
import { useServices, useSnapshot } from '../context';
import { ToolIcon, type ToolIconName } from '../tools/icons';
import { Switch } from '../tools/Switch';
import { Cost } from './Cost';
import { useSupplyPick } from './hooks';
import { oresOnMap } from './ores';
import { describeDrone, droneTone } from './status';
import { setDroneUi, useDroneUi } from './store';

const TRACK_ICONS: Record<DroneTrack, ToolIconName> = { speed: 'rotor', build: 'servo', cargo: 'cargo', reach: 'reach' };

function Fleet() {
  const { game } = useServices();
  const w = game.world;
  return (
    <ul className="dr-fleet" aria-label="Your drones">
      {w.state.drones.map((d, i) => (
        <li key={d.id} className="dr-drone" data-tone={droneTone(d)}>
          <span className={i === 0 ? 'k-plaque dr-drone-icon player' : 'k-plaque dr-drone-icon'}>
            <ToolIcon name="drone" size={18} />
          </span>
          <span className="dr-drone-name">{i === 0 ? 'Your drone' : `Helper ${i}`}</span>
          <span className="dr-drone-state">{describeDrone(w, d)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Level pips: the lit ones glow, the newest one pops when an upgrade lands. */
function Pips({ level, label }: { level: number; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useFlashOnChange(ref, level, 'up', 0);
  return (
    <span ref={ref} className="dr-pips k-num" role="img" aria-label={`${label}: level ${level} of ${MAX_LEVEL}`}>
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <i key={i} className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
}

/** What a purchase needs: the price chips and the button; fully upgraded shows a lit badge instead. */
function Buy({ price, label, primary, onBuy }: { price: Price[] | null; label: string; primary?: boolean; onBuy: () => void }) {
  const { game } = useServices();
  if (!price) return null;
  const ok = canAfford(game.world, price);
  return (
    <div className="dr-buy">
      <Cost price={price} />
      <button type="button" className={primary ? 'button button-primary dr-button' : 'button button-go dr-button'} aria-disabled={!ok} {...(ok ? {} : tip('Not enough in the core yet'))} onClick={() => ok && onBuy()}>
        {label}
      </button>
    </div>
  );
}

function Upgrades() {
  const { game } = useServices();
  const w = game.world;
  const tech = techOf(w);
  const stats = fleetStats(w);
  return (
    <section className="dr-section" aria-label="Upgrades">
      <h3 className="dr-title">Upgrades</h3>
      {TRACKS.map((t) => {
        const price = nextPrice(w, t.id);
        const level = tech[t.id];
        const state = !price ? 'max' : canAfford(w, price) ? 'ready' : 'short';
        return (
          <div key={t.id} className="dr-upgrade" data-state={state}>
            <span className="k-plaque dr-up-icon">
              <ToolIcon name={TRACK_ICONS[t.id]} size={22} />
            </span>
            <div className="dr-up-main">
              <div className="dr-up-line">
                <b className="dr-up-name">{t.name}</b>
                <Pips level={level} label={t.name} />
              </div>
              <span className="dr-up-effect">
                {t.effect}
                {t.id === 'cargo' ? ` (now ${stats.cargo})` : ''}
              </span>
            </div>
            {price ? <Buy price={price} label="Upgrade" onBuy={() => game.enqueue(droneCommand('drone-upgrade', { track: t.id }))} /> : <span className="k-chip dr-maxed">Fully upgraded</span>}
          </div>
        );
      })}
    </section>
  );
}

/** Five slots: the drones that fly are lit, the rest wait for their price. */
function Slots({ count }: { count: number }) {
  return (
    <div className="dr-slots" role="img" aria-label={`${count} of ${MAX_DRONES} drones`}>
      {Array.from({ length: MAX_DRONES }, (_, i) => (
        <span key={i} className={i < count ? 'dr-slot on' : 'dr-slot'}>
          {i < count ? <ToolIcon name="drone" size={18} /> : <ToolIcon name="plus" size={14} />}
        </span>
      ))}
    </div>
  );
}

function Helpers() {
  const { game } = useServices();
  const w = game.world;
  const price = helperPrice(w);
  const count = w.state.drones.length;
  return (
    <section className="dr-section" aria-label="Helper drones">
      <h3 className="dr-title">
        Helpers <span className="k-chip">{count} / {MAX_DRONES}</span>
      </h3>
      <Slots count={count} />
      <p className="dr-note">Helpers build, haul supplies and mine. One drone type does everything.</p>
      {price ? <Buy price={price} label="Build helper" primary onBuy={() => game.enqueue(droneCommand('drone-add', {}))} /> : <span className="k-chip dr-maxed">All five drones are flying</span>}
    </section>
  );
}

function Orders() {
  const { game } = useServices();
  const w = game.world;
  const ops = opsOf(w);
  const { follow } = useDroneUi();
  const [picking, setPicking] = useState(false);
  const stop = useCallback(() => setPicking(false), []);
  useSupplyPick(picking, stop);
  const mineValue = ops.mine === -1 ? 'auto' : ops.mine === -2 ? 'off' : (w.content.materials.list[ops.mine]?.id ?? 'auto');
  const onMap = oresOnMap(w);
  // only ores that lie on this map (and the one chosen already, whatever it is, so the field never lies)
  const raw = w.content.materials.list.filter((m) => m.kind === 'raw' && (onMap.has(m.id) || m.id === mineValue));
  return (
    <section className="dr-section" aria-label="Orders">
      <h3 className="dr-title">Orders</h3>
      <div className="dr-row">
        <button type="button" className="button dr-button dr-grow" aria-pressed={picking} onClick={() => setPicking(!picking)}>
          <ToolIcon name="pointer" size={16} />
          Supply a machine
        </button>
        <span className="k-chip" {...tip('Machines your helpers keep stocked')}>
          {ops.supply.length} marked
        </span>
        {ops.supply.length > 0 && (
          <button type="button" className="button button-quiet ibtn ibtn-sm" aria-label="Clear marked machines" {...tip('Clear marks')} onClick={() => game.enqueue(droneCommand('drone-supply', { id: -1 }))}>
            <ToolIcon name="close" size={14} />
          </button>
        )}
      </div>
      {picking && <p className="dr-note dr-picking">Click a machine in the world. Esc or right click to stop.</p>}
      <label className="dr-row dr-field">
        <span>Helpers mine</span>
        <select className="dr-select" value={mineValue} onChange={(e) => game.enqueue(droneCommand('drone-mine', { item: e.target.value }))}>
          <option value="auto">Whatever is scarce</option>
          <option value="off">Nothing</option>
          {raw.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <Switch label="Follow the mouse" hint="Your idle drone hovers where you point." checked={follow} onChange={(v) => setDroneUi({ follow: v })} />
      <div className="dr-row">
        <button type="button" className="button button-quiet dr-button dr-grow" {...tip('Stops hovering at the mouse and goes back to idle')} onClick={() => game.enqueue(droneCommand('drone-focus', { x: 0, y: 0, on: false }))}>
          Let it rest
        </button>
      </div>
    </section>
  );
}

/** The drone window: fleet status, upgrades, helpers and standing orders. Presence (index.tsx) puts it in and takes it out. */
export function DronePanel({ onClose }: { onClose: () => void }) {
  useSnapshot();
  return (
    <>
      <header className="k-head dr-head">
        <h2 className="k-title">Drones</h2>
        <button type="button" className="button button-quiet ibtn ibtn-sm dr-close" aria-label="Close drones" data-sound="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="dr-body k-scroll">
        <Fleet />
        <Upgrades />
        <Helpers />
        <Orders />
      </div>
    </>
  );
}
