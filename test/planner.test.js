import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { allocateBudget, buildPlan, compressOffset, PRIORITY_BOOST } from '../src/planner.js';
import { validatePlanInput, validateQuestion, cleanText } from '../src/validate.js';
import { parseISODate, daysBetween, addDays, formatISODate } from '../src/dates.js';
import { EVENT_TYPES, EVENT_TYPE_KEYS, getPublicConfig } from '../src/templates.js';

const TODAY = parseISODate('2026-10-19');

/** @param {object} [over] */
function input(over = {}) {
  const res = validatePlanInput(
    { eventType: 'wedding', date: '2027-10-19', guests: 150, budget: 1_000_000, currency: 'INR', priorities: [], ...over },
    TODAY,
  );
  assert.ok(res.ok, JSON.stringify(res));
  return res.value;
}

describe('templates', () => {
  for (const key of EVENT_TYPE_KEYS) {
    test(`${key} budget percentages sum to 100`, () => {
      assert.equal(EVENT_TYPES[key].budget.reduce((s, c) => s + c.pct, 0), 100);
    });
    test(`${key} vendors reference real budget categories`, () => {
      const keys = new Set(EVENT_TYPES[key].budget.map((c) => c.key));
      for (const v of EVENT_TYPES[key].vendors) assert.ok(keys.has(v.budgetKey), `${v.key} -> ${v.budgetKey}`);
    });
  }
  test('public config hides the contingency category from priorities', () => {
    const cfg = getPublicConfig();
    assert.equal(cfg.eventTypes.length, 3);
    for (const t of cfg.eventTypes) assert.ok(!t.categories.some((c) => c.key === 'contingency'));
  });
});

describe('dates', () => {
  test('rejects impossible and malformed dates', () => {
    assert.equal(parseISODate('2026-02-30'), null);
    assert.equal(parseISODate('2026-2-3'), null);
    assert.equal(parseISODate('not a date'), null);
    assert.ok(parseISODate('2028-02-29'));
  });
  test('day arithmetic is timezone-proof', () => {
    const a = parseISODate('2026-03-01');
    assert.equal(daysBetween(a, parseISODate('2026-03-31')), 30);
    assert.equal(formatISODate(addDays(a, -1)), '2026-02-28');
  });
});

describe('allocateBudget', () => {
  const cats = EVENT_TYPES.wedding.budget;

  test('parts always add up to the exact total', () => {
    for (const total of [1, 7, 999, 123_457, 1_000_000, 98_765_431]) {
      const parts = allocateBudget(cats, total);
      assert.equal(parts.reduce((s, c) => s + c.amount, 0), total, `total ${total}`);
      assert.ok(parts.every((c) => Number.isInteger(c.amount) && c.amount >= 0));
    }
  });

  test('priorities receive a larger share, others shrink', () => {
    const base = allocateBudget(cats, 1_000_000);
    const boosted = allocateBudget(cats, 1_000_000, ['photo']);
    const get = (arr, k) => arr.find((c) => c.key === k);
    assert.ok(get(boosted, 'photo').amount > get(base, 'photo').amount);
    assert.ok(get(boosted, 'venue').amount < get(base, 'venue').amount);
    assert.equal(get(boosted, 'photo').priority, true);
    const expectedPct = ((10 * PRIORITY_BOOST) / (100 + 10 * (PRIORITY_BOOST - 1))) * 100;
    assert.ok(Math.abs(get(boosted, 'photo').pct - expectedPct) < 0.1);
  });

  test('percentages still sum to ~100 after boosting', () => {
    const parts = allocateBudget(cats, 500_000, ['venue', 'decor', 'photo']);
    const sum = parts.reduce((s, c) => s + c.pct, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `sum ${sum}`);
  });
});

describe('compressOffset', () => {
  test('keeps offsets when there is enough lead time', () => {
    assert.equal(compressOffset(300, 400, 365), 300);
  });
  test('never schedules before today and keeps order', () => {
    const offsets = [365, 300, 180, 75, 30, 14, 7, 1, 0].map((d) => compressOffset(d, 40, 365));
    assert.ok(offsets.every((o) => o <= 40));
    for (let i = 1; i < offsets.length; i++) assert.ok(offsets[i] <= offsets[i - 1]);
    assert.equal(offsets.at(-1), 0);
  });
  test('post-event follow-ups are untouched', () => {
    assert.equal(compressOffset(-7, 10, 365), -7);
  });
});

