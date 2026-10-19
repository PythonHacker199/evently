/**
 * Date helpers that work on calendar days in UTC, so plans never shift by a day
 * because of the server's or the user's time zone.
 */

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a strict YYYY-MM-DD string to a UTC-midnight Date. Rejects impossible dates like 2026-02-30.
 * @param {string} value
 * @returns {Date | null}
 */
export function parseISODate(value) {
  const m = ISO_DATE.exec(value ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Whole calendar days from `a` to `b` (positive when b is later).
 * @param {Date} a
 * @param {Date} b
 */
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * @param {Date} date
 * @param {number} days may be negative
 */
export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * UTC midnight for "today" given a clock.
 * @param {Date} [now]
 */
export function startOfUTCDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
