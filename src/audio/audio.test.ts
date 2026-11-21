import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { noteHz } from './types';

describe('notes in the world key', () => {
  const key = content.themes.get(content.rules.defaultTheme).sound;

  it('starts at the root and climbs the scale, an octave per scale length', () => {
    expect(noteHz(key, 0)).toBeCloseTo(key.rootHz);
    expect(noteHz(key, key.scale.length)).toBeCloseTo(key.rootHz * 2);
    expect(noteHz(key, -key.scale.length)).toBeCloseTo(key.rootHz / 2);
    for (let i = 1; i < 12; i++) expect(noteHz(key, i)).toBeGreaterThan(noteHz(key, i - 1));
  });
});
