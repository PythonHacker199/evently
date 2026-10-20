// The last plan and per-plan progress, kept in localStorage only (nothing is sent to the server).

const STORAGE_KEY = 'eventwise:v1';
/** Progress is kept for this many plans; older ones are dropped. */
const MAX_SAVED_PROGRESS = 10;

/** @typedef {{ tasks: Record<string, boolean>, vendors: Record<string, boolean>, actual: Record<string, number> }} Progress */
/** @typedef {{ plan: any, progress: Record<string, Progress> }} Store */

/** @returns {Store} */
export function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (data && typeof data === 'object') return { plan: data.plan ?? null, progress: data.progress ?? {} };
  } catch {
    /* storage unavailable or corrupted: start fresh */
  }
  return { plan: null, progress: {} };
}

/** @param {Store} store */
export function saveStore(store) {
  try {
    const ids = Object.keys(store.progress);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SAVED_PROGRESS))) delete store.progress[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* private mode or quota: the app still works for this session */
  }
}

/**
 * Progress record for a plan, created on first use.
 * @param {Store} store
 * @param {string} planId
 * @returns {Progress}
 */
export function progressFor(store, planId) {
  store.progress[planId] ??= { tasks: {}, vendors: {}, actual: {} };
  return store.progress[planId];
}
