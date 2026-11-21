import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences, PreferenceStore, volumeGain } from './preferences';

describe('preferences', () => {
  it('falls back to the defaults for missing or broken data and clamps values', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{not json')).toEqual(DEFAULT_PREFERENCES);
    const p = parsePreferences(JSON.stringify({ volume: { music: 3, effects: -1, ambience: 'x' }, motion: 'reduce' }));
    expect(p.volume).toEqual({ music: 1, effects: 0, ambience: DEFAULT_PREFERENCES.volume.ambience });
    expect(p.motion).toBe('reduce');
    expect(parsePreferences(JSON.stringify({ motion: 'sideways' })).motion).toBe('system');
  });

  it('keeps the camera view per device, iso unless top is stored', () => {
    expect(parsePreferences(JSON.stringify({ view: 'top' })).view).toBe('top');
    expect(parsePreferences(JSON.stringify({ view: 'steep' })).view).toBe('steep');
    expect(parsePreferences(JSON.stringify({ view: 'sideways' })).view).toBe('iso');
    const store = new PreferenceStore(parsePreferences(null));
    store.setView('top');
    expect(store.get().view).toBe('top');
  });

  it('maps the slider to gain on a squared curve', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBeCloseTo(0.25);
    expect(volumeGain(2)).toBe(1);
  });

  it('notifies listeners and reports reduced motion from the choice', () => {
    const store = new PreferenceStore(parsePreferences(null));
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.setVolume('music', 0.3);
    store.setMotion('reduce');
    expect(calls).toBe(2);
    expect(store.get().volume.music).toBeCloseTo(0.3);
    expect(store.reducedMotion()).toBe(true);
    store.setMotion('full');
    expect(store.reducedMotion()).toBe(false);
  });
});
