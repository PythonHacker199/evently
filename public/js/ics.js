// iCalendar (.ics) export of a plan's milestones and vendor deadlines (RFC 5545).
import { nextDay } from './google.js';

/** Escape text values: backslash, semicolon, comma and newlines. @param {string} text */
export function icsEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold long lines at 73 characters; continuation lines start with a space. @param {string} line */
export function icsFold(line) {
  return line.match(/.{1,73}/gu)?.join('\r\n ') ?? line;
}

/**
 * @typedef {object} IcsPlan
 * @property {string} id
 * @property {string} eventLabel
 * @property {{ title?: string }} input
 * @property {{ id: string, dueDate: string, title: string, detail: string }[]} timeline
 * @property {{ key: string, bookBy: string, name: string, questions: string[] }[]} vendors
 */

/**
 * Build the calendar file contents for a plan.
 * @param {IcsPlan} plan
 * @param {Date} [now] used for DTSTAMP
 * @returns {string}
 */
export function buildIcs(plan, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const name = plan.input.title || plan.eventLabel;
  /** @param {string} uid @param {string} iso @param {string} summary @param {string} description */
  const event = (uid, iso, summary, description) => [
    'BEGIN:VEVENT',
    `UID:${uid}-${plan.id}@evently`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${iso.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${nextDay(iso).replaceAll('-', '')}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'END:VEVENT',
  ];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Evently//Planner//EN',
    'CALSCALE:GREGORIAN',
    ...plan.timeline.flatMap((m) => event(m.id, m.dueDate, `${name}: ${m.title}`, m.detail)),
    ...plan.vendors.flatMap((v) => event(`vendor-${v.key}`, v.bookBy, `${name}: book ${v.name}`, v.questions.join('\n'))),
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n');
}

/** Safe file name for the download. @param {IcsPlan} plan */
export function icsFileName(plan) {
  const name = plan.input.title || plan.eventLabel;
  return `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'event'}-plan.ics`;
}
