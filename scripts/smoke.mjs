#!/usr/bin/env node
/**
 * Smoke test of the production build in Chromium (SwiftShader): every check boots a fresh page and fails on a
 * boot error or a console error.
 *
 *   npm run smoke                 (builds first)
 *   npm run smoke -- --no-build
 *
 * 1. Main menu -> "Quick Round" starts a round (the menu closes, the HUD and palette show).
 * 2. A seeded run with the checkpoint plan (drill, belt, smelter as ghosts): after 90 s of game time the drone has
 *    built it and copper reached the core.
 * 3. Placing over a belt and salvage: a smelter ghost over a belt line gets built (belts give way).
 * 4. Decoration can be picked: in every camera angle the pointer on a prop's (or junction box's) body shows the hover
 *    card, a click selects it, Backspace removes it, and a right click removes another; the others stay. The hover
 *    follows a camera move under a standing mouse.
 * 5. A drag with the demolish tool covers a rectangle on the screen in iso (a box of tiles in steep and top) and marks
 *    exactly the buildings inside for removal.
 * 6. Click a building, pick its recipe: a click on a smelter opens the configuration panel, a click on "Lead Ingot"
 *    sets the recipe (the sim's `config`), Esc closes the panel.
 * 7. The tutorial's first three steps with real clicks: the palette entry, the glowing spot (the ring is where the click
 *    goes; once the drone has the ghost the ring is gone, it does not hop to the next patch), a dragged belt home, and the
 *    guide asks for iron. The order card steps back while the guide runs; the ground rings lie under the HUD.
 * 8. The three camera angles boot (iso, steep, top) and the stress scene boots.
 * Port: 4340 unless GB_PORT says otherwise (4317 is the default preview port).
 */
import { parseArgs } from 'node:util';
import { BASE_URL, build, launchBrowser, openGame, startPreview } from './lib/preview.mjs';

const { values } = parseArgs({ options: { 'no-build': { type: 'boolean', default: false } } });

async function page(browser, query, errors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { context, page: await openGame(context, `${BASE_URL}?${query}`, errors) };
}

/** A base with a few machines around the core, so the deco planner has something to dress. */
const DECO_BASE = `
  const g = window.groundbreak, w = g.game.world, c = w.core;
  const kinds = ['smelter', 'graphite-press', 'wire-mill', 'glass-kiln', 'container', 'silicon-smelter', 'steel-foundry', 'refinery'];
  [[-9, -3], [-9, 4], [8, -4], [8, 5], [-3, -10], [4, -10], [-3, 9], [5, 10], [-16, 0], [16, 0], [-14, -9], [14, 9]].forEach(([dx, dy], i) => g.sim.placeNow(kinds[i % kinds.length], c.x + dx, c.y + dy));
`;

