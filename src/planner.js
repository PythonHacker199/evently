import { createHash } from 'node:crypto';
import { EVENT_TYPES } from './templates.js';
import { addDays, daysBetween, formatISODate, parseISODate } from './dates.js';

/** How much extra weight a user-selected priority category gets before re-normalising. */
export const PRIORITY_BOOST = 1.35;

/**
 * Split a total budget across categories so the parts always add up to the exact total.
 *
 * Uses the largest-remainder method: floor every share, then hand the leftover units to the
 * categories with the biggest fractional parts. Plain rounding can drift by a few units.
 *
 * @param {{ key: string, label: string, pct: number }[]} categories base percentages (sum 100)
 * @param {number} total whole currency units
 * @param {string[]} [priorities] category keys to boost
 * @returns {{ key: string, label: string, pct: number, amount: number, priority: boolean }[]}
 */
export function allocateBudget(categories, total, priorities = []) {
  const boosted = new Set(priorities);
  const weights = categories.map((c) => c.pct * (boosted.has(c.key) ? PRIORITY_BOOST : 1));
  const weightSum = weights.reduce((s, w) => s + w, 0);

  const raw = weights.map((w) => (w / weightSum) * total);
  const amounts = raw.map(Math.floor);
  let leftover = total - amounts.reduce((s, a) => s + a, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; leftover > 0; k = (k + 1) % byRemainder.length, leftover -= 1) {
    amounts[byRemainder[k].i] += 1;
  }

  return categories.map((c, i) => ({
    key: c.key,
    label: c.label,
    pct: Math.round((weights[i] / weightSum) * 1000) / 10,
    amount: amounts[i],
    priority: boosted.has(c.key),
  }));
}

/**
 * Map a recommended "days before event" onto the lead time actually available.
 *
 * Milestones in the final stretch (<= anchor days) keep their real offsets because they are
 * tied to the event itself (RSVP chase, run sheet). Earlier milestones are squeezed linearly into
 * the remaining window, so the order is preserved and nothing lands in the past.
 *
 * @param {number} days recommended offset (negative = after the event)
 * @param {number} leadDays days from today until the event
 * @param {number} maxDays largest recommended offset in the template
 */
export function compressOffset(days, leadDays, maxDays) {
  if (days <= 0 || leadDays >= maxDays) return days;
  const anchor = Math.min(14, Math.floor(leadDays / 2));
  if (days <= anchor) return days;
  return Math.round(anchor + ((days - anchor) * (leadDays - anchor)) / (maxDays - anchor));
}

/**
 * Stable short id for a plan, derived from its normalised input. Used for client-side progress.
 * @param {object} input
 */
export function planId(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 12);
}

/**
 * Build the deterministic part of a plan: budget, timeline, vendor checklist and warnings.
 * All numbers shown to the user come from here, never from the language model.
 *
 * @param {import('./validate.js').PlanInput} input validated input
 * @param {Date} today UTC midnight
 */
export function buildPlan(input, today) {
  const tpl = EVENT_TYPES[input.eventType];
  const eventDate = /** @type {Date} */ (parseISODate(input.date));
  const leadDays = daysBetween(today, eventDate);
  const maxDays = Math.max(...tpl.milestones.map((m) => m.days));
  const compressed = leadDays < maxDays;

  const categories = allocateBudget(tpl.budget, input.budget, input.priorities);
  const amountByKey = Object.fromEntries(categories.map((c) => [c.key, c.amount]));

  const timeline = tpl.milestones.map((m) => {
    const offset = compressOffset(m.days, leadDays, maxDays);
    const due = addDays(eventDate, -offset);
    return {
      id: m.id,
      title: m.title,
      detail: m.detail,
      dueDate: formatISODate(due),
      daysFromToday: daysBetween(today, due),
      phase: m.days > 0 ? 'before' : m.days === 0 ? 'event' : 'after',
    };
  });

  const vendors = tpl.vendors.map((v) => {
    const offset = compressOffset(v.leadDays, leadDays, maxDays);
    const shared = tpl.vendors.filter((o) => o.budgetKey === v.budgetKey).length;
    return {
      key: v.key,
      name: v.name,
      budgetKey: v.budgetKey,
      // Two vendors can draw from one category (e.g. permits + safety); show their share.
      allocated: Math.floor((amountByKey[v.budgetKey] ?? 0) / shared),
      bookBy: formatISODate(addDays(eventDate, -offset)),
      questions: v.questions,
      mapsQuery: input.location ? `${v.mapsTerm} near ${input.location}` : '',
    };
  });

  const warnings = [];
  if (compressed) {
    warnings.push(
      `Short notice: ${leadDays} day${leadDays === 1 ? '' : 's'} to go vs. ~${maxDays} recommended. ` +
        'The timeline has been compressed. Book the most in-demand vendors first.',
    );
  }
  if (leadDays <= 7) warnings.push('Less than a week left: focus on venue, food and confirming guests.');
  if (input.eventType === 'community' && input.guests >= 300) {
    warnings.push('Large public gathering: check crowd-safety, first-aid and permit requirements with local authorities.');
  }
  if (input.budget / input.guests < 1) {
    warnings.push('The budget is less than one currency unit per guest. Double-check the amount.');
  }

  return {
    id: planId(input),
    input,
    eventLabel: tpl.label,
    generatedOn: formatISODate(today),
    summary: {
      daysUntil: leadDays,
      recommendedLeadDays: maxDays,
      compressed,
      perGuest: Math.round(input.budget / input.guests),
    },
    budget: { currency: input.currency, total: input.budget, categories },
    timeline,
    vendors,
    warnings,
  };
}
