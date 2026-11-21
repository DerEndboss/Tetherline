import '@fontsource-variable/manrope';
import './ui/styles/app.css';
import { UPDATE_PRIORITY } from 'pixi.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioEngine } from './audio/engine';
import { GameSound } from './audio/sound';
import { attachUiSounds } from './audio/ui-sounds';
import { content } from './content';
import { Game } from './game/game';
import { attachAutopilot } from './game/autopilot';
import { demoCommands } from './game/demo';
import { attachHotkeys, isTextEntry } from './game/hotkeys';
import { registerInspector } from './game/inspect/inspect';
import { probes } from './game/tools/sink';
import { TutorialGuide } from './tutorial';
import { ConfigHud } from './ui/config';
import { Interaction } from './game/interaction';
import { FramePerf } from './game/perf';
import { decoAt, tapDeco } from './render/deco/pick';
import { isViewMode, setViewMode, tileInView } from './render/iso';
import { WorldView } from './render/world/view';
import { startAutosave } from './save/autosave';
import { fromSaveRecord, toSaveRecord } from './save/serialize';
import { listSlots, readSlot, writeSlot } from './save/slots';
import { PreferenceStore } from './settings/preferences';
import './sim/drones';
import { beltLine, paint, placeNow } from './sim/dev';
import { createRun, type RunOptions } from './sim/newgame';
import { hashSeed } from './sim/rng';
import { stressWorld } from './sim/stress';
import type { Dir } from './sim/state';
import type { World } from './sim/world';
import { App, BootError } from './ui/App';
import { GameContext } from './ui/context';

/**
 * Browser shell. URL options:
 *   ?seed=<text>   play a fresh run with this seed at once (in slot 3, or ?slot=N; it autosaves like any round)
 *   ?slot=<1..3>   load this slot and play at once
 *   ?menu          open the main menu at boot (default when nothing is given)
 *   ?size=, ?theme= with ?seed: map size and world theme
 *   ?zoom=<n>      start zoom, for screenshots
 *   ?view=iso|steep|top  camera view for this load (overrides the setting)
 *   ?dev           exposes window.groundbreak (game, view, interaction, step, sim: placeNow / beltLine / paint)
 *   ?dev&manual    no real-time loop; window.groundbreak.step(frames, ms) advances a virtual clock
 *   ?dev&stress=3000,10000  the performance scene (sim/stress.ts): buildings, items on belts
 */
const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;
// Storage keys, the dev hook and the database name keep the codename the game started under (Groundbreak), so saves and settings stay valid.
const LAST_SLOT = 'groundbreak.v2.slot';

function rememberSlot(slot: number): void {
  try {
    window.localStorage.setItem(LAST_SLOT, String(slot));
  } catch {
    // private window: the menu still lists the slots
  }
}

function lastSlot(): number {
  try {
    const n = Number(window.localStorage.getItem(LAST_SLOT));
    return n >= 1 && n <= 3 ? n : 1;
  } catch {
    return 1;
  }
}

/** A slot number from the URL, or `fallback` when it is missing or not 1..3. */
function slotParam(params: URLSearchParams, fallback: number): number {
  const n = Number(params.get('slot'));
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : fallback;
}

/** The run to show at boot and whether to start in the menu. */
function stressBoot(text: string): { world: World; slot: number; menu: boolean } {
  const [buildings, items] = text.split(',').map(Number);
  return { world: stressWorld(content, { buildings: buildings || 3000, items: items || 10000 }), slot: 3, menu: false };
}

async function bootWorld(params: URLSearchParams): Promise<{ world: World; slot: number; menu: boolean }> {
  const stress = params.get('stress');
  if (params.has('dev') && stress !== null) return stressBoot(stress);
  const seed = params.get('seed');
  if (seed !== null) {
    const opts: RunOptions = { seed: hashSeed(seed), size: params.get('size') ?? undefined, theme: params.get('theme') ?? undefined };
    return { world: createRun(content, opts), slot: slotParam(params, 3), menu: params.has('menu') };
  }
  const wanted = slotParam(params, lastSlot());
  const saved = fromSaveRecord(await readSlot(wanted).catch(() => undefined), content);
  if (saved) return { world: saved, slot: wanted, menu: !params.has('slot') };
  // nothing to continue: a fresh backdrop run behind the menu
  return { world: createRun(content, { seed: randomSeed() }), slot: wanted, menu: true };
}

