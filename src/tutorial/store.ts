import { metaStore } from '../save/meta';

/**
 * Whether the guided first round is over (finished or skipped). Kept in this browser's localStorage, which can be
 * missing or blocked (private window): then the guide simply shows again next time and works the same.
 * The meta save learns about it too, so the rest of the game knows the player is no beginner.
 */
const KEY = 'groundbreak.tutorial.v2';

/** The page's storage, or null where the browser refuses it (or there is no page, as in tests). */
function pageStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class TutorialStore {
  private done: boolean;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'> | null = pageStorage) {
    this.done = this.read();
  }

  private read(): boolean {
    try {
      return this.storage()?.getItem(KEY) === 'done';
    } catch {
      return false;
    }
  }

  readonly isDone = (): boolean => this.done;

  readonly subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Ends the tutorial for good (also the meta flag). */
  finish(): void {
    if (this.done) return;
    this.done = true;
    try {
      this.storage()?.setItem(KEY, 'done');
    } catch {
      // storage blocked: the flag lives for this page load only
    }
    void metaStore.finishTutorial();
    for (const l of this.listeners) l();
  }
}

export const tutorialStore = new TutorialStore();
