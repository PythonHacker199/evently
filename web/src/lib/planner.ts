import { useEffect, useRef, useState } from 'react';

/* ----------------------------------------------------------------------------
 * Types mirroring the EventWise API (eventwise/src/planner.js + ideas.js).
 * ------------------------------------------------------------------------- */

export type EventType = 'wedding' | 'birthday' | 'community';

export interface PlanInput {
  eventType: EventType;
  title?: string;
  date: string;
  guests: number;
  budget: number;
  currency: string;
  location?: string;
  theme?: string;
  notes?: string;
  priorities?: string[];
}

export type DetailField = 'eventType' | 'date' | 'guests' | 'budget' | 'currency' | 'location';

export interface BudgetCategory {
  key: string;
  label: string;
  pct: number;
  amount: number;
  priority: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  detail: string;
  dueDate: string;
  daysFromToday: number;
  phase: 'before' | 'event' | 'after';
}

export interface Vendor {
  key: string;
  name: string;
  budgetKey: string;
  allocated: number;
  bookBy: string;
  questions: string[];
  mapsQuery: string;
}

export interface Ideas {
  source: 'gemini' | 'curated';
  model?: string;
  notice?: string;
  summary: string;
  themeIdeas: { title: string; description: string }[];
  personalizedTips: string[];
  agenda: { time: string; activity: string }[];
  savingTips: string[];
  risks: string[];
}

export interface Plan {
  id: string;
  input: PlanInput;
  eventLabel: string;
  generatedOn: string;
  summary: { daysUntil: number; recommendedLeadDays: number; compressed: boolean; perGuest: number };
  budget: { currency: string; total: number; categories: BudgetCategory[] };
  timeline: Milestone[];
  vendors: Vendor[];
  warnings: string[];
  ideas: Ideas;
}

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'community', label: 'Community event' },
];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'] as const;

/** Every field the "adjust details" form can edit. */
export const ALL_DETAIL_FIELDS: DetailField[] = ['eventType', 'date', 'guests', 'budget', 'location'];

const DETAIL_FIELDS = new Set<string>([...ALL_DETAIL_FIELDS, 'currency']);

/* ----------------------------------------------------------------------------
 * API client
 * ------------------------------------------------------------------------- */

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function postJson<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError(0, "We couldn't reach the planner. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as { error?: string; errors?: Record<string, string> } | null;
  if (!res.ok) {
    const fallback =
      res.status >= 500
        ? 'The planning service is unavailable right now. Please try again in a moment.'
        : `Something went wrong (HTTP ${res.status}).`;
    throw new ApiError(res.status, data?.error ?? fallback, data?.errors);
  }
  return data as T;
}

/* ----------------------------------------------------------------------------
 * Planner state machine: idle -> parsing -> (details) -> planning -> done
 * ------------------------------------------------------------------------- */

export type PlannerState =
  | { status: 'idle' }
  | { status: 'parsing' }
  | {
      status: 'details';
      reason: 'missing' | 'edit';
      input: Partial<PlanInput>;
      fields: DetailField[];
      errors: Record<string, string>;
      previous?: Plan;
    }
  | { status: 'planning' }
  | { status: 'done'; plan: Plan }
  | { status: 'error'; message: string; retry?: () => void };

export const MIN_DESCRIPTION = 10;
export const MAX_DESCRIPTION = 600;

export function usePlanner() {
  const [state, setState] = useState<PlannerState>({ status: 'idle' });
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => () => inflight.current?.abort(), []);

  // Plain function declarations (not useCallback): nothing downstream is memoised, and the
  // "Try again" closures below can call the function they belong to.

  /** Cancel whatever is running; only the newest request may update state. */
  function begin() {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    return ctrl;
  }

  async function runPlan(input: Partial<PlanInput>, askedFields: DetailField[] = []) {
    const ctrl = begin();
    setState({ status: 'planning' });
    try {
      const { plan } = await postJson<{ plan: Plan }>('/api/plan', input, ctrl.signal);
      if (!ctrl.signal.aborted) setState({ status: 'done', plan });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      // Field-level problems go back to the form, asking only for the fields that failed.
      if (err instanceof ApiError && err.status === 400 && err.errors) {
        const bad = Object.keys(err.errors).filter((f): f is DetailField => DETAIL_FIELDS.has(f));
        if (bad.length > 0) {
          const fields = [...new Set([...askedFields, ...bad])].filter((f) => f !== 'currency');
          if (bad.includes('currency') && !fields.includes('budget')) fields.push('budget');
          setState({ status: 'details', reason: 'missing', input, fields, errors: err.errors });
          return;
        }
      }
      setState({ status: 'error', message: messageOf(err), retry: () => void runPlan(input, askedFields) });
    }
  }

  async function start(rawText: string) {
    const text = rawText.trim();
    if (text.length < MIN_DESCRIPTION) {
      setState({ status: 'error', message: 'Tell us a little more about your event: what, when, how many guests and your budget.' });
      return;
    }
    const ctrl = begin();
    setState({ status: 'parsing' });
    try {
      const { input, missing } = await postJson<{ input: Partial<PlanInput>; missing: DetailField[] }>('/api/parse', { text }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (missing.length > 0) {
        setState({ status: 'details', reason: 'missing', input, fields: missing, errors: {} });
        return;
      }
      await runPlan(input);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState({ status: 'error', message: messageOf(err), retry: () => void start(text) });
    }
  }

  function submitDetails(values: Partial<PlanInput>) {
    if (state.status !== 'details') return;
    void runPlan({ ...state.input, ...values }, state.fields);
  }

  function editDetails() {
    if (state.status !== 'done') return;
    setState({ status: 'details', reason: 'edit', input: state.plan.input, fields: ALL_DETAIL_FIELDS, errors: {}, previous: state.plan });
  }

  function cancelEdit() {
    if (state.status === 'details' && state.previous) setState({ status: 'done', plan: state.previous });
  }

  const busy = state.status === 'parsing' || state.status === 'planning';
  return { state, busy, start, submitDetails, editDetails, cancelEdit };
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

/* ----------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en')}`;
  }
}

/** "2027-02-14" -> "14 Feb 2027" (parsed as a calendar date, so no timezone shift). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function relativeDays(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** Today's date in the user's timezone as YYYY-MM-DD (for <input type="date" min>). */
export function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