/** Puts the camera on a deco piece's body and returns where its middle is on the screen. */
async function aimAt(p, piece) {
  return p.evaluate((b) => {
    const g = window.groundbreak;
    g.view.camera.lookAt((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    g.step(3);
    const s = g.view.camera.worldToScreen((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    return { x: s.x, y: s.y };
  }, piece.box);
}

/** Whether no other piece's body box overlaps this one's (so the pointer in its middle can only mean it). */
const apart = (a, b) => a.box.right < b.box.left || b.box.right < a.box.left || a.box.bottom < b.box.top || b.box.bottom < a.box.top;
const alone = (list, q) => list.every((o) => o === q || apart(q, o));

const cardTitle = (p) => p.evaluate(() => document.querySelector('.hover-card .hover-title')?.textContent ?? null);

/** Hover: the card names the piece when the pointer is on its body (the middle, where the old tile picking missed tall ones). */
async function checkHover(p, errors, tag, pieces) {
  for (const piece of pieces) {
    const at = await aimAt(p, piece);
    await p.mouse.move(at.x, at.y);
    await p.waitForTimeout(300);
    const title = await cardTitle(p);
    if (!title || (piece.kind === 'junction') !== /junction/i.test(title)) errors.push(`${tag} hover on a ${piece.kind} shows "${title}"`);
  }
}

/** The camera moves under a standing mouse (a tutorial pan): the hover is worked out again, not left on what used to be there. */
async function checkHoverFollowsCamera(p, errors, tag) {
  const hover = () => p.evaluate(() => JSON.stringify(window.groundbreak.interaction.hover));
  const before = await hover();
  await p.evaluate(() => {
    const g = window.groundbreak;
    g.view.camera.lookAt(g.view.camera.x + 700, g.view.camera.y + 400);
    g.step(3);
  });
  if ((await hover()) === before) errors.push(`${tag} the hover did not follow a camera move while the mouse stood still`);
}

/** A click selects the prop, Backspace removes it (and only it). */
async function checkClickAndBackspace(p, errors, tag, prop) {
  const at = await aimAt(p, prop);
  await p.mouse.move(at.x, at.y);
  await p.mouse.click(at.x, at.y);
  const sel = await p.evaluate(() => window.groundbreak.interaction.selectedDeco);
  if (!sel || sel.x !== prop.x || sel.y !== prop.y) errors.push(`${tag} click on a ${prop.kind} selected ${JSON.stringify(sel)}`);
  await p.keyboard.press('Backspace');
  await p.evaluate(() => window.groundbreak.step(30));
  const { removed, w } = await p.evaluate(() => ({ removed: window.groundbreak.game.world.state.deco.removed.slice(), w: window.groundbreak.game.world.state.map.w }));
  if (removed.length !== 1 || removed[0] !== prop.y * w + prop.x) errors.push(`${tag} Backspace removed ${JSON.stringify(removed)}`);
}

/** A right click removes a junction box (one that still stands after the prop went: removing a prop re-lays the cables). */
async function checkRightClick(p, errors, tag) {
  const pieces = await p.evaluate(() => window.groundbreak.view.deco.pieces());
  const box = pieces.find((q) => q.kind === 'junction' && alone(pieces, q));
  if (!box) return errors.push(`${tag} no junction box left to right click`);
  const at = await aimAt(p, box);
  await p.mouse.move(at.x, at.y);
  await p.mouse.click(at.x, at.y, { button: 'right' });
  await p.evaluate(() => window.groundbreak.step(30));
  const { removed, w } = await p.evaluate(() => ({ removed: window.groundbreak.game.world.state.deco.removed.slice(), w: window.groundbreak.game.world.state.map.w }));
  if (removed.length !== 2 || !removed.includes(box.y * w + box.x)) errors.push(`${tag} right click on a junction box left ${JSON.stringify(removed)}`);
}

async function decoPicking(browser, errors, view) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('groundbreak.tutorial.v2', 'done')); // the tutorial pans the camera
  const p = await openGame(context, `${BASE_URL}?seed=7&dev&manual&zoom=1.4&view=${view}`, errors);
  const tag = `[${view}]`;
  await p.evaluate(`(() => {${DECO_BASE}})()`);
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() => window.groundbreak.step(20));
    await p.waitForTimeout(250);
  }
  const pieces = await p.evaluate(() => window.groundbreak.view.deco.pieces());
  const prop = pieces.find((q) => q.kind !== 'junction' && alone(pieces, q));
  const box = pieces.find((q) => q.kind === 'junction' && alone(pieces, q));
  if (prop && box && pieces.length >= 4) {
    await checkHover(p, errors, tag, [prop, box]);
    await checkHoverFollowsCamera(p, errors, tag);
    await checkClickAndBackspace(p, errors, tag, prop);
    await checkRightClick(p, errors, tag);
  } else errors.push(`${tag} the base has too little deco to check picking (${pieces.length} pieces)`);
  await context.close();
}