describe('buildPlan', () => {
  test('wedding a year out has no compression and the full timeline', () => {
    const plan = buildPlan(input(), TODAY);
    assert.equal(plan.summary.daysUntil, 365);
    assert.equal(plan.summary.compressed, false);
    assert.equal(plan.timeline.length, EVENT_TYPES.wedding.milestones.length);
    assert.equal(plan.timeline.find((m) => m.phase === 'event').dueDate, '2027-10-19');
    assert.equal(plan.budget.categories.reduce((s, c) => s + c.amount, 0), 1_000_000);
    assert.equal(plan.summary.perGuest, Math.round(1_000_000 / 150));
    assert.match(plan.id, /^[0-9a-f]{12}$/);
  });

  test('short-notice birthday is compressed with a warning and nothing overdue', () => {
    const plan = buildPlan(input({ eventType: 'birthday', date: '2026-10-29', guests: 20, budget: 30_000 }), TODAY);
    assert.equal(plan.summary.compressed, true);
    assert.ok(plan.warnings.some((w) => w.startsWith('Short notice')));
    for (const m of plan.timeline.filter((x) => x.phase === 'before')) assert.ok(m.daysFromToday >= 0, m.id);
    for (const v of plan.vendors) assert.ok(daysBetween(TODAY, parseISODate(v.bookBy)) >= 0, v.key);
  });

  test('timeline is in chronological order', () => {
    const plan = buildPlan(input({ date: '2027-01-15' }), TODAY);
    const dates = plan.timeline.map((m) => m.dueDate);
    assert.deepEqual([...dates].sort(), dates);
  });

  test('large community events get a safety warning and maps queries', () => {
    const plan = buildPlan(input({ eventType: 'community', guests: 800, location: 'Pune', date: '2027-03-01' }), TODAY);
    assert.ok(plan.warnings.some((w) => w.includes('crowd-safety')));
    assert.ok(plan.vendors.every((v) => v.mapsQuery.endsWith('near Pune')));
  });

  test('vendors sharing a category split its allocation', () => {
    const plan = buildPlan(input({ eventType: 'community', date: '2027-03-01' }), TODAY);
    const permits = plan.budget.categories.find((c) => c.key === 'permits').amount;
    const sharing = plan.vendors.filter((v) => v.budgetKey === 'permits');
    assert.equal(sharing.length, 2);
    assert.ok(sharing.reduce((s, v) => s + v.allocated, 0) <= permits);
  });

  test('is deterministic for the same input and day', () => {
    assert.deepEqual(buildPlan(input(), TODAY), buildPlan(input(), TODAY));
  });
});

describe('validatePlanInput', () => {
  test('accepts and normalises valid input', () => {
    const res = validatePlanInput(
      { eventType: 'birthday', date: '2026-12-01', guests: '25', budget: '50,000', currency: 'usd', title: '  Mia\u0000 turns   7 ', priorities: ['cake', 'cake', 'bogus'] },
      TODAY,
    );
    assert.ok(res.ok);
    assert.equal(res.value.guests, 25);
    assert.equal(res.value.budget, 50_000);
    assert.equal(res.value.currency, 'USD');
    assert.equal(res.value.title, 'Mia turns 7');
    assert.deepEqual(res.value.priorities, ['cake']);
  });

  test('reports every invalid field', () => {
    const res = validatePlanInput({ eventType: 'funeral', date: '2020-01-01', guests: 0, budget: -5, currency: 'XYZ' }, TODAY);
    assert.equal(res.ok, false);
    assert.deepEqual(Object.keys(res.errors).sort(), ['budget', 'currency', 'date', 'eventType', 'guests']);
  });

  test('rejects dates more than 3 years ahead and non-object bodies', () => {
    assert.equal(validatePlanInput({ ...input(), date: '2031-01-01' }, TODAY).ok, false);
    assert.equal(validatePlanInput(null, TODAY).ok, false);
    assert.equal(validatePlanInput([], TODAY).ok, false);
  });

  test('caps priorities at three', () => {
    const res = validatePlanInput({ ...input(), priorities: ['venue', 'catering', 'photo', 'decor'] }, TODAY);
    assert.equal(res.ok, false);
    assert.ok(res.errors.priorities);
  });

  test('strips bidi overrides and truncates long text', () => {
    assert.equal(cleanText('a‮b', 10), 'ab');
    assert.equal(cleanText('x'.repeat(200), 80).length, 80);
    assert.equal(cleanText(42, 10), '');
  });

  test('validates questions', () => {
    assert.equal(validateQuestion('hi').ok, false);
    assert.equal(validateQuestion('What should I book first?').ok, true);
  });
});
