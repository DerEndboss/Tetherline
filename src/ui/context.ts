import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AudioEngine } from '../audio/engine';
import type { Game } from '../game/game';
import type { Interaction, InteractionView } from '../game/interaction';
import type { Snapshot } from '../game/snapshot';
import type { Preferences, PreferenceStore } from '../settings/preferences';
import type { RunOptions } from '../sim/newgame';
import type { World } from '../sim/world';

/** What the UI may call into: the game (commands), the tools, the device preferences and the run/slot actions. */
export interface GameServices {
  game: Game;
  interaction: Interaction;
  audio: AudioEngine;
  preferences: PreferenceStore;
  /** Menu state: open (game paused behind it) or closed. */
  menu: { open: () => void; close: () => void; subscribe: (l: () => void) => () => void; isOpen: () => boolean; isPaused?: () => boolean; togglePause?: () => void };
  /** Starts a new run in a slot (saves first; a theme change reloads the page). */
  newRun: (opts: RunOptions, slot: number) => Promise<void>;
  /** Loads a slot's run. */
  loadSlot: (slot: number) => Promise<void>;
  saveNow: () => Promise<void>;
}

export const GameContext = createContext<GameServices | null>(null);

export function useServices(): GameServices {
  const services = useContext(GameContext);
  if (!services) throw new Error('GameContext missing');
  return services;
}

export function useMuted(): boolean {
  const { audio } = useServices();
  return useSyncExternalStore(audio.subscribe, () => audio.isMuted());
}

export function usePreferences(): Preferences {
  const { preferences } = useServices();
  return useSyncExternalStore(preferences.subscribe, preferences.get);
}

/** The throttled (~10 Hz) snapshot of the game. */
export function useSnapshot(): Snapshot {
  const { game } = useServices();
  return useSyncExternalStore(game.subscribe, game.getSnapshot);
}

export function useInteraction(): InteractionView {
  const { interaction } = useServices();
  return useSyncExternalStore(interaction.subscribe, interaction.getView);
}

export function useMenuOpen(): boolean {
  const { menu } = useServices();
  return useSyncExternalStore(menu.subscribe, menu.isOpen);
}

/**
 * Reads anything from the world at the snapshot pace (10 Hz) without adding to snapshot.ts: parts write their
 * selectors in their own folders. The selector must return a value that compares equal (`Object.is`) while
 * nothing changed (a number, a string, or an object kept stable by the caller), or the component re-renders on
 * every snapshot.
 */
export function useWorldSelector<T>(select: (w: World) => T): T {
  const { game } = useServices();
  useSnapshot();
  return select(game.world);
}
