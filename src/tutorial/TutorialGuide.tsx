import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Interaction } from '../game/interaction';
import { TICK_HZ } from '../sim/constants';
import { Icon } from '../ui/components/Icon';
import { usePresence, usePresenceList, type PresenceAttrs } from '../ui/components/Presence';
import { tip } from '../ui/components/TipLayer';
import { useInteraction, useMenuOpen, usePreferences, useServices, useSnapshot } from '../ui/context';
import { ToolIcon } from '../ui/tools/icons';
import { HELP_DELAY_SECONDS, type Help } from './help';
import { SpotMarker, UiRing } from './Markers';
import { isLate, reach, reachedStep } from './progress';
import { union, type Spot } from './spots';
import { firstOpen, STEPS, type StepContext, type TutorialStep } from './steps';
import { tutorialStore } from './store';
import { canSee, focusOn, type TutorialView } from './view';
import './tutorial.css';

/** The closing card stays this long before the tutorial ends by itself. */
const CLOSING_MS = 14_000;

interface Note {
  icon: 'drone' | 'pointer' | 'alert';
  text: string;
}

/** What to say under the hint: the drone is on it, something is wrong with what stands, or the tool is in hand. */
function status(step: TutorialStep, queued: boolean, inHand: boolean, help: Help | null): Note | null {
  if (queued) return { icon: 'drone', text: 'Ghost placed. Your drone is flying out to build it.' };
  if (help) return { icon: 'alert', text: help.text };
  if (!inHand) return null;
  return { icon: 'pointer', text: step.tool ? 'Drag a box over your build.' : 'Click to place it. The glowing mark is a good spot. Right click puts the tool down.' };
}

function inHand(step: TutorialStep, mode: Interaction['mode']): boolean {
  if (step.tool) return mode.kind === 'select';
  return mode.kind === 'place' && mode.building === step.pick;
}

/** One small plate per step: done ones lit, the current one amber, the rest dark. They fill in as the player goes. */
function Progress({ index }: { index: number }) {
  return (
    <span className="tut-progress" aria-hidden="true">
      {STEPS.map((s, i) => (
        <span key={s.id} className="tut-seg" data-state={i < index ? 'done' : i === index ? 'now' : 'next'} />
      ))}
    </span>
  );
}

function noteIcon(icon: Note['icon']) {
  if (icon === 'alert') return <Icon name="alert" size={16} />;
  return icon === 'drone' ? <ToolIcon name="drone" size={16} /> : <ToolIcon name="pointer" size={14} />;
}

interface CardProps {
  step: TutorialStep;
  index: number;
  note: Note | null;
  canShow: boolean;
  onShow: () => void;
  presence: PresenceAttrs;
}

function StepCard({ step, index, note, canShow, onShow, presence }: CardProps) {
  return (
    <aside className="hud-card tut-card" aria-label="Tutorial" {...presence}>
      <header className="k-head tut-head">
        <span className="tut-num k-enter num" data-from="pop" key={index} aria-hidden="true">
          {index + 1}
        </span>
        <p className="k-title tut-kicker">Tutorial</p>
        <span className="k-chip tut-count num">
          {index + 1} / {STEPS.length}
        </span>
        <button type="button" className="button button-quiet tut-skip" {...tip('Skip the tutorial for good')} onClick={() => tutorialStore.finish()}>
          Skip
        </button>
      </header>
      <div className="tut-body k-enter" data-from="right" key={step.id}>
        <h2 className="tut-title">{step.title}</h2>
        <p className="tut-hint">{step.hint}</p>
      </div>
      {note && (
        <p className="tut-note k-enter" data-from="up" data-tone={note.icon === 'alert' ? 'warn' : undefined} key={note.text} role="status">
          <span className="tut-note-icon">{noteIcon(note.icon)}</span>
          {note.text}
        </p>
      )}
      <footer className="tut-foot">
        <Progress index={index} />
        {canShow && (
          <button type="button" className="button button-go tut-show" onClick={onShow}>
            Show me where
          </button>
        )}
      </footer>
    </aside>
  );
}