/** A field of batteries, the demolish tool and a real mouse drag across it. */
async function dragArea(browser, errors, view) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('groundbreak.tutorial.v2', 'done'));
  const p = await openGame(context, `${BASE_URL}?seed=7&dev&manual&zoom=1&view=${view}`, errors);
  const tag = `[${view}]`;
  const x0 = await p.evaluate(() => {
    const g = window.groundbreak;
    const c = g.game.world.core;
    for (let i = 0; i < 144; i++) g.sim.placeNow('battery', c.x - 20 + (i % 12), c.y - 18 + Math.floor(i / 12));
    g.step(10);
    const at = g.view.camera.screenToWorld(g.screenOfTile(c.x - 14, c.y - 12).x, g.screenOfTile(c.x - 14, c.y - 12).y);
    g.view.camera.lookAt(at.x, at.y);
    g.interaction.startRemoving();
    g.step(3);
    return c.x - 20;
  });
  const at = (x, y) => p.evaluate(([tx, ty]) => window.groundbreak.screenOfTile(tx, ty), [x, y]);
  const y0 = await p.evaluate(() => window.groundbreak.game.world.core.y - 18);
  const a = await at(x0 + 2, y0 + 3);
  const b = await at(x0 + 9, y0 + 7);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  await p.mouse.move(b.x, b.y, { steps: 8 });
  const area = await p.evaluate(() => {
    const r = window.groundbreak.interaction.removeArea();
    return r && { rect: r.rect !== null, count: r.count, tiles: r.tiles().map((t) => `${t.x},${t.y}`) };
  });
  await p.mouse.up();
  await p.evaluate(() => window.groundbreak.step(40));
  const marked = await p.evaluate(() => window.groundbreak.game.world.state.buildings.filter((q) => q.removing || q.build <= 0).map((q) => `${q.x},${q.y}`));
  if (!area || area.rect !== (view === 'iso')) errors.push(`${tag} drag area has rect=${area?.rect}`);
  else if (area.count < 8) errors.push(`${tag} the drag covers only ${area.count} tiles`);
  else if (marked.length === 0 || marked.some((m) => !area.tiles.includes(m))) errors.push(`${tag} removal marks ${marked.length} buildings, not the ones in the area`);
  await context.close();
}

/** The tutorial's ring on the ground (the glowing spot): its middle on the screen, or null while there is none. */
async function ringAt(p) {
  const ring = p.locator('.tut-marker:not([data-off="true"]) .tut-ring').first();
  if (!(await ring.count())) return null;
  const r = await ring.boundingBox();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
}

/** Game time on the manual clock until `done` (a function of the world) holds, at most `max` seconds. */
async function playUntil(p, done, max) {
  for (let t = 0; t <= max; t += 2) {
    if (await p.evaluate(`(() => { const w = window.groundbreak.game.world; return (${done})(w); })()`)) return true;
    await p.evaluate(() => window.groundbreak.step(60));
    await p.waitForTimeout(30);
  }
  return false;
}

/** A real click on the map: the manual clock needs a step after the pointer moved, so the hover is worked out. */
async function clickMap(p, at) {
  await p.mouse.move(at.x, at.y);
  await p.evaluate(() => window.groundbreak.step(3));
  await p.waitForTimeout(120);
  await p.mouse.click(at.x, at.y);
}

/** Runs IN THE PAGE (`evaluate`): tiles for a belt from the newest finished building of a kind to the core, as screen points. */
function beltEnds(kind) {
  const g = window.groundbreak;
  const w = g.game.world;
  const src = w.state.buildings.filter((b) => w.def(b).id === kind && w.ready(b)).at(-1);
  const core = w.core;
  const cs = w.def(core).size;
  const ss = w.def(src).size;
  const dx = core.x + cs / 2 - (src.x + ss / 2);
  const dy = core.y + cs / 2 - (src.y + ss / 2);
  const alongX = Math.abs(dx) >= Math.abs(dy);
  const from = alongX ? { x: dx < 0 ? src.x - 1 : src.x + ss, y: src.y } : { x: src.x, y: dy < 0 ? src.y - 1 : src.y + ss };
  const to = alongX ? { x: dx < 0 ? core.x + cs : core.x - 1, y: core.y + Math.min(cs - 1, Math.max(0, src.y - core.y)) } : { x: core.x + Math.min(cs - 1, Math.max(0, src.x - core.x)), y: dy < 0 ? core.y + cs : core.y - 1 };
  return { from: g.screenOfTile(from.x, from.y), to: g.screenOfTile(to.x, to.y) };
}

/** The tutorial card's counter ("3 / 8") or its title. */
const guideStep = (p) => p.evaluate(() => document.querySelector('.tut-count')?.textContent?.replace(/\s/g, '') ?? null);

/** The ground rings lie under the HUD and the order card has stepped back while the guide runs. */
async function checkGuideLevels(p, errors) {
  const levels = await p.evaluate(() => ({
    layer: Number(getComputedStyle(document.querySelector('.tut-layer')).zIndex),
    hud: Number(getComputedStyle(document.querySelector('.hud')).zIndex),
    flag: document.documentElement.dataset.tutorial,
    rows: [...document.querySelectorAll('.orders .order')].filter((o) => getComputedStyle(o).display !== 'none').length,
  }));
  if (!(levels.layer < levels.hud)) errors.push(`the ground rings (z ${levels.layer}) are not under the HUD (z ${levels.hud})`);
  if (levels.flag !== 'on' || levels.rows !== 0) errors.push(`the order card does not step back while the guide runs (flag ${levels.flag}, ${levels.rows} rows)`);
}

