import { describe, expect, it } from 'vitest';
import { content as v2 } from '../../src/content';
import { ART_CATEGORIES } from '../../src/render/art-manifest';
import { ownedIds } from './ownership';

describe('3D art ownership map (docs/art.md)', () => {
  const owners = new Map<string, string[]>();
  for (const c of ART_CATEGORIES) for (const id of ownedIds(c)) owners.set(id, [...(owners.get(id) ?? []), c]);

  it('never gives one id to two categories', () => {
    expect([...owners].filter(([, cs]) => cs.length > 1)).toEqual([]);
  });

  it('gives every v2 building sprite and material icon to exactly one category', () => {
    const ids = [...v2.buildings.list.map((b) => `building-${b.id}`), ...v2.materials.list.map((m) => m.icon)];
    expect(ids.filter((id) => (owners.get(id) ?? []).length !== 1)).toEqual([]);
  });

  it('plans the sprites the v2 themes draw (boulders)', () => {
    const planned = new Set(ownedIds('nature'));
    expect(v2.themes.list.flatMap((t) => t.boulders).filter((id) => !planned.has(id))).toEqual([]);
  });
});
