/** Simulation ticks per second. Everything in the sim is measured in ticks of this length. */
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_SECONDS = 1 / TICK_HZ;

/**
 * Save format version. A save with another version is not migrated: its slot shows as empty and starts fresh.
 * Bump it when SimState changes shape.
 */
export const SAVE_VERSION = 101;

/** Belt item positions run 0..BELT_LEN along one tile (integers keep the belt math exact and deterministic). */
export const BELT_LEN = 1000;
/** Item slots a belt tile stores (the visible slots are rules.beltSlots <= this). */
export const BELT_SLOTS = 4;
