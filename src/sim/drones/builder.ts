import type { TickContext } from '../blocks/types';
import { buildSite, startSite, unbuild } from '../construction';
import type { Building, DroneState } from '../state';
import type { World } from '../world';
import { approach, follow, spread } from './fly';
import { idleWork } from './haul';
import { gatherJobs, isOpenSite, stickyJob, waitingFor, waitOn, type Job } from './jobs';
import { fleetStats, opsOf, type FleetStats } from './tech';
import type { DroneAct } from './types';

/**
 * The drone fleet as builders: up to 5 identical drones work through
 * sites, removals, the ghost queue and dust boulders. Each takes the first job nobody else has (or stays on its
 * own); a drone with nothing left to do helps with a site, hauls supplies, mines or waits (haul.ts).
 * The construction rules stay in construction.ts.
 */

export { nextJob } from './jobs';

/** Seconds a drone needs to blow a dust boulder away, at build speed 1. */
const CLEAR_SECONDS = 0.45;

/**
 * A building drone does not stop at the edge of its range: it glides to a stand point `STAND` tiles from the piece
 * (more for a big one), so the beam stays short and a moving front (a belt line being laid) is followed in one run.
 * A quick piece (belt, pipe, pole) is only built from `QUICK_REACH` of the range, so the drone has to glide along
 * the line and the pieces appear one after the other under it, in the order they were drawn; anything bigger is
 * built from the full range.
 */
const STAND = 1;
const QUICK_REACH = 0.3;
/** Several drones stand this far apart (spread() gives each its own side). */
const FLOCK = 2;

const ACT: Record<Job['kind'], DroneAct> = { site: 'build', remove: 'remove', plan: 'build', clear: 'clear' };

/** Drones carrying a delivery or heading home finish that first. */
function committed(d: DroneState): boolean {
  return d.act === 'deliver' || d.act === 'return';
}

function removeWork(w: World, d: DroneState, job: Job, ctx: TickContext, speed: number): void {
  const b = job.building;
  if (!b || !w.byId.has(b.id) || !b.removing) return;
  d.task = 'remove';
  // a quick piece is gone within the tick: the tile stays on the drone so the beam still has somewhere to land
  d.tx = b.x;
  d.ty = b.y;
  unbuild(w, b, ctx, speed);
}

function siteWork(w: World, d: DroneState, b: Building | undefined, ctx: TickContext, speed: number): void {
  if (!b || !w.byId.has(b.id) || !isOpenSite(w, b)) return;
  d.task = 'build';
  d.waiting = buildSite(w, b, ctx, speed);
  if (d.waiting) waitOn(w, b, d.waiting);
}

function work(w: World, d: DroneState, job: Job, ctx: TickContext, speed: number): void {
  if (job.kind === 'remove') removeWork(w, d, job, ctx, speed);
  else if (job.kind === 'site') siteWork(w, d, job.building, ctx, speed);
  else if (job.kind === 'plan') startPlan(w, d, job, ctx, speed);
  else if (job.tile !== undefined) clearBoulder(w, d, job.tile, ctx, speed);
}

/** Turns the ghost into a site and works on it in the same tick, so no tick is lost between two pieces of a line. */
function startPlan(w: World, d: DroneState, job: Job, ctx: TickContext, speed: number): void {
  const i = w.state.plans.indexOf(job.plan!);
  if (i < 0) return;
  const [plan] = w.state.plans.splice(i, 1);
  const site = startSite(w, plan!, ctx);
  if (typeof site === 'string') {
    ctx.events.push({ type: 'plan-dropped', kind: plan!.kind, x: plan!.x, y: plan!.y, reason: site });
    return;
  }
  d.act = 'build';
  d.task = 'build';
  d.target = site.id;
  siteWork(w, d, site, ctx, speed);
}

function clearBoulder(w: World, d: DroneState, tile: number, ctx: TickContext, speed: number): void {
  const { map } = w.state;
  d.act = 'clear';
  d.task = 'idle';
  d.target = -1;
  d.tx = tile % map.w;
  d.ty = Math.floor(tile / map.w);
  d.hold = (d.hold ?? 0) + ctx.dt * speed;
  if (d.hold < CLEAR_SECONDS) return;
  d.hold = 0;
  map.boulder[tile] = 0;
  const queue = opsOf(w).boulders;
  queue.splice(queue.indexOf(tile), 1);
  ctx.events.push({ type: 'boulder-cleared', x: d.tx, y: d.ty });
  d.act = 'idle';
}

/** Gives every free drone a job: its own sticky one, else the first nobody has; with none left it helps on a site. */
function assign(w: World, drones: DroneState[], jobs: Job[]): (Job | null)[] {
  const taken = new Set<string>();
  const given = drones.map((d) => {
    const job = stickyJob(w, d);
    if (job) taken.add(job.key);
    return job;
  });
  const free = jobs.filter((j) => !taken.has(j.key));
  const help = jobs.find((j) => j.kind === 'site' || j.kind === 'remove') ?? null;
  return given.map((job, i) => {
    if (job || committed(drones[i]!)) return job;
    return free.shift() ?? help;
  });
}

/** Marks the job on the drone as soon as it is chosen, so it stays on it while flying there. */
function claim(w: World, d: DroneState, job: Job): void {
  d.task = 'idle';
  d.waiting = '';
  d.target = job.building ? job.building.id : -1;
  d.act = ACT[job.kind];
  if (job.tile !== undefined) {
    d.tx = job.tile % w.state.map.w;
    d.ty = Math.floor(job.tile / w.state.map.w);
  }
}

/** Glides to the stand point of a build or removal job and works on it once it is in reach. */
function runBuilder(d: DroneState, index: number, job: Job, ctx: TickContext, stats: FleetStats): boolean {
  const side = index > 0 ? spread(index) : { x: 0, y: 0 };
  const stand = Math.min(stats.range * 0.8, Math.max(STAND, job.size / 2 + 1.2));
  follow(d, job.x + side.x * FLOCK, job.y + side.y * FLOCK, ctx.dt, stats.speed, stand);
  return Math.hypot(job.x - d.x, job.y - d.y) <= (job.quick ? stats.range * QUICK_REACH : stats.range);
}

function runDrone(w: World, d: DroneState, index: number, job: Job | null, ctx: TickContext, stats: FleetStats): void {
  if (!job) {
    idleWork(w, d, index, ctx);
    if (d.act === 'idle') d.waiting = waitingFor(w);
    return;
  }
  claim(w, d, job);
  const ready = job.kind === 'clear' ? approach(d, job.x, job.y, ctx.dt, stats, stats.range) : runBuilder(d, index, job, ctx, stats);
  if (ready) work(w, d, job, ctx, stats.build);
}

export function stepDrones(w: World, ctx: TickContext): void {
  const drones = w.state.drones;
  if (drones.length === 0) return;
  const stats = fleetStats(w);
  const jobs = assign(w, drones, gatherJobs(w, drones.length));
  drones.forEach((d, i) => runDrone(w, d, i, jobs[i]!, ctx, stats));
}