/** A tiny external store: whether the main menu is open (the game pauses behind it) and whether the player paused (P). */
function menuStore(open: boolean, game: Game) {
  const listeners = new Set<() => void>();
  let isOpen = open;
  let held = false;
  const set = (v: boolean): void => {
    isOpen = v;
    game.paused = v || held || document.visibilityState === 'hidden';
    for (const l of listeners) l();
  };
  set(open);
  document.addEventListener('visibilitychange', () => set(isOpen));
  return {
    open: () => set(true),
    close: () => set(false),
    isOpen: () => isOpen,
    isPaused: () => held,
    togglePause: () => {
      held = !held;
      set(isOpen);
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

function startSound(game: Game, view: WorldView, preferences: PreferenceStore): AudioEngine {
  const audio = new AudioEngine(preferences);
  const theme = content.themes.get(game.world.state.map.theme);
  const sound = new GameSound(audio, theme.sound, randomSeed());
  game.onEvents((events) => sound.onEvents(events));
  // machine ambience follows the camera: what is on screen, at what zoom
  sound.watch(() => {
    const rect = view.camera.viewRect();
    return { state: game.world.state, zoom: view.camera.zoom, onScreen: (x: number, y: number) => tileInView(x, y, rect, 64) };
  });
  attachUiSounds(document.getElementById('ui')!, (kind) => sound.ui(kind));
  document.addEventListener('visibilitychange', () => audio.setHidden(document.visibilityState === 'hidden'));
  const unlock = (): void => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true, once: true });
  window.addEventListener('keydown', unlock, { capture: true, once: true });
  return audio;
}

/** View keys of the shell: H or Home brings the camera back to the core, P or Space pauses (building still works). */
function attachShellKeys(view: WorldView, menu: ReturnType<typeof menuStore>): void {
  const keys: Record<string, () => void> = { h: () => view.centreOnCore(), home: () => view.centreOnCore(), p: menu.togglePause, ' ': menu.togglePause };
  window.addEventListener('keydown', (e) => {
    const run = keys[e.key.toLowerCase()];
    if (!run || isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat || menu.isOpen()) return;
    run();
    e.preventDefault();
  });
}

/** Decoration answers the tools (click selects, right click / Backspace removes only real deco) and the hover card. */
function wireDeco(): void {
  probes.decoAt = (x, y) => decoAt(x, y) !== null;
  probes.decoTap = (x, y) => void tapDeco(x, y);
  registerInspector((w, x, y) => {
    const hit = w.at(x, y) ? null : decoAt(x, y);
    if (!hit) return null;
    return { kind: 'deco', title: hit.name, lines: [{ label: 'Decoration', value: 'No effect', tone: 'plain' }], stacks: [], hint: 'Backspace or right click to remove', rect: { x, y, w: 1, h: 1 } };
  });
}

/** Dev hook: instant building and floor paint on the live world (screenshots, the later autopilot). */
function devSim(game: Game) {
  return {
    placeNow: (kind: string, x: number, y: number, rot: Dir = 0, config = -1) => placeNow(game.world, kind, x, y, rot, config),
    beltLine: (x: number, y: number, dir: Dir, n: number, kind?: string) => beltLine(game.world, x, y, dir, n, kind),
    paint: (floor: string, x: number, y: number, w: number, h: number) => paint(game.world, floor, x, y, w, h),
  };
}

type Stepper = (frames?: number, ms?: number) => void;

function startLoop(game: Game, view: WorldView, manual: boolean, perf: FramePerf): Stepper {
  let started = 0;
  let simMs = 0;
  let at = 0;
  const frame = (ms: number, now: number): void => {
    started = performance.now();
    at = now;
    game.frame(ms, now);
    simMs = performance.now() - started;
    view.render(game.clock.alpha, now);
  };
  let virtual = performance.now();
  const step: Stepper = (frames = 1, ms = 1000 / 30) => {
    for (let i = 0; i < frames; i++) {
      virtual += ms;
      frame(ms, virtual);
    }
    view.app.render();
  };
  if (manual) {
    view.app.ticker.stop();
    step(2);
    document.documentElement.dataset.ready = 'true';
    return step;
  }
  view.app.ticker.add((ticker) => frame(ticker.deltaMS, performance.now()));
  view.app.ticker.add(() => perf.record(at, simMs, performance.now() - started - simMs), undefined, UPDATE_PRIORITY.UTILITY);
  view.app.ticker.addOnce(() => requestAnimationFrame(() => (document.documentElement.dataset.ready = 'true')));
  return step;
}

/** New run / load slot. A different theme needs other sprites and sky: save, then reload into the slot. */
function runActions(game: Game, saveNow: () => Promise<void>, close: () => void) {
  const swap = async (world: World, slot: number): Promise<void> => {
    await saveNow();
    rememberSlot(slot);
    if (world.state.map.theme !== game.world.state.map.theme) {
      await writeSlot(slot, toSaveRecord(world, Date.now()));
      window.location.search = `?slot=${slot}`;
      return;
    }
    game.replaceWorld(world, slot);
    await writeSlot(slot, toSaveRecord(world, Date.now()));
    close();
  };
  return {
    newRun: (opts: RunOptions, slot: number) => swap(createRun(content, opts), slot),
    loadSlot: async (slot: number) => {
      if (slot === game.slot) return close();
      const world = fromSaveRecord(await readSlot(slot), content);
      if (world) await swap(world, slot);
    },
  };
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const ui = createRoot(document.getElementById('ui')!);
  try {
    const preferences = new PreferenceStore();
    const viewParam = params.get('view');
    setViewMode(isViewMode(viewParam) ? viewParam : preferences.get().view);
    const start = await bootWorld(params);
    const game = new Game(content, start.world, start.slot);
    const interaction = new Interaction(game);
    game.onReset(() => interaction.cancel());
    const menu = menuStore(start.menu, game);
    const view = await WorldView.create(document.getElementById('world')!, game, interaction);
    const zoom = Number(params.get('zoom'));
    view.render(0, performance.now());
    if (zoom > 0) view.camera.setZoom(zoom);
    if (params.has('stress')) view.centreOnMap();
    const apply = (): void => {
      game.setTimeScale(preferences.get().speed);
      const still = preferences.reducedMotion();
      view.setStill(still);
      document.documentElement.dataset.motion = still ? 'reduce' : 'full';
    };
    apply();
    preferences.subscribe(apply);
    attachHotkeys(interaction);
    attachShellKeys(view, menu);
    if (!params.has('stress')) attachAutopilot(game, () => preferences.get().autopilot, preferences.subscribe);
    wireDeco();
    const audio = startSound(game, view, preferences);
    // a round only saves once it has run (the backdrop behind a fresh menu stays out of the slots)
    const autosave = startAutosave(game, () => !params.has('stress') && game.world.state.tick > 0);
    rememberSlot(start.slot);
    const perf = new FramePerf();
    const devHook = import.meta.env.DEV || params.has('dev');
    const step = startLoop(game, view, devHook && params.has('manual'), perf);
    ui.render(
      <StrictMode>
        <GameContext.Provider value={{ game, interaction, audio, preferences, menu, saveNow: autosave.saveNow, ...runActions(game, autosave.saveNow, menu.close) }}>
          <App />
          <TutorialGuide view={view} />
          <ConfigHud view={view} />
        </GameContext.Provider>
      </StrictMode>,
    );
    if (devHook) Object.assign(window, { groundbreak: { game, view, interaction, step, perf, content, listSlots, demo: () => demoCommands(game.world).forEach((c) => game.enqueue(c)), sim: devSim(game), screenOfTile: (x: number, y: number) => view.screenOfTile(x, y) } });
  } catch (error) {
    console.error(error);
    ui.render(<BootError message={error instanceof Error ? error.message : String(error)} />);
    document.documentElement.dataset.ready = 'error';
  }
}

void boot();
