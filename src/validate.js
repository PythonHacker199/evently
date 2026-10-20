import { EVENT_TYPES, CURRENCIES, isEventType } from './templates.js';
import { parseISODate, daysBetween } from './dates.js';

export const LIMITS = Object.freeze({
  title: 80,
  location: 80,
  theme: 120,
  notes: 600,
  question: 500,
  description: 600,
  maxGuests: 10000,
  maxBudget: 1e11,
  maxLeadDays: 3 * 365,
  maxPriorities: 3,
});

// Control characters (except \n and \t) and the bidi overrides used in text-spoofing attacks.
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose of this pattern.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

/**
 * Normalise free text from users: strip control chars, collapse whitespace, cap length.
 * @param {unknown} value
 * @param {number} max
 * @param {{ multiline?: boolean }} [opts]
 * @returns {string}
 */
export function cleanText(value, max, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  let text = value.replace(UNSAFE_CHARS, '');
  text = multiline
    ? text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : text.replace(/\s+/g, ' ');
  return text.trim().slice(0, max);
}

/**
 * Parse a positive number from a string or number input.
 * @param {unknown} value
 * @returns {number}
 */
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.replace(/[,_\s]/g, ''));
  return Number.NaN;
}

/**
 * @typedef {object} PlanInput
 * @property {'wedding'|'birthday'|'community'} eventType
 * @property {string} title
 * @property {string} date ISO date (YYYY-MM-DD)
 * @property {number} guests
 * @property {number} budget whole currency units
 * @property {string} currency ISO 4217 code
 * @property {string} location
 * @property {string} theme
 * @property {string} notes
 * @property {string[]} priorities budget category keys to emphasise
 */

/**
 * Validate and normalise the body of a plan request.
 * @param {unknown} body parsed JSON body
 * @param {Date} today UTC midnight of the current day
 * @returns {{ ok: true, value: PlanInput } | { ok: false, errors: Record<string, string> }}
 */
export function validatePlanInput(body, today) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: { form: 'Request body must be a JSON object.' } };
  }
  const b = /** @type {Record<string, unknown>} */ (body);

  const eventType = b.eventType;
  if (!isEventType(eventType)) errors.eventType = 'Choose wedding, birthday or community event.';

  const dateStr = typeof b.date === 'string' ? b.date.trim() : '';
  const date = parseISODate(dateStr);
  if (!date) {
    errors.date = 'Enter a valid date.';
  } else {
    const lead = daysBetween(today, date);
    if (lead < 0) errors.date = 'The event date must be today or in the future.';
    else if (lead > LIMITS.maxLeadDays) errors.date = 'Plans can be made up to 3 years ahead.';
  }

  const guests = toNumber(b.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > LIMITS.maxGuests) {
    errors.guests = `Guests must be a whole number between 1 and ${LIMITS.maxGuests.toLocaleString('en')}.`;
  }

  const budget = toNumber(b.budget);
  if (!Number.isFinite(budget) || budget < 1 || budget > LIMITS.maxBudget) {
    errors.budget = 'Enter a budget of at least 1.';
  }

  const currency = typeof b.currency === 'string' ? b.currency.toUpperCase() : 'INR';
  if (!CURRENCIES.includes(currency)) errors.currency = 'Choose a supported currency.';

  /** @type {string[]} */
  let priorities = [];
  if (b.priorities !== undefined) {
    if (!Array.isArray(b.priorities)) {
      errors.priorities = 'Priorities must be a list.';
    } else if (isEventType(eventType)) {
      const allowed = new Set(EVENT_TYPES[eventType].budget.map((c) => c.key).filter((k) => k !== 'contingency'));
      priorities = [...new Set(b.priorities.filter((p) => typeof p === 'string' && allowed.has(p)))];
      if (priorities.length > LIMITS.maxPriorities) errors.priorities = `Pick up to ${LIMITS.maxPriorities} priorities.`;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      eventType: /** @type {PlanInput['eventType']} */ (eventType),
      title: cleanText(b.title, LIMITS.title),
      date: dateStr,
      guests,
      budget: Math.round(budget),
      currency,
      location: cleanText(b.location, LIMITS.location),
      theme: cleanText(b.theme, LIMITS.theme),
      notes: cleanText(b.notes, LIMITS.notes, { multiline: true }),
      priorities,
    },
  };
}

/**
 * Validate a follow-up question for the assistant.
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateQuestion(value) {
  const q = cleanText(value, LIMITS.question, { multiline: true });
  if (q.length < 3) return { ok: false, error: 'Ask a question of at least 3 characters.' };
  return { ok: true, value: q };
}

/**
 * Validate a free-text event description. Rejects (rather than truncates) long text so the
 * parser never silently drops details the user typed at the end.
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateDescription(value) {
  const text = cleanText(value, LIMITS.description + 1, { multiline: true });
  if (text.length < 10) return { ok: false, error: 'Describe your event in at least 10 characters.' };
  if (text.length > LIMITS.description) return { ok: false, error: `Keep the description under ${LIMITS.description} characters.` };
  return { ok: true, value: text };
}
