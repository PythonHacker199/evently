import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildIcs, icsEscape, icsFileName, icsFold } from '../public/js/ics.js';
import { googleCalendarUrl, googleMapsUrl, nextDay } from '../public/js/google.js';

const PLAN = {
  id: 'abc123',
  eventLabel: 'Birthday',
  input: { title: 'Mia turns 7; dinos, cake & fun' },
  timeline: [{ id: 'b-day', dueDate: '2026-12-31', title: 'Party day', detail: 'Set up early.\nEnjoy!' }],
  vendors: [{ key: 'bakery', bookBy: '2026-12-10', name: 'Bakery', questions: ['Eggless?', 'Delivery included?'] }],
};

describe('ics export', () => {
  test('escapes special characters and newlines', () => {
    assert.equal(icsEscape('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne');
  });

  test('folds long lines with a leading space on continuations', () => {
    const folded = icsFold('x'.repeat(150));
    const parts = folded.split('\r\n');
    assert.equal(parts.length, 3);
    assert.ok(parts.slice(1).every((p) => p.startsWith(' ')));
  });

  test('builds one all-day event per milestone and vendor deadline', () => {
    const ics = buildIcs(PLAN, new Date('2026-10-20T10:00:00Z'));
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR'));
    assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
    assert.match(ics, /DTSTART;VALUE=DATE:20261231/);
    assert.match(ics, /DTEND;VALUE=DATE:20270101/); // crosses the year boundary
    assert.match(ics, /UID:vendor-bakery-abc123@evently/);
    assert.match(ics, /DTSTAMP:20261020T100000Z/);
  });

  test('makes a safe file name', () => {
    assert.equal(icsFileName(PLAN), 'mia-turns-7-dinos-cake-fun-plan.ics');
    assert.equal(icsFileName({ ...PLAN, input: {} }), 'birthday-plan.ics');
  });
});

describe('google links', () => {
  test('calendar template covers exactly one all-day date', () => {
    const url = new URL(googleCalendarUrl('Book venue', '2027-02-28', 'Details'));
    assert.equal(url.hostname, 'calendar.google.com');
    assert.equal(url.searchParams.get('dates'), '20270228/20270301');
    assert.equal(url.searchParams.get('text'), 'Book venue');
  });

  test('maps search encodes the query', () => {
    const url = new URL(googleMapsUrl('caterer near Kolkata & Howrah'));
    assert.equal(url.searchParams.get('query'), 'caterer near Kolkata & Howrah');
  });

  test('nextDay handles leap years', () => {
    assert.equal(nextDay('2028-02-28'), '2028-02-29');
  });
});
