import { describe, expect, it } from 'vitest';
import { content, rawContent } from '.';
import { validateContent } from './validate';

describe('content', () => {
  it('validates without problems', () => {
    expect(validateContent(rawContent)).toEqual([]);
  });

  it('catches broken references', () => {
    const broken = structuredClone(rawContent);
    broken.buildings[0]!.cost.push({ item: 'unobtainium', n: 1 });
    broken.recipes[0]!.outputs = [];
    delete broken.recipes[0]!.liquidOut;
    broken.orders.push({ id: 'loop', title: 'x', radio: 'x', goal: { kind: 'deliver', item: 'coal', n: 1 }, after: ['loop'] });
    const problems = validateContent(broken);
    expect(problems.some((p) => p.includes('unobtainium'))).toBe(true);
    expect(problems.some((p) => p.includes('makes nothing'))).toBe(true);
    expect(problems.some((p) => p.includes('cycle'))).toBe(true);
  });

  it('catches a behaviour without its spec', () => {
    const broken = structuredClone(rawContent);
    const drill = broken.buildings.find((b) => b.behaviour === 'drill')!;
    delete drill.drill;
    expect(validateContent(broken).some((p) => p.includes(drill.id))).toBe(true);
  });

  it('looks up by id and by stored index', () => {
    const i = content.materials.indexOf('copper-ore');
    expect(content.materials.at(i).id).toBe('copper-ore');
    expect(content.buildings.indexOf('nope')).toBe(-1);
    expect(() => content.buildings.get('nope')).toThrow();
  });
});
