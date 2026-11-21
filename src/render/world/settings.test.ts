import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_SETTINGS, parseWorldSettings } from './settings';

describe('world settings', () => {
  it('defaults on, reads valid values and ignores broken ones', () => {
    expect(parseWorldSettings(null)).toEqual(DEFAULT_WORLD_SETTINGS);
    expect(parseWorldSettings('{"decoration":false,"lighting":true}')).toEqual({ decoration: false, lighting: true });
    expect(parseWorldSettings('{"decoration":"no"}')).toEqual(DEFAULT_WORLD_SETTINGS);
    expect(parseWorldSettings('{nope')).toEqual(DEFAULT_WORLD_SETTINGS);
  });
});
