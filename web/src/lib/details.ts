import { EVENT_TYPE_OPTIONS, localToday, type DetailField, type EventType, type PlanInput } from '@/lib/planner';

/** Raw form values for the "missing details" / "adjust details" form. */
export interface DetailValues {
  eventType: string;
  date: string;
  guests: string;
  budget: string;
  currency: string;
  location: string;
}

/** Same limit as the server's validator. */
export const MAX_GUESTS = 10_000;

/** Parse a number typed by a person, ignoring thousands separators, spaces and underscores. */
export function parseAmount(value: string): number {
  return Number(value.replace(/[,\s_]/g, ''));
}

function isEventType(value: string): value is EventType {
  return EVENT_TYPE_OPTIONS.some((o) => o.value === value);
}

/** Initial form values from whatever the planner already knows. */
export function initialDetailValues(input: Partial<PlanInput>): DetailValues {
  return {
    eventType: input.eventType ?? '',
    date: input.date ?? '',
    guests: input.guests ? String(input.guests) : '',
    budget: input.budget ? String(input.budget) : '',
    currency: input.currency ?? 'INR',
    location: input.location ?? '',
  };
}

/**
 * Validate only the requested fields. Mirrors the server's rules so most mistakes are caught
 * before a round trip; the server re-validates everything regardless.
 */
export function validateDetails(
  fields: readonly DetailField[],
  values: DetailValues,
  today: string = localToday(),
): { input: Partial<PlanInput>; errors: Partial<Record<DetailField, string>> } {
  const input: Partial<PlanInput> = {};
  const errors: Partial<Record<DetailField, string>> = {};

  for (const field of fields) {
    switch (field) {
      case 'eventType':
        if (isEventType(values.eventType)) input.eventType = values.eventType;
        else errors.eventType = 'Choose the kind of event.';
        break;
      case 'date':
        if (!values.date) errors.date = 'Pick a date.';
        else if (values.date < today) errors.date = 'The date must be today or later.';
        else input.date = values.date;
        break;
      case 'guests': {
        const guests = parseAmount(values.guests);
        if (Number.isInteger(guests) && guests >= 1 && guests <= MAX_GUESTS) input.guests = guests;
        else errors.guests = 'Enter a whole number from 1 to 10,000.';
        break;
      }
      case 'budget': {
        const budget = parseAmount(values.budget);
        if (Number.isFinite(budget) && budget >= 1) {
          input.budget = Math.round(budget);
          input.currency = values.currency;
        } else {
          errors.budget = 'Enter your total budget.';
        }
        break;
      }
      case 'location':
        input.location = values.location.trim();
        break;
      case 'currency':
        // Edited together with the budget.
        break;
    }
  }
  return { input, errors };
}
