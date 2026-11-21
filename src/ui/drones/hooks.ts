import { useEffect } from 'react';
import { canSupply } from '../../sim/drones/haul';
import { droneCommand } from '../../sim/drones';
import { useServices } from '../context';
import { useDroneUi } from './store';

const FOLLOW_EVERY_MS = 450;
const FOLLOW_MIN_STEP = 2.5;

/**
 * While `picking`, a click on the world marks (or unmarks) the machine under the mouse for supply instead of
 * reaching the build tools. Escape or a right click ends it. Clicks on the HUD are left alone.
 */
export function useSupplyPick(picking: boolean, done: () => void): void {
  const { game, interaction } = useServices();
  useEffect(() => {
    if (!picking) return undefined;
    document.body.classList.add('drone-picking');
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) return done();
      if (e.button !== 0 || !(e.target instanceof Element) || !e.target.closest('#world')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const h = interaction.hover;
      const b = h ? game.world.at(h.x, h.y) : undefined;
      if (b && canSupply(game.world, b)) game.enqueue(droneCommand('drone-supply', { id: b.id }));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('drone-picking');
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [picking, done, game, interaction]);
}

/** An idle player drone follows the mouse: sends its focus now and then, and only when the pointer moved on. */
export function useFollowCursor(): void {
  const { game, interaction } = useServices();
  const { follow } = useDroneUi();
  useEffect(() => {
    if (!follow) {
      game.enqueue(droneCommand('drone-focus', { x: 0, y: 0, on: false }));
      return undefined;
    }
    let last = { x: -99, y: -99 };
    const id = window.setInterval(() => {
      const h = interaction.hover;
      const w = game.world;
      const idle = w.state.plans.length === 0 && (w.state.drones[0]?.act ?? 'idle') === 'idle';
      if (!h || !idle || Math.hypot(h.x - last.x, h.y - last.y) < FOLLOW_MIN_STEP) return;
      last = h;
      game.enqueue(droneCommand('drone-focus', { x: h.x + 0.5, y: h.y + 0.5, on: true }));
    }, FOLLOW_EVERY_MS);
    return () => window.clearInterval(id);
  }, [follow, game, interaction]);
}