/** After the last step: what the player has learned and where to go on. Ends the tutorial by itself. */
function Closing({ presence }: { presence: PresenceAttrs }) {
  useEffect(() => {
    const t = window.setTimeout(() => tutorialStore.finish(), CLOSING_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <aside className="hud-card tut-card" aria-label="Tutorial finished" {...presence}>
      <header className="k-head tut-head">
        <span className="tut-num tut-num-done k-enter" data-from="pop" aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
        <p className="k-title tut-kicker">Tutorial done</p>
      </header>
      <div className="tut-body">
        <h2 className="tut-title">That is the loop</h2>
        <p className="tut-hint">Drill, belt, smelt, power, unload, copy. Ctrl+V pastes your blueprint anywhere. The orders at the top right take it from here.</p>
      </div>
      <footer className="tut-foot">
        <Progress index={STEPS.length} />
        <button type="button" className="button button-go tut-show" onClick={() => tutorialStore.finish()}>
          Got it
        </button>
      </footer>
    </aside>
  );
}

/** Spots are searched on the map only when the layout or the ghosts change, not on every snapshot. */
function useSpots(step: TutorialStep | undefined, ctx: StepContext, ghosts: number): Spot[] {
  const world = ctx.world;
  return useMemo(() => (step ? step.spots(ctx) : []), [step, world, world.layout, ghosts]); // eslint-disable-line react-hooks/exhaustive-deps -- ctx.copied does not change spots
}

/** What the rings of one step point at. One object per step, so the layer can fade the old one out. */
interface Layer {
  id: string;
  spots: Spot[];
  pick: string | undefined;
  category: string | undefined;
  tool: boolean;
}

/** The ring on the HUD that says where to click: the copy button, or the palette entry (else its tab). */
function uiSelectors(layer: Layer): { primary: string; fallback?: string } | null {
  if (layer.tool) return { primary: '[data-tool="copy"]', fallback: '[data-tool="menu"]' };
  if (!layer.pick) return null;
  const fallback = layer.category ? `[data-category="${CSS.escape(layer.category)}"]` : undefined;
  return { primary: `.pal-item[data-building="${CSS.escape(layer.pick)}"]`, ...(fallback ? { fallback } : {}) };
}

const noSubscription = (): (() => void) => () => undefined;

/** The HUD element the ring on a HUD piece must live in (see `Rings`); null while the menu has taken it away. Read at every render. */
function useHudRoot(): Element | null {
  return useSyncExternalStore(noSubscription, () => document.querySelector('.hud'), () => null);
}

/**
 * The marks of one step. Two layers, because they sit on different levels (tutorial.css "Levels"): the rings on the
 * ground lie under the whole HUD (cards, tooltips, the hover card), the ring around a HUD piece must lie over its
 * panel yet under the tooltips, so it is placed inside the HUD's own layer.
 */
function Rings({ layer, view, hand, presence, leaving }: { layer: Layer; view: TutorialView; hand: boolean; presence: PresenceAttrs; leaving: boolean }) {
  // `hand` = the tool is in hand or the drone already has the ghost: nothing left to point at in the HUD
  const ui = uiSelectors(layer);
  const hud = useHudRoot();
  const state = leaving ? 'closing' : presence['data-presence'];
  return (
    <>
      <div className="tut-layer" aria-hidden="true" {...presence} data-presence={state}>
        {layer.spots.map((s, i) => (
          <SpotMarker key={`${s.x}-${s.y}-${s.w}`} view={view} spot={s} arrow={i === 0} />
        ))}
      </div>
      {ui && hud && createPortal(
        <div className="tut-ui-layer" aria-hidden="true" {...presence} data-presence={state}>
          <UiRing primary={ui.primary} {...(ui.fallback ? { fallback: ui.fallback } : {})} active={!hand} arrow={!layer.tool} />
        </div>,
        hud,
      )}
    </>
  );
}

/** Whether the fault `seen` has stood unchanged for the delay (pure, for the hook below). */
function stoodLongEnough(seen: { key: string; since: number } | null, key: string | null, tick: number): boolean {
  return key !== null && seen?.key === key && tick - seen.since >= HELP_DELAY_SECONDS * TICK_HZ;
}

/** The help, once the same fault has stood unchanged for a few seconds of game time (the player may still be building). */
function useSettled(help: Help | null, tick: number): Help | null {
  const key = help?.key ?? null;
  const [seen, setSeen] = useState<{ key: string; since: number } | null>(null);
  if ((seen?.key ?? null) !== key) setSeen(key === null ? null : { key, since: tick });
  return stoodLongEnough(seen, key, tick) ? help : null;
}

/** The spots a step shows: the help's piece first (it gets the arrow), the step's own after unless the fix is at the piece itself. */
function withHelp(spots: Spot[], help: Help | null): Spot[] {
  if (!help) return spots;
  if (help.quiet) return [help.spot];
  return [help.spot, ...spots.filter((s) => s.x !== help.spot.x || s.y !== help.spot.y)];
}

/**
 * While a step is on screen the guide is THE instruction: html[data-tutorial] lets the order card step back to its
 * header and the radio keep quiet (tutorial.css). Set before the first paint, so nothing flashes.
 */
function useGuideFlag(on: boolean): void {
  useLayoutEffect(() => {
    if (!on) return undefined;
    const root = document.documentElement;
    root.dataset.tutorial = 'on';
    return () => {
      delete root.dataset.tutorial;
    };
  }, [on]);
}

function Guide({ view, presence }: { view: TutorialView; presence: PresenceAttrs }) {
  const { game } = useServices();
  const snap = useSnapshot();
  const iv = useInteraction();
  const world = game.world;
  const ctx: StepContext = { world, copied: iv.clip !== null };
  const index = reach(world, firstOpen(ctx, reachedStep(world)));
  const step = STEPS[index];
  const baseSpots = useSpots(step, ctx, snap.ghosts);
  const rawHelp = useMemo(() => step?.help?.(ctx) ?? null, [step, world, world.layout, snap.ghosts]); // eslint-disable-line react-hooks/exhaustive-deps -- layout and ghosts are what a fault depends on
  const help = useSettled(rawHelp, snap.tick);
  const spots = useMemo(() => withHelp(baseSpots, help), [baseSpots, help]);
  const won = world.state.progress.won;
  useGuideFlag(step !== undefined);
  // an old run, or a round already won (the victory card owns the screen): the tutorial has nothing left to teach
  useEffect(() => {
    if (isLate(world) || won) tutorialStore.finish();
  }, [world, won]);
  // a new step brings the camera to its spots when they are off screen or under a panel (once; the player's panning is theirs)
  useEffect(() => {
    const all = union(spots);
    if (all && !spots.every((s) => canSee(view, s))) focusOn(view, all);
  }, [step?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new step moves the camera
  // a fault the player cannot see (the end of a long belt off screen) is brought into view once, when it is first reported
  useEffect(() => {
    if (help && !canSee(view, help.spot)) focusOn(view, help.spot);
  }, [help?.key]); // eslint-disable-line react-hooks/exhaustive-deps -- once per fault
  const category = step?.pick ? game.content.buildings.find(step.pick)?.category : undefined;
  const quiet = help?.quiet === true;
  const layers = useMemo<Layer[]>(() => (step ? [{ id: step.id, spots, pick: quiet ? undefined : step.pick, category, tool: step.tool !== undefined && !quiet }] : []), [step, spots, category, quiet]);
  const shown = usePresenceList(layers, (l) => l.id, 'fade');
  if (!step) return <Closing presence={presence} />;
  const hand = inHand(step, iv.mode);
  const queued = step.queued(ctx);
  const first = spots[0];
  return (
    <>
      <StepCard step={step} index={index} note={status(step, queued, hand, help)} canShow={first !== undefined} onShow={() => first && focusOn(view, first)} presence={presence} />
      {shown.map((e) => (
        <Rings key={e.key} layer={e.item} view={view} hand={hand || queued} presence={e.attrs} leaving={presence['data-presence'] === 'closing'} />
      ))}
    </>
  );
}

/**
 * The guided first round: about five minutes of orders, each with a card, a ring and an arrow
 * on the map or the palette: a drill on copper, a belt to the core, a drill on iron, a smelter, bars to the core,
 * power, an unloader that feeds the mill, and a copied blueprint. Skippable; once finished or skipped it never shows again (store.ts).
 * The card drops in and lifts out again (also behind the menu and while the autopilot plays); the rings of a finished
 * step fade while the next step's pop in. Mounted once by main.tsx with the world view, next to the HUD.
 */
export function TutorialGuide({ view }: { view: TutorialView }) {
  const done = useSyncExternalStore(tutorialStore.subscribe, tutorialStore.isDone);
  const menu = useMenuOpen();
  // the autopilot plays the round: the guide steps aside (and asks the world again where it stands when the player takes over)
  const { autopilot } = usePreferences();
  const { mounted, attrs } = usePresence(!done && !menu && !autopilot, 'down');
  if (!mounted) return null;
  return <Guide view={view} presence={attrs} />;
}