/** Step 1 with the mouse: the palette entry, then the glowing spot; the drone builds it and the ring does not hop away. */
async function placeFirstDrill(p, errors) {
  const spot = await ringAt(p);
  if (!spot) return errors.push('no ring on the ground in step 1');
  await p.locator('.pal-item[data-building="mechanical-drill"]').click();
  await clickMap(p, spot);
  await p.evaluate(() => window.groundbreak.step(30));
  await p.waitForTimeout(300);
  if (await ringAt(p)) errors.push('the ring is still there (it hops to the next patch) after the drone has the ghost');
  if (!(await playUntil(p, '(w) => w.state.buildings.some((b) => w.def(b).id === "mechanical-drill" && w.ready(b))', 60))) return errors.push('the drone did not build the drill');
  await p.mouse.click(700, 300, { button: 'right' });
  await p.waitForTimeout(400);
}

/** Step 2 with the mouse: the conveyor from the palette's Logistics tab, dragged from the drill to the core. */
async function dragBeltHome(p, errors) {
  await p.locator('[data-category="logistics"]').click();
  await p.waitForTimeout(250);
  await p.locator('.pal-item[data-building="conveyor"]').click();
  const ends = await p.evaluate(`(${beltEnds.toString()})("mechanical-drill")`);
  await p.mouse.move(ends.from.x, ends.from.y);
  await p.evaluate(() => window.groundbreak.step(3));
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(ends.from.x + ((ends.to.x - ends.from.x) * i) / 10, ends.from.y + ((ends.to.y - ends.from.y) * i) / 10);
    await p.evaluate(() => window.groundbreak.step(2));
  }
  await p.waitForTimeout(150);
  await p.mouse.up();
  if (!(await playUntil(p, '(w) => (w.state.stats.delivered[w.content.materials.indexOf("copper-ore")] ?? 0) > 0', 90))) errors.push('no copper arrived over the dragged belt');
  await p.mouse.click(700, 300, { button: 'right' });
  await p.waitForTimeout(500);
}

async function tutorialClicks(browser, errors) {
  const { context, page: p } = await page(browser, 'seed=7&dev&manual', errors); // a fresh page: the tutorial is on
  await p.evaluate(() => window.groundbreak.step(60));
  await p.waitForTimeout(500);
  if ((await guideStep(p)) !== '1/8') errors.push(`the guide starts at ${await guideStep(p)}, not 1/8`);
  await checkGuideLevels(p, errors);
  await placeFirstDrill(p, errors);
  if ((await guideStep(p)) !== '2/8') errors.push(`after the drill the guide is at ${await guideStep(p)}, not 2/8`);
  else {
    await dragBeltHome(p, errors);
    const title = await p.evaluate(() => document.querySelector('.tut-title')?.textContent);
    if ((await guideStep(p)) !== '3/8' || title !== 'Drill for iron') errors.push(`after the belt the guide is at ${await guideStep(p)} ("${title}"), not 3/8 "Drill for iron"`);
  }
  await context.close();
}

