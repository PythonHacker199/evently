/**
 * In-memory rate limiting and response caching. Fine for a single Cloud Run instance:
 * state resets on cold start, which only makes limits more lenient and caches colder.
 */

/** Purge expired rate-limit entries once the map grows past this many clients. */
const RATE_LIMIT_SWEEP_THRESHOLD = 10_000;

/**
 * Fixed-window rate limiter keyed by an arbitrary string (the client IP).
 * @param {{ windowMs: number, max: number }} opts
 * @returns {(key: string, now?: number) => { allowed: boolean, retryAfterSec: number }}
 */
export function createRateLimiter({ windowMs, max }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();
  return (key, now = Date.now()) => {
    if (hits.size > RATE_LIMIT_SWEEP_THRESHOLD) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= max, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  };
}

/**
 * Small TTL + LRU cache so identical requests don't spend another Gemini call.
 * A Map keeps insertion order, so re-inserting on read moves an entry to the "recent" end.
 * @template T
 * @param {{ max: number, ttlMs: number }} opts
 */
export function createTtlCache({ max, ttlMs }) {
  /** @type {Map<string, { value: T, expires: number }>} */
  const store = new Map();
  return {
    /** @param {string} key @param {number} [now] @returns {T | undefined} */
    get(key, now = Date.now()) {
      const hit = store.get(key);
      if (!hit) return undefined;
      store.delete(key);
      if (hit.expires <= now) return undefined;
      store.set(key, hit);
      return hit.value;
    },
    /** @param {string} key @param {T} value @param {number} [now] */
    set(key, value, now = Date.now()) {
      store.delete(key);
      store.set(key, { value, expires: now + ttlMs });
      if (store.size > max) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
    get size() {
      return store.size;
    },
  };
}

/**
 * Resolve the client IP used for rate limiting.
 * @param {import('node:http').IncomingMessage} req
 * @param {boolean} trustProxy read X-Forwarded-For (set by Cloud Run's front end)
 */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // The right-most entry is appended by Google's front end; earlier ones are client-supplied.
    const last = forwarded.at(-1);
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
