// Google Calendar and Maps links. Both are plain URLs, so no API key is needed.

const DAY_MS = 86_400_000;

/** @param {string} iso YYYY-MM-DD @returns {string} YYYYMMDD */
const compact = (iso) => iso.replaceAll('-', '');

/** The calendar day after `iso`. @param {string} iso YYYY-MM-DD */
export function nextDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + DAY_MS).toISOString().slice(0, 10);
}

/**
 * All-day Google Calendar event template.
 * @param {string} title
 * @param {string} iso YYYY-MM-DD
 * @param {string} details
 */
export function googleCalendarUrl(title, iso, details) {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${compact(iso)}/${compact(nextDay(iso))}`, details });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** @param {string} query */
export function googleMapsUrl(query) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`;
}