const checks = {
  async 'menu -> Quick Round'(browser, errors) {
    const { context, page: p } = await page(browser, 'menu', errors);
    await p.getByRole('button', { name: /quick round/i }).click();
    await p.waitForFunction(() => !document.querySelector('.menu, .main-menu'), null, { timeout: 30_000 }).catch(() => errors.push('menu did not close'));
    await p.waitForTimeout(1500);
    if (!(await p.locator('[data-building="mechanical-drill"]').count())) errors.push('palette entry for the mechanical drill missing');
    await context.close();
  },
  async 'checkpoint through ghosts and the drone'(browser, errors) {
    const { context, page: p } = await page(browser, 'seed=7&dev&manual', errors);
    await p.waitForTimeout(800);
    const copper = await p.evaluate(() => {
      const g = window.groundbreak;
      g.demo();
      for (let i = 0; i < 18; i++) g.step(150);
      const w = g.game.world;
      return w.state.stats.delivered[w.content.materials.indexOf('copper-ore')] ?? 0;
    });
    if (!(copper > 0)) errors.push(`no copper delivered (${copper})`);
    await context.close();
  },
  async 'buildings replace belts'(browser, errors) {
    const { context, page: p } = await page(browser, 'seed=7&dev&manual', errors);
    await p.waitForTimeout(800);
    const result = await p.evaluate(() => {
      const g = window.groundbreak;
      const w = g.game.world;
      const core = w.core;
      const y = core.y + 5;
      const x = core.x + 6;
      g.game.enqueue({ type: 'dev-give', item: 'copper-ore', n: 500 });
      g.game.enqueue({ type: 'dev-give', item: 'iron-ore', n: 500 });
      g.game.enqueue({ type: 'place-many', plans: [0, 1, 2, 3].map((i) => ({ kind: 'conveyor', x: x + i, y, rot: 0 })) });
      for (let i = 0; i < 12; i++) g.step(150);
      const belts = w.state.buildings.filter((b) => w.def(b).id === 'conveyor' && b.y === y && b.build >= 1).length;
      g.game.enqueue({ type: 'place', kind: 'smelter', x: x + 1, y, rot: 0 });
      for (let i = 0; i < 12; i++) g.step(150);
      const smelter = w.state.buildings.find((b) => w.def(b).id === 'smelter' && b.x === x + 1 && b.y === y);
      return { belts, smelter: smelter ? smelter.build : -1 };
    });
    if (result.belts < 4) errors.push(`belt line not built (${result.belts}/4)`);
    if (result.smelter < 1) errors.push(`smelter over the belts not built (${result.smelter})`);
    await context.close();
  },
  async 'decoration: hover, click, Backspace, right click'(browser, errors) {
    for (const view of ['iso', 'steep', 'top']) await decoPicking(browser, errors, view);
  },
  async 'drag areas: screen rectangle in iso, box of tiles in steep and top'(browser, errors) {
    for (const view of ['iso', 'steep', 'top']) await dragArea(browser, errors, view);
  },
  async 'click a building, pick its recipe'(browser, errors) {
    const { context, page: p } = await page(browser, 'seed=7&dev&manual', errors);
    await p.waitForTimeout(800);
    const at = await p.evaluate(() => {
      const g = window.groundbreak;
      const c = g.game.world.core;
      g.sim.placeNow('smelter', c.x - 8, c.y - 3);
      g.view.centreOnCore();
      g.step(30);
      return { x: c.x - 8, y: c.y - 3 };
    });
    await p.waitForTimeout(400);
    const where = await p.evaluate(({ x, y }) => window.groundbreak.screenOfTile(x + 0.5, y + 0.5), at);
    await p.mouse.click(where.x, where.y);
    await p.locator('.cfg-panel').waitFor({ timeout: 10_000 }).catch(() => errors.push('no configuration panel after clicking the smelter'));
    await p.locator('.cfg-tile', { hasText: 'Lead Ingot' }).click({ timeout: 10_000 }).catch(() => errors.push('no "Lead Ingot" tile in the panel'));
    const config = await p.evaluate(({ x, y }) => {
      window.groundbreak.step(3);
      return window.groundbreak.game.world.at(x, y)?.config;
    }, at);
    if (config !== 1) errors.push(`smelter config is ${config}, expected 1 (lead)`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    if (await p.locator('.cfg-panel').count()) errors.push('panel still open after Esc');
    await context.close();
  },
  async 'tutorial to step 3 with real clicks'(browser, errors) {
    await tutorialClicks(browser, errors);
  },
  async 'views and stress scene'(browser, errors) {
    for (const q of ['seed=7&view=iso', 'seed=7&view=steep', 'seed=7&view=top', 'dev&stress=3000,10000']) {
      const { context } = await page(browser, q, errors);
      await context.close();
    }
  },
};

async function main() {
  if (!values['no-build']) build();
  const stop = await startPreview();
  let failed = false;
  try {
    const browser = await launchBrowser();
    for (const [name, check] of Object.entries(checks)) {
      const errors = [];
      try {
        await check(browser, errors);
      } catch (e) {
        errors.push(String(e));
      }
      console.log(`${errors.length ? 'FAIL' : 'ok  '} ${name}`);
      for (const e of errors) console.log(`     ${e}`);
      failed ||= errors.length > 0;
    }
    await browser.close();
  } finally {
    stop();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
