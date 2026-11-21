import type { Amount, ContentKind, Effect, Id, RawContent } from './types';

/**
 * Checks content for broken ids, dangling references, cycles and impossible numbers.
 * Returns human-readable problems; an empty list means the content is sound.
 */
export function validateContent(raw: RawContent): string[] {
  const v = new Validator(raw);
  v.checkIds();
  v.checkMaterials();
  v.checkRecipes();
  v.checkAlloys();
  v.checkBuildings();
  v.checkBelts();
  v.checkFreighters();
  v.checkUpgrades();
  v.checkObstacles();
  v.checkDrones();
  v.checkTechs();
  v.checkSkills();
  v.checkRelics();
  v.checkWorlds();
  v.checkRules();
  v.checkReachable();
  return v.problems;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

class Validator {
  readonly problems: string[] = [];
  private readonly ids: Record<ContentKind, Set<Id>>;
  private readonly resources: Set<Id>;

  constructor(private readonly raw: RawContent) {
    const ids = {} as Record<ContentKind, Set<Id>>;
    for (const kind of Object.keys(raw) as ContentKind[]) {
      ids[kind] = new Set(raw[kind].map((e) => e.id));
    }
    this.ids = ids;
    this.resources = new Set([...ids.materials, ...ids.currencies]);
  }

  private fail(where: string, message: string): void {
    this.problems.push(`${where}: ${message}`);
  }

  private ref(where: string, kind: ContentKind, id: Id): void {
    if (!this.ids[kind].has(id)) this.fail(where, `unknown ${kind} id "${id}"`);
  }

  private resource(where: string, id: Id): void {
    if (!this.resources.has(id)) this.fail(where, `unknown material or currency id "${id}"`);
  }

  private amounts(where: string, list: Amount[], allowZero = false): void {
    for (const a of list) {
      this.resource(where, a.id);
      if (!(a.amount > 0 || (allowZero && a.amount === 0))) this.fail(where, `amount of "${a.id}" must be positive`);
    }
  }

  private effects(where: string, list: Effect[]): void {
    for (const e of list) {
      this.ref(where, 'stats', e.stat);
      if (e.op === 'mul' && !(e.value > 0)) this.fail(where, `multiplier for "${e.stat}" must be positive`);
    }
  }

  private color(where: string, value: string): void {
    if (!HEX_COLOR.test(value)) this.fail(where, `colour "${value}" is not #rrggbb`);
  }

  checkIds(): void {
    for (const kind of Object.keys(this.raw) as ContentKind[]) {
      const seen = new Set<Id>();
      for (const entry of this.raw[kind]) {
        const where = `${kind}/${entry.id}`;
        if (!ID_PATTERN.test(entry.id)) this.fail(where, 'id must be kebab-case');
        if (seen.has(entry.id)) this.fail(where, 'duplicate id');
        seen.add(entry.id);
      }
    }
    for (const id of this.ids.materials) {
      if (this.ids.currencies.has(id)) this.fail(`materials/${id}`, 'id is also a currency id');
    }
    if (this.raw.rules.length !== 1) this.fail('rules', 'exactly one rules entry is required');
  }

  checkMaterials(): void {
    for (const m of this.raw.materials) {
      const where = `materials/${m.id}`;
      if (!m.name.trim()) this.fail(where, 'name is empty');
      if (m.value < 0) this.fail(where, 'value must not be negative');
      this.color(where, m.color);
      if (m.accent !== undefined) this.color(where, m.accent);
      if (m.unlockedBy !== undefined) this.ref(where, 'techs', m.unlockedBy);
    }
    for (const c of this.raw.currencies) this.color(`currencies/${c.id}`, c.color);
  }

  checkRecipes(): void {
    for (const r of this.raw.recipes) {
      const where = `recipes/${r.id}`;
      this.ref(where, 'buildings', r.building);
      this.amounts(where, r.inputs);
      this.amounts(where, r.outputs);
      if (r.inputs.length === 0 || r.outputs.length === 0) this.fail(where, 'needs inputs and outputs');
      if (!(r.seconds > 0)) this.fail(where, 'seconds must be positive');
      if (new Set(r.inputs.map((a) => a.id)).size !== r.inputs.length) this.fail(where, 'lists an input twice');
      const top = Math.max(...r.inputs.map((a) => this.tierOf(a.id)));
      // Currencies (research from a lab) have no tier: studying a part is not "making something lower".
      const made = r.outputs.filter((a) => !this.ids.currencies.has(a.id));
      if (made.some((a) => this.tierOf(a.id) < top)) this.fail(where, 'makes something of a lower tier than its inputs');
    }
  }

  /** Tier of a material; 0 for anything else (currencies, unknown ids are reported elsewhere). */
  private tierOf(id: Id): number {
    return this.raw.materials.find((m) => m.id === id)?.tier ?? 0;
  }

  checkAlloys(): void {
    for (const a of this.raw.alloys) this.checkAlloy(`alloys/${a.id}`, a);
    this.checkAlloyOverlap();
    if (this.raw.alloys.length > 0 && !this.raw.buildings.some((b) => b.mix !== undefined)) this.fail('alloys', 'no building mixes (needs `mix`)');
  }

  private checkAlloy(where: string, a: RawContent['alloys'][number]): void {
    for (const input of a.inputs) this.ref(where, 'materials', input);
    this.ref(where, 'materials', a.output);
    if (a.inputs.length < 2 || a.inputs.length > 3) this.fail(where, 'needs two or three inputs');
    if (a.ratio.length !== a.inputs.length) this.fail(where, 'ratio needs one share per input');
    const sum = a.ratio.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 1) > 1e-6) this.fail(where, `ratio sums to ${sum}, not 1`);
    if (!(a.tolerance > 0 && a.tolerance <= 0.5)) this.fail(where, 'tolerance must be in (0, 0.5]');
    this.checkAlloyMaterials(where, a);
  }

  /** Distinct inputs, shares in [0, 1], an output above every input's tier and never the slag. */
  private checkAlloyMaterials(where: string, a: RawContent['alloys'][number]): void {
    if (new Set(a.inputs).size !== a.inputs.length) this.fail(where, 'lists an input twice');
    if (a.ratio.some((x) => !(x >= 0 && x <= 1))) this.fail(where, 'every share must be in [0, 1]');
    if (a.inputs.some((id) => this.tierOf(id) >= this.tierOf(a.output))) this.fail(where, 'output must be of a higher tier than every input');
    if (this.raw.rules.some((r) => r.slag === a.output)) this.fail(where, 'the slag is what a miss makes, not an alloy');
  }

  /** Two alloys of the same inputs must not overlap, or the mixer result would depend on list order. */
  private checkAlloyOverlap(): void {
    const list = this.raw.alloys;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a || !b || a.inputs.join() !== b.inputs.join()) continue;
        const distance = Math.max(...a.ratio.map((x, k) => Math.abs(x - (b.ratio[k] ?? 0))));
        if (distance <= a.tolerance + b.tolerance) this.fail(`alloys/${b.id}`, `overlaps alloys/${a.id}`);
      }
    }
  }

  checkBuildings(): void {
    for (const b of this.raw.buildings) {
      const where = `buildings/${b.id}`;
      this.amounts(where, b.cost);
      for (const adj of b.adjacency) {
        this.ref(where, 'buildings', adj.building);
        if (!(adj.bonus > 0 && adj.max >= 1)) this.fail(where, `adjacency "${adj.building}" needs a positive bonus and max`);
      }
      if (b.unlockedBy !== undefined) this.ref(where, 'techs', b.unlockedBy);
      if (b.freighter !== undefined) this.ref(where, 'freighters', b.freighter);
      this.checkBuildingNumbers(where, b);
      this.checkBuildingCrafting(where, b);
      if (b.power) this.checkPower(where, b, b.power);
      this.checkBuildingSite(where, b);
    }
  }

  private checkBuildingSite(where: string, b: RawContent['buildings'][number]): void {
    if (b.megastructure) this.checkMegastructure(where, b, b.megastructure);
    if (b.placement === 'site' && !this.raw.worlds.some((w) => w.sites.some((s) => s.building === b.id))) this.fail(where, 'placement "site" needs a site in some world');
  }

  /** One level per stage above the foundation; every stage needs something and takes time to raise. */
  private checkMegastructure(where: string, b: RawContent['buildings'][number], mega: NonNullable<RawContent['buildings'][number]['megastructure']>): void {
    if (mega.stages.length === 0) this.fail(where, 'a megastructure needs at least one stage');
    if (b.maxLevel !== mega.stages.length + 1) this.fail(where, 'maxLevel must be the number of stages + 1 (level 1 is the foundation)');
    mega.stages.forEach((stage, i) => {
      const at = `${where}/stages/${i}`;
      if (!stage.name.trim()) this.fail(at, 'name is empty');
      if (stage.needs.length === 0) this.fail(at, 'needs something to be fed');
      this.amounts(at, stage.needs);
      if (!(stage.seconds > 0)) this.fail(at, 'seconds must be positive');
    });
  }

  /** Positive numbers; a node needs both reach and link; a fuel needs a material, a rate, make and a buffer. */
  private checkPower(where: string, b: RawContent['buildings'][number], p: NonNullable<RawContent['buildings'][number]['power']>): void {
    for (const key of ['use', 'make', 'reach', 'link'] as const) {
      const v = p[key];
      if (v !== undefined && !(v > 0)) this.fail(where, `power.${key} must be positive`);
    }
    if ((p.reach === undefined) !== (p.link === undefined)) this.fail(where, 'a power node needs both reach and link');
    if (p.make !== undefined && p.reach === undefined) this.fail(where, 'a building that makes power must be a node (reach, link)');
    if (p.fuel) this.checkFuel(where, b, p);
  }

  private checkFuel(where: string, b: RawContent['buildings'][number], p: NonNullable<RawContent['buildings'][number]['power']>): void {
    this.ref(where, 'materials', p.fuel!.id);
    if (!(p.fuel!.perSecond > 0)) this.fail(where, 'power.fuel.perSecond must be positive');
    if (p.make === undefined || !(b.buffer > 0)) this.fail(where, 'a fuelled generator needs make and a buffer');
  }

  private checkBuildingCrafting(where: string, b: RawContent['buildings'][number]): void {
    if (b.mix) this.checkMixer(where, b, b.mix);
    if (!b.partsFrom) return;
    this.amounts(where, b.partsFrom.cost);
    if (!(b.partsFrom.level >= 2 && b.partsFrom.level <= b.maxLevel)) this.fail(where, 'partsFrom.level must be in [2, maxLevel]');
  }

  private checkBuildingNumbers(where: string, b: RawContent['buildings'][number]): void {
    const rules: [boolean, string][] = [
      [b.footprint.w >= 1 && b.footprint.h >= 1, 'footprint must be at least 1x1'],
      [b.maxLevel >= 1, 'maxLevel must be at least 1'],
      [b.costGrowth >= 1 && b.countGrowth >= 1, 'costGrowth and countGrowth must be at least 1'],
      [b.buildSeconds > 0, 'buildSeconds must be positive'],
      [b.levelBonus >= 0 && b.buffer >= 0, 'levelBonus and buffer must not be negative'],
      [b.extract === undefined || b.extract > 0, 'extract must be positive'],
      [b.extract === undefined || b.placement === 'deposit', 'an extracting building must sit on a deposit'],
      [b.stock === undefined || b.stock > 0, 'stock must be positive'],
    ];
    for (const [ok, message] of rules) if (!ok) this.fail(where, message);
  }

  checkBelts(): void {
    for (const b of this.raw.belts) {
      const where = `belts/${b.id}`;
      this.amounts(where, b.cost);
      if (!(b.speed > 0)) this.fail(where, 'speed must be positive');
      if (!(b.spacing > 0 && b.spacing <= 1)) this.fail(where, 'spacing must be in (0, 1]');
    }
  }

  checkFreighters(): void {
    for (const f of this.raw.freighters) {
      const where = `freighters/${f.id}`;
      for (const key of ['capacity', 'awaySeconds', 'approachSeconds', 'loadSeconds', 'departSeconds'] as const) {
        if (!(f[key] > 0)) this.fail(where, `${key} must be positive`);
      }
      Object.values(f.colors).forEach((c) => this.color(where, c));
    }
  }

  checkUpgrades(): void {
    for (const u of this.raw.upgrades) {
      const where = `upgrades/${u.id}`;
      this.amounts(where, u.cost);
      this.effects(where, u.effects);
      if (!(u.maxLevel >= 1)) this.fail(where, 'maxLevel must be at least 1');
      if (!(u.costGrowth >= 1)) this.fail(where, 'costGrowth must be at least 1');
    }
  }

  checkObstacles(): void {
    for (const o of this.raw.obstacles) {
      const where = `obstacles/${o.id}`;
      for (const loot of o.loot) {
        this.resource(where, loot.id);
        if (!(loot.min >= 0 && loot.max >= loot.min)) this.fail(where, `loot range of "${loot.id}" is invalid`);
      }
      if (!(o.hardness > 0)) this.fail(where, 'hardness must be positive');
      if (!(o.relicChance >= 0 && o.relicChance <= 1)) this.fail(where, 'relicChance must be in [0, 1]');
      o.colors.forEach((c) => this.color(where, c));
      if (o.glow !== undefined) this.color(where, o.glow);
    }
  }

  checkDrones(): void {
    for (const d of this.raw.drones) {
      const where = `drones/${d.id}`;
      this.amounts(where, d.cost);
      if (!(d.costGrowth >= 1)) this.fail(where, 'costGrowth must be at least 1');
      for (const key of ['speed', 'pulseSeconds', 'launchSeconds'] as const) {
        if (!(d[key] > 0)) this.fail(where, `${key} must be positive`);
      }
      this.checkDroneRole(where, d);
      if (d.unlockedBy !== undefined) this.ref(where, 'techs', d.unlockedBy);
      if (!(d.standoff >= 0 && d.standoff < 2)) this.fail(where, 'standoff must be in [0, 2)');
      Object.values(d.colors).forEach((c) => this.color(where, c));
    }
  }

  private checkDroneRole(where: string, d: RawContent['drones'][number]): void {
    if (d.role !== 'transport' && !(d.damage > 0)) this.fail(where, 'damage must be positive');
    if (d.role === 'transport' && !((d.capacity ?? 0) >= 1)) this.fail(where, 'a transport drone needs a capacity');
  }

  checkTechs(): void {
    for (const t of this.raw.techs) {
      const where = `techs/${t.id}`;
      t.requires.forEach((id) => this.ref(where, 'techs', id));
      this.effects(where, t.effects ?? []);
      if (!(t.cost > 0)) this.fail(where, 'cost must be positive');
      if (!this.unlocksSomething(t.id) && !(t.effects?.length && t.glyph)) this.fail(where, 'unlocks nothing (needs an unlockedBy somewhere, or effects and a glyph)');
    }
    this.checkAcyclic('techs', this.raw.techs);
  }

  private unlocksSomething(tech: Id): boolean {
    const { buildings, drones, materials, worlds } = this.raw;
    return [...buildings, ...drones, ...materials, ...worlds.flatMap((w) => w.regions)].some((e) => e.unlockedBy === tech);
  }

  checkSkills(): void {
    for (const s of this.raw.skills) {
      const where = `skills/${s.id}`;
      this.ref(where, 'skillBranches', s.branch);
      s.requires.forEach((id) => this.ref(where, 'skills', id));
      this.effects(where, s.effects);
      if (!(s.cost > 0)) this.fail(where, 'cost must be positive');
      if (s.effects.length === 0) this.fail(where, 'a skill needs an effect');
      if (!s.description.trim()) this.fail(where, 'description is empty');
    }
    this.checkAcyclic('skills', this.raw.skills);
  }

  checkRelics(): void {
    for (const r of this.raw.relics) {
      const where = `relics/${r.id}`;
      this.effects(where, r.effects);
      this.color(where, r.color);
      if (r.effects.length === 0) this.fail(where, 'a relic needs an effect');
    }
  }

  checkWorlds(): void {
    for (const w of this.raw.worlds) {
      const where = `worlds/${w.id}`;
      w.obstacles.forEach((o) => this.ref(where, 'obstacles', o.id));
      w.deposits.forEach((d) => this.ref(where, 'materials', d.material));
      if (!(w.size.w >= 8 && w.size.h >= 8)) this.fail(where, 'map must be at least 8x8');
      if (!(w.obstacleDensity >= 0 && w.obstacleDensity <= 1)) this.fail(where, 'obstacleDensity must be in [0, 1]');
      if (w.obstacles.length === 0 || w.deposits.length === 0) this.fail(where, 'needs obstacles and deposits');
      if (!(w.obstacleClusters >= 0)) this.fail(where, 'obstacleClusters must not be negative');
      w.showcase.forEach((id) => this.ref(where, 'obstacles', id));
      this.checkPalette(where, w.palette);
      this.checkSoundKey(where, w.sound);
      this.checkRegions(where, w);
      this.checkSites(where, w);
    }
  }

  /** Sites name a building placed only on sites, lie inside the map with its footprint and do not overlap. */
  private checkSites(where: string, w: RawContent['worlds'][number]): void {
    const taken = new Map<number, Id>();
    for (const site of w.sites) {
      const at = `${where}/sites/${site.building}`;
      const def = this.raw.buildings.find((b) => b.id === site.building);
      if (!def) {
        this.ref(at, 'buildings', site.building);
        continue;
      }
      if (def.placement !== 'site') this.fail(at, 'the building must have placement "site"');
      const rect = { x: site.x, y: site.y, w: def.footprint.w, h: def.footprint.h };
      if (!(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= w.size.w && rect.y + rect.h <= w.size.h)) this.fail(at, 'the footprint lies outside the map');
      else if (claimRect(rect, w.size.w, `${site.building}@${site.x},${site.y}`, taken)) this.fail(at, 'overlaps another site');
    }
  }

  /**
   * Regions: kebab-case unique ids, rectangles inside the map that overlap no other region and keep clear of
   * the base, exactly one way to open (a price or a tech), known deposits.
   */
  private checkRegions(where: string, w: RawContent['worlds'][number]): void {
    const owner = new Map<number, Id>();
    const seen = new Set<Id>();
    const centre = { x: Math.floor(w.size.w / 2), y: Math.floor(w.size.h / 2) };
    for (const r of w.regions) {
      const at = `${where}/regions/${r.id}`;
      if (!ID_PATTERN.test(r.id) || seen.has(r.id)) this.fail(at, 'id must be kebab-case and unique');
      seen.add(r.id);
      this.checkRegionOpening(at, r);
      r.deposits.forEach((d) => this.ref(at, 'materials', d.material));
      if (!(r.depositCount >= 0) || (r.depositCount > 0 && r.deposits.length === 0)) this.fail(at, 'deposits do not fit depositCount');
      this.claimTiles(at, r, w.size, owner);
      if (owner.has(centre.y * w.size.w + centre.x)) this.fail(at, 'covers the map centre (the base)');
    }
  }

  private checkRegionOpening(at: string, r: RawContent['worlds'][number]['regions'][number]): void {
    if ((r.cost === undefined) === (r.unlockedBy === undefined)) this.fail(at, 'needs exactly one of cost and unlockedBy');
    if (r.cost) this.amounts(at, r.cost);
    if (r.unlockedBy !== undefined) this.ref(at, 'techs', r.unlockedBy);
  }

  /** Marks a region's tiles as its own; reports a rect off the map and the first tile another region holds. */
  private claimTiles(at: string, r: RawContent['worlds'][number]['regions'][number], size: { w: number; h: number }, owner: Map<number, Id>): void {
    for (const rect of r.rects) {
      const inside = rect.x >= 0 && rect.y >= 0 && rect.w >= 1 && rect.h >= 1 && rect.x + rect.w <= size.w && rect.y + rect.h <= size.h;
      if (!inside) {
        this.fail(at, 'a rect lies outside the map');
        continue;
      }
      const other = claimRect(rect, size.w, r.id, owner);
      if (other) this.fail(at, `overlaps region ${other}`);
    }
  }

  private checkPalette(where: string, p: RawContent['worlds'][number]['palette']): void {
    const singles = [p.void, p.groundEdge, p.groundSide, p.tech, p.light, p.shadow, p.dust, p.fog.veil, p.fog.mist];
    [...singles, ...Object.values(p.sky), ...p.ground].forEach((c) => this.color(where, c));
    if (p.ground.length < 2) this.fail(where, 'palette needs at least two ground tones');
  }

  private checkSoundKey(where: string, key: RawContent['worlds'][number]['sound']): void {
    if (!(key.rootHz > 20 && key.rootHz < 2000)) this.fail(where, 'sound.rootHz must be an audible pitch');
    const ascending = key.scale.every((n, i) => n >= 0 && n < 12 && (i === 0 || n > key.scale[i - 1]!));
    if (key.scale.length === 0 || !ascending) this.fail(where, 'sound.scale must ascend within one octave');
  }

  private checkRuleNumbers(where: string, r: RawContent['rules'][number]): void {
    if (!(r.menuAfterDrones >= 0)) this.fail(where, 'menuAfterDrones must not be negative');
    if (!(r.stockReserve >= 0)) this.fail(where, 'stockReserve must not be negative');
    if (!(r.stockReserveCap >= 0 && r.stockReserveCap < 1)) this.fail(where, 'stockReserveCap must be in [0, 1)');
    if (!(r.prestigeReward.base >= 0 && r.prestigeReward.creditsPerPrism > 0)) this.fail(where, 'prestigeReward needs base >= 0 and creditsPerPrism > 0');
    if (!(r.prestigeYieldBonus >= 0)) this.fail(where, 'prestigeYieldBonus must not be negative');
  }

  checkRules(): void {
    for (const r of this.raw.rules) {
      const where = `rules/${r.id}`;
      this.ref(where, 'worlds', r.startWorld);
      this.ref(where, 'buildings', r.baseBuilding);
      this.ref(where, 'materials', r.slag);
      this.ref(where, 'currencies', r.prestigeCurrency);
      this.ref(where, 'currencies', r.primaryCurrency);
      this.amounts(where, r.startResources, true);
      r.startDrones.forEach((a) => this.ref(where, 'drones', a.id));
      r.guide.forEach((id) => this.ref(where, 'buildings', id));
      this.checkRuleNumbers(where, r);
      const base = this.raw.buildings.find((b) => b.id === r.baseBuilding);
      if (base && base.stock === undefined) this.fail(where, 'the base building must hold stock');
    }
  }

  private checkMixer(where: string, b: RawContent['buildings'][number], mix: NonNullable<RawContent['buildings'][number]['mix']>): void {
    if (!(mix.input > 0 && mix.output > 0 && mix.seconds > 0)) this.fail(where, 'mix needs positive input, output and seconds');
    if (this.raw.recipes.some((r) => r.building === b.id)) this.fail(where, 'a mixing building cannot also run recipes');
    if (!(b.buffer > 0)) this.fail(where, 'a mixing building needs a buffer');
  }

  /**
   * Every material can be had: raw ones from a world's veins or from rubble, the rest from a recipe or an
   * alloy whose inputs can be had (the slag from any mixer). A material nobody can make is a dead entry.
   */
  checkReachable(): void {
    const veins = this.raw.worlds.flatMap((w) => [...w.deposits, ...w.regions.flatMap((r) => r.deposits)].map((d) => d.material));
    const have = new Set<Id>([...veins, ...this.raw.obstacles.flatMap((o) => o.loot.map((l) => l.id))]);
    if (this.raw.alloys.length > 0) this.raw.rules.forEach((r) => have.add(r.slag));
    const makers = [
      ...this.raw.recipes.map((r) => ({ inputs: r.inputs.map((a) => a.id), outputs: r.outputs.map((a) => a.id) })),
      ...this.raw.alloys.map((a) => ({ inputs: a.inputs, outputs: [a.output] })),
    ];
    let grew = true;
    while (grew) {
      grew = false;
      for (const m of makers) {
        if (!m.inputs.every((id) => have.has(id)) || m.outputs.every((id) => have.has(id))) continue;
        m.outputs.forEach((id) => have.add(id));
        grew = true;
      }
    }
    for (const m of this.raw.materials) if (!have.has(m.id)) this.fail(`materials/${m.id}`, 'nothing makes it and no vein or rubble gives it');
  }

  /** Depth-first search over `requires`; reports each entry that sits on a cycle. */
  private checkAcyclic(kind: ContentKind, list: { id: Id; requires: Id[] }[]): void {
    const byId = new Map(list.map((e) => [e.id, e.requires]));
    const state = new Map<Id, 'open' | 'done'>();
    const visit = (id: Id): boolean => {
      if (state.get(id) === 'done') return false;
      if (state.get(id) === 'open') return true;
      state.set(id, 'open');
      const cyclic = (byId.get(id) ?? []).some(visit);
      state.set(id, 'done');
      return cyclic;
    };
    for (const e of list) {
      state.clear();
      if (visit(e.id)) this.fail(`${kind}/${e.id}`, 'requires lead into a cycle');
    }
  }
}

/** Claims every tile of a rect for `id`; returns the id of another region already holding one, else null. */
function claimRect(rect: { x: number; y: number; w: number; h: number }, mapW: number, id: Id, owner: Map<number, Id>): Id | null {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const other = owner.get(y * mapW + x);
      if (other !== undefined && other !== id) return other;
      owner.set(y * mapW + x, id);
    }
  }
  return null;
}
