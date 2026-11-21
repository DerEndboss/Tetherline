import { describe, expect, it } from 'vitest';
import { content, rawContent } from './index';
import { validateContent } from './validate';
import type { RawContent } from './types';

const clone = (): RawContent => structuredClone(rawContent);

describe('content', () => {
  it('has no broken ids, references, cycles or impossible numbers', () => {
    expect(validateContent(rawContent)).toEqual([]);
  });

  it('builds a registry that resolves every listed id', () => {
    for (const m of rawContent.materials) expect(content.materials.get(m.id)).toBe(m);
    expect(content.rules.startWorld).toBe('rustfield');
    expect(() => content.materials.get('unobtainium')).toThrow(/Unknown material/);
  });
});

describe('validateContent catches', () => {
  it('a dangling reference', () => {
    const raw = clone();
    raw.recipes[0]!.inputs[0]!.id = 'unobtainium';
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('unknown material or currency id "unobtainium"'));
  });

  it('a duplicate id', () => {
    const raw = clone();
    raw.materials.push({ ...raw.materials[0]! });
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('duplicate id'));
  });

  it('a non-kebab id', () => {
    const raw = clone();
    raw.relics[0]!.id = 'Survey_Lens';
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('kebab-case'));
  });

  it('a tech cycle', () => {
    const raw = clone();
    raw.techs[0]!.requires = [raw.techs[1]!.id];
    raw.techs[1]!.requires = [raw.techs[0]!.id];
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('cycle'));
  });

  it('a ratio that does not sum to one', () => {
    const raw = clone();
    raw.alloys[0]!.ratio = [0.5, 0.2];
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('ratio sums to'));
  });

  it('overlapping alloys', () => {
    const raw = clone();
    raw.alloys.push({ id: 'mix-near-bronze', inputs: ['copper-bar', 'tin-bar'], ratio: [0.85, 0.15], tolerance: 0.05, output: 'slag' });
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('overlaps'));
  });

  it('an unknown stat in an effect', () => {
    const raw = clone();
    raw.skills[0]!.effects[0]!.stat = 'luck-of-the-irish';
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('unknown stats id'));
  });

  it('a drone with an unknown cost id', () => {
    const raw = clone();
    raw.drones[0]!.cost = [{ id: 'gold', amount: 3 }];
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('unknown material or currency id "gold"'));
  });

  it('a showcase obstacle that does not exist', () => {
    const raw = clone();
    raw.worlds[0]!.showcase.push('volcano');
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('unknown obstacles id "volcano"'));
  });

  it('a scale that does not ascend', () => {
    const raw = clone();
    raw.worlds[0]!.sound.scale = [0, 4, 2];
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('sound.scale'));
  });

  it('a bad colour', () => {
    const raw = clone();
    raw.worlds[0]!.palette.ground.push('rust');
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('is not #rrggbb'));
  });
});

describe('recipe and alloy validation catches', () => {
  it('an alloy whose output is not above its inputs, or is the slag', () => {
    const raw = clone();
    raw.alloys.push({ id: 'mix-back', inputs: ['steel', 'iron-bar'], ratio: [0.5, 0.5], tolerance: 0.05, output: 'graphite' });
    raw.alloys.push({ id: 'mix-junk', inputs: ['silicon', 'tin-bar'], ratio: [0.5, 0.5], tolerance: 0.05, output: 'slag' });
    const problems = validateContent(raw);
    expect(problems).toContainEqual(expect.stringContaining('alloys/mix-back: output must be of a higher tier'));
    expect(problems).toContainEqual(expect.stringContaining('alloys/mix-junk: the slag is what a miss makes'));
  });

  it('an alloy that lists an input twice, a share out of range, or one input only', () => {
    const raw = clone();
    raw.alloys[0]!.inputs = ['iron-bar', 'iron-bar'];
    raw.alloys[1]!.ratio = [1.4, -0.4];
    raw.alloys[2]!.inputs = ['copper-bar'];
    raw.alloys[2]!.ratio = [1];
    const problems = validateContent(raw);
    expect(problems).toContainEqual(expect.stringContaining('lists an input twice'));
    expect(problems).toContainEqual(expect.stringContaining('every share must be in [0, 1]'));
    expect(problems).toContainEqual(expect.stringContaining('needs two or three inputs'));
  });

  it('alloys without a mixing building', () => {
    const raw = clone();
    raw.buildings = raw.buildings.map((b) => ({ ...b, mix: undefined }));
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('no building mixes'));
  });

  it('a recipe that makes something of a lower tier than its inputs', () => {
    const raw = clone();
    raw.recipes.push({ id: 'unprint', building: 'fabricator', inputs: [{ id: 'frame', amount: 1 }], outputs: [{ id: 'steel', amount: 2 }], seconds: 2 });
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('recipes/unprint: makes something of a lower tier'));
  });

  it('a recipe with a duplicate input', () => {
    const raw = clone();
    raw.recipes[0]!.inputs.push({ id: raw.recipes[0]!.inputs[0]!.id, amount: 1 });
    expect(validateContent(raw)).toContainEqual(expect.stringContaining('lists an input twice'));
  });

  it('a material nothing can make', () => {
    const raw = clone();
    raw.materials.push({ id: 'unobtainium', name: 'Unobtainium', tier: 4, value: 999, color: '#ffffff', icon: 'orb' });
    raw.recipes = raw.recipes.filter((r) => r.id !== 'print-frame');
    const problems = validateContent(raw);
    expect(problems).toContainEqual(expect.stringContaining('materials/unobtainium: nothing makes it'));
    expect(problems).toContainEqual(expect.stringContaining('materials/frame: nothing makes it'));
    expect(problems).toContainEqual(expect.stringContaining('materials/core: nothing makes it'));
  });

  it('a mixer with a broken batch and parts from a level it never reaches', () => {
    const raw = clone();
    const mixer = raw.buildings.find((b) => b.mix)!;
    mixer.mix = { input: 0, output: 1, seconds: 4 };
    mixer.partsFrom = { level: 12, cost: [{ id: 'frame', amount: 1 }] };
    const problems = validateContent(raw);
    expect(problems).toContainEqual(expect.stringContaining('mix needs positive input'));
    expect(problems).toContainEqual(expect.stringContaining('partsFrom.level'));
  });
});
