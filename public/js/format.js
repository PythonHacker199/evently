// Date and number formatting. Dates are handled as UTC calendar days so a plan never shifts
// by a day because of the viewer's time zone.

export const DAY_MS = 86_400_000;

/** UTC midnight (ms) of the viewer's current local date. */
export function todayUTC() {
  const t = new Date();
  return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
}

/** @param {string} iso YYYY-MM-DD */
export function isoToUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** @param {number} ms @returns {string} YYYY-MM-DD */
export const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);

/** @param {string} iso */
export const daysFromToday = (iso) => Math.round((isoToUTC(iso) - todayUTC()) / DAY_MS);

/** @param {string} iso */
export function formatDate(iso) {
  return new Date(isoToUTC(iso)).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "tomorrow", "in 3 weeks", "2 months ago"... @param {number} days */
export function relativeDays(days) {
  if (Math.abs(days) >= 60) return relative.format(Math.round(days / 30), 'month');
  if (Math.abs(days) >= 14) return relative.format(Math.round(days / 7), 'week');
  return relative.format(days, 'day');
}

/** @param {number} amount @param {string} currency ISO 4217 code */
export function formatMoney(amount, currency) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** @param {number} n */
export const formatNumber = (n) => new Intl.NumberFormat().format(n);
