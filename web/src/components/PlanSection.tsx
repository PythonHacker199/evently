import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ExternalLink,
  Lightbulb,
  Loader2,
  MapPin,
  Pencil,
  PiggyBank,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CURRENCIES,
  EVENT_TYPE_OPTIONS,
  formatDate,
  formatMoney,
  localToday,
  relativeDays,
  type DetailField,
  type Plan,
  type PlanInput,
  type PlannerState,
} from '@/lib/planner';

/* ----------------------------------------------------------------------------
 * Shared building blocks
 * ------------------------------------------------------------------------- */

function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white/45 border-[3px] border-white rounded-[32px] shadow-[0_0_4px_0_rgba(0,0,0,0.15)] backdrop-blur-[20px] p-8 max-md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-evently-muted mb-2">{children}</p>;
}

function CardTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2.5 font-sans text-[22px] font-medium tracking-[-0.02em] text-evently-text mb-5">
      <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/70 border border-white text-evently-prompt">{icon}</span>
      {children}
    </h3>
  );
}

function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 border border-white px-3.5 py-1.5 font-sans text-sm font-medium text-evently-text">
      {icon}
      {children}
    </span>
  );
}

const PILL =
  'inline-flex items-center justify-center gap-2 rounded-full font-sans text-[15px] font-medium uppercase tracking-[0.04em] px-5 h-12 cursor-pointer transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-evently-prompt disabled:opacity-60 disabled:cursor-default';
const PILL_DARK = `${PILL} bg-evently-dark text-[#fafafa] hover:bg-[#333]`;
const PILL_GLASS = `${PILL} bg-white/60 border-2 border-white text-evently-text hover:bg-white/90`;

/** Move focus to a newly shown panel so keyboard and screen-reader users land on it. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

/* ----------------------------------------------------------------------------
 * Loading / error
 * ------------------------------------------------------------------------- */

const STEPS = ['Reading your description', 'Building your budget, timeline and vendor list', 'Adding personalised ideas'];

function LoadingCard({ stage }: { stage: 'parsing' | 'planning' }) {
  const active = stage === 'parsing' ? 0 : 1;
  return (
    <GlassCard className="max-w-[640px] mx-auto">
      <div role="status" aria-live="polite">
        <Eyebrow>Working on it</Eyebrow>
        <p className="font-sans text-[26px] font-medium tracking-[-0.03em] text-evently-text mb-6">Planning your event…</p>
        <ol className="space-y-3.5">
          {STEPS.map((label, i) => {
            const done = i < active;
            const current = i === active || (stage === 'planning' && i === 2);
            return (
              <li key={label} className={`flex items-center gap-3 font-sans text-base font-medium ${done || current ? 'text-evently-text' : 'text-evently-muted'}`}>
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/70 border border-white flex-shrink-0">
                  {done ? (
                    <Check className="w-4 h-4 text-evently-prompt" aria-hidden="true" />
                  ) : current ? (
                    <Loader2 className="w-4 h-4 text-evently-prompt motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-evently-muted/60" />
                  )}
                </span>
                {label}
                <span className="sr-only">{done ? ' (done)' : current ? ' (in progress)' : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </GlassCard>
  );
}

function ErrorCard({ message, retry }: { message: string; retry?: () => void }) {
  const ref = useFocusOnMount<HTMLDivElement>();
  return (
    <GlassCard className="max-w-[640px] mx-auto">
      <div ref={ref} tabIndex={-1} role="alert" className="outline-none">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-evently-prompt flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-sans text-xl font-medium tracking-[-0.02em] text-evently-text mb-1.5">We couldn't plan that yet</p>
            <p className="font-sans text-base text-evently-muted leading-relaxed">{message}</p>
          </div>
        </div>
        {retry && (
          <button type="button" onClick={retry} className={`${PILL_DARK} mt-6`}>
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    </GlassCard>
  );
}

/* ----------------------------------------------------------------------------
 * Details form (missing fields, or adjusting a finished plan)
 * ------------------------------------------------------------------------- */

const FIELD_LABEL: Record<Exclude<DetailField, 'currency'>, string> = {
  eventType: 'What are you celebrating?',
  date: 'When is it?',
  guests: 'How many guests?',
  budget: 'Total budget',
  location: 'Where is it?',
};

const INPUT =
  'w-full h-12 rounded-2xl border-2 border-white bg-white/70 px-4 font-sans text-base font-medium text-evently-text outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-evently-prompt/50 aria-[invalid=true]:border-[#c0563a]';

function toNumber(value: string): number {
  return Number(value.replace(/[,\s_]/g, ''));
}

function UnderstoodChips({ input }: { input: Partial<PlanInput> }) {
  const type = EVENT_TYPE_OPTIONS.find((o) => o.value === input.eventType)?.label;
  const chips = [
    type && <Chip key="type" icon={<Sparkles className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>{type}</Chip>,
    input.date && <Chip key="date" icon={<CalendarDays className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>{formatDate(input.date)}</Chip>,
    input.guests && <Chip key="guests" icon={<Users className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>{input.guests} guests</Chip>,
    input.budget && (
      <Chip key="budget" icon={<Wallet className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>
        {formatMoney(input.budget, input.currency ?? 'INR')}
      </Chip>
    ),
    input.location && <Chip key="loc" icon={<MapPin className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>{input.location}</Chip>,
    input.theme && <Chip key="theme">{input.theme}</Chip>,
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <div className="mb-7">
      <p className="font-sans text-sm font-medium text-evently-muted mb-2.5">Here's what we understood:</p>
      <div className="flex flex-wrap gap-2">{chips}</div>
    </div>
  );
}

function DetailsCard({
  state,
  onSubmit,
  onCancel,
}: {
  state: Extract<PlannerState, { status: 'details' }>;
  onSubmit: (values: Partial<PlanInput>) => void;
  onCancel: () => void;
}) {
  const { input, fields, errors: serverErrors, reason } = state;
  const uid = useId();
  const firstRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const [values, setValues] = useState({
    eventType: input.eventType ?? '',
    date: input.date ?? '',
    guests: input.guests ? String(input.guests) : '',
    budget: input.budget ? String(input.budget) : '',
    currency: input.currency ?? 'INR',
    location: input.location ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>(serverErrors);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const out: Partial<PlanInput> = {};
    for (const field of fields) {
      if (field === 'eventType') {
        if (!values.eventType) next.eventType = 'Choose the kind of event.';
        else out.eventType = values.eventType as PlanInput['eventType'];
      } else if (field === 'date') {
        if (!values.date) next.date = 'Pick a date.';
        else if (values.date < localToday()) next.date = 'The date must be today or later.';
        else out.date = values.date;
      } else if (field === 'guests') {
        const n = toNumber(values.guests);
        if (!Number.isInteger(n) || n < 1 || n > 10000) next.guests = 'Enter a whole number from 1 to 10,000.';
        else out.guests = n;
      } else if (field === 'budget') {
        const n = toNumber(values.budget);
        if (!Number.isFinite(n) || n < 1) next.budget = 'Enter your total budget.';
        else {
          out.budget = Math.round(n);
          out.currency = values.currency;
        }
      } else if (field === 'location') {
        out.location = values.location.trim();
      }
    }
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(out);
  }

  const budgetPreview = toNumber(values.budget);
  const visible = fields.filter((f): f is Exclude<DetailField, 'currency'> => f !== 'currency');

  return (
    <GlassCard className="max-w-[640px] mx-auto">
      <Eyebrow>{reason === 'edit' ? 'Adjust your plan' : 'Almost there'}</Eyebrow>
      <h2 className="font-sans text-[30px] max-md:text-[26px] font-medium tracking-[-0.03em] text-evently-text leading-tight mb-2">
        {reason === 'edit' ? 'Change any detail and re-plan' : visible.length === 1 ? 'Just one more detail' : 'Just a few more details'}
      </h2>
      <p className="font-sans text-base text-evently-muted leading-relaxed mb-6">
        {reason === 'edit'
          ? 'Your budget, timeline and vendor list will be rebuilt from these.'
          : "We couldn't find these in your description. Everything else is ready."}
      </p>

      {reason === 'missing' && <UnderstoodChips input={input} />}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {visible.map((field, i) => {
          const id = `${uid}-${field}`;
          const err = errors[field] ?? (field === 'budget' ? errors.currency : undefined);
          const common = {
            id,
            'aria-invalid': Boolean(err),
            'aria-describedby': err ? `${id}-err` : undefined,
            ref: i === 0 ? firstRef : undefined,
          };
          return (
            <div key={field}>
              <label htmlFor={id} className="block font-sans text-[15px] font-semibold text-evently-text mb-2">
                {FIELD_LABEL[field]}
              </label>
              {field === 'eventType' && (
                <select {...common} value={values.eventType} onChange={set('eventType')} className={INPUT}>
                  <option value="" disabled>
                    Choose one
                  </option>
                  {EVENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {field === 'date' && <input {...common} type="date" min={localToday()} value={values.date} onChange={set('date')} className={INPUT} />}
              {field === 'guests' && (
                <input {...common} type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 120" value={values.guests} onChange={set('guests')} className={INPUT} />
              )}
              {field === 'budget' && (
                <>
                  <div className="flex gap-2">
                    <label htmlFor={`${id}-cur`} className="sr-only">
                      Currency
                    </label>
                    <select id={`${id}-cur`} value={values.currency} onChange={set('currency')} className={`${INPUT} w-[104px] flex-shrink-0`}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input {...common} type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 1500000" value={values.budget} onChange={set('budget')} className={INPUT} />
                  </div>
                  {Number.isFinite(budgetPreview) && budgetPreview >= 1 && (
                    <p className="font-sans text-sm text-evently-muted mt-1.5">= {formatMoney(budgetPreview, values.currency)}</p>
                  )}
                </>
              )}
              {field === 'location' && (
                <input {...common} type="text" autoComplete="off" maxLength={80} placeholder="City or area" value={values.location} onChange={set('location')} className={INPUT} />
              )}
              {err && (
                <p id={`${id}-err`} className="font-sans text-sm font-medium text-[#a8462c] mt-1.5">
                  {err}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className={PILL_DARK}>
            {reason === 'edit' ? 'Re-plan my event' : 'Plan My Event'}
          </button>
          {state.previous && (
            <button type="button" onClick={onCancel} className={PILL_GLASS}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </GlassCard>
  );
}

/* ----------------------------------------------------------------------------
 * The finished plan
 * ------------------------------------------------------------------------- */

// Warm ramp built around the prompt colour (#905831); contingency stays neutral.
const SWATCHES = ['#905831', '#c0793f', '#e0a463', '#c98b7a', '#a7708a', '#7d7fa6', '#86a39b', '#d9c08c'];
const CONTINGENCY = '#cfc8c0';

function BudgetCard({ plan }: { plan: Plan }) {
  const { currency, total, categories } = plan.budget;
  const colour = (key: string, i: number) => (key === 'contingency' ? CONTINGENCY : SWATCHES[i % SWATCHES.length]);
  return (
    <GlassCard>
      <CardTitle icon={<Wallet className="w-[18px] h-[18px]" aria-hidden="true" />}>Budget split</CardTitle>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-5">
        <span className="font-sans text-[34px] max-md:text-[28px] font-medium tracking-[-0.03em] text-evently-text">{formatMoney(total, currency)}</span>
        <span className="font-sans text-[15px] font-medium text-evently-muted">≈ {formatMoney(plan.summary.perGuest, currency)} per guest</span>
      </div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-white/60 mb-6" aria-hidden="true">
        {categories.map((c, i) => (
          <span key={c.key} style={{ width: `${c.pct}%`, background: colour(c.key, i) }} className="h-full" />
        ))}
      </div>
      <ul className="divide-y divide-white/80">
        {categories.map((c, i) => (
          <li key={c.key} className="flex items-center gap-3 py-2.5 font-sans text-[15px]">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colour(c.key, i) }} aria-hidden="true" />
            <span className="flex-1 min-w-0 font-medium text-evently-text">
              {c.label}
              {c.priority && (
                <span className="ml-2 align-middle rounded-full bg-evently-prompt/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-evently-prompt">
                  Priority
                </span>
              )}
            </span>
            <span className="text-evently-muted tabular-nums w-12 text-right">{c.pct}%</span>
            <span className="font-medium text-evently-text tabular-nums text-right min-w-[92px]">{formatMoney(c.amount, currency)}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function TimelineCard({ plan }: { plan: Plan }) {
  return (
    <GlassCard>
      <CardTitle icon={<CalendarDays className="w-[18px] h-[18px]" aria-hidden="true" />}>Timeline</CardTitle>
      <ol className="relative">
        {plan.timeline.map((m, i) => {
          const isEvent = m.phase === 'event';
          return (
            <li key={m.id} className="relative pl-8 pb-5 last:pb-0">
              {i < plan.timeline.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-0.5 bg-white" aria-hidden="true" />}
              <span
                className={`absolute left-0 top-1 w-4 h-4 rounded-full border-[3px] border-white ${isEvent ? 'bg-evently-prompt' : 'bg-[#e0a463]'}`}
                aria-hidden="true"
              />
              <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.06em] text-evently-muted">
                {formatDate(m.dueDate)} · {relativeDays(m.daysFromToday)}
              </p>
              <p className={`font-sans text-base font-medium ${isEvent ? 'text-evently-prompt' : 'text-evently-text'}`}>{m.title}</p>
              <p className="font-sans text-sm text-evently-muted leading-relaxed mt-0.5">{m.detail}</p>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}

function VendorsCard({ plan }: { plan: Plan }) {
  return (
    <GlassCard>
      <CardTitle icon={<Users className="w-[18px] h-[18px]" aria-hidden="true" />}>Vendors to book</CardTitle>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plan.vendors.map((v) => (
          <li key={v.key} className="rounded-3xl bg-white/55 border-2 border-white p-5 flex flex-col">
            <p className="font-sans text-[17px] font-medium tracking-[-0.01em] text-evently-text">{v.name}</p>
            <p className="font-sans text-sm text-evently-muted mt-1">
              Book by <span className="font-semibold text-evently-text">{formatDate(v.bookBy)}</span>
            </p>
            <p className="font-sans text-sm text-evently-muted">
              Budget <span className="font-semibold text-evently-text">{formatMoney(v.allocated, plan.budget.currency)}</span>
            </p>
            <details className="group mt-3">
              <summary className="cursor-pointer list-none font-sans text-sm font-semibold text-evently-prompt hover:underline">
                <span className="group-open:hidden">Questions to ask ({v.questions.length})</span>
                <span className="hidden group-open:inline">Hide questions</span>
              </summary>
              <ul className="mt-2 space-y-1.5 list-disc pl-4 font-sans text-sm text-evently-text/85 leading-snug">
                {v.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </details>
            {v.mapsQuery && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.mapsQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto pt-3 inline-flex items-center gap-1.5 font-sans text-sm font-medium text-evently-text hover:text-evently-prompt"
              >
                Find nearby <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="sr-only">(opens Google Maps in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function TipList({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <GlassCard>
      <CardTitle icon={icon}>{title}</CardTitle>
      <ul className="space-y-2.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5 font-sans text-[15px] text-evently-text leading-relaxed">
            <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-evently-prompt flex-shrink-0" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function IdeasSection({ plan }: { plan: Plan }) {
  const { ideas } = plan;
  return (
    <>
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <h3 className="flex items-center gap-2.5 font-sans text-[22px] font-medium tracking-[-0.02em] text-evently-text">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/70 border border-white text-evently-prompt">
              <Sparkles className="w-[18px] h-[18px]" aria-hidden="true" />
            </span>
            Ideas for your event
          </h3>
          <span className="rounded-full bg-white/60 border border-white px-3 py-1 font-sans text-xs font-semibold uppercase tracking-[0.06em] text-evently-muted">
            {ideas.source === 'gemini' ? 'Personalised by Gemini' : 'Curated ideas'}
          </span>
        </div>
        {ideas.notice && <p className="font-sans text-sm text-evently-muted mb-4">{ideas.notice}</p>}
        <ul className="grid gap-4 md:grid-cols-2">
          {ideas.themeIdeas.map((idea) => (
            <li key={idea.title} className="rounded-3xl bg-white/55 border-2 border-white p-5">
              <p className="font-sans text-[17px] font-medium tracking-[-0.01em] text-evently-text mb-1">{idea.title}</p>
              <p className="font-sans text-[15px] text-evently-muted leading-relaxed">{idea.description}</p>
            </li>
          ))}
        </ul>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {ideas.agenda.length > 0 && (
          <GlassCard>
            <CardTitle icon={<CalendarDays className="w-[18px] h-[18px]" aria-hidden="true" />}>On the day</CardTitle>
            <ol className="space-y-3">
              {ideas.agenda.map((a) => (
                <li key={`${a.time}-${a.activity}`} className="flex gap-4 font-sans text-[15px]">
                  <span className="w-[84px] flex-shrink-0 font-semibold text-evently-prompt tabular-nums">{a.time}</span>
                  <span className="text-evently-text leading-relaxed">{a.activity}</span>
                </li>
              ))}
            </ol>
          </GlassCard>
        )}
        <TipList icon={<Lightbulb className="w-[18px] h-[18px]" aria-hidden="true" />} title="Tips for you" items={ideas.personalizedTips} />
        <TipList icon={<PiggyBank className="w-[18px] h-[18px]" aria-hidden="true" />} title="Ways to save" items={ideas.savingTips} />
        <TipList icon={<ShieldAlert className="w-[18px] h-[18px]" aria-hidden="true" />} title="Watch out for" items={ideas.risks} />
      </div>
    </>
  );
}

function PlanView({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  const { input } = plan;
  return (
    <div className="space-y-6">
      <div className="text-center max-w-[820px] mx-auto mb-10">
        <Eyebrow>Your personalised plan</Eyebrow>
        <h2
          ref={ref}
          tabIndex={-1}
          className="font-sans text-[clamp(34px,4.5vw,52px)] font-medium text-evently-text leading-[1.05] tracking-[-0.04em] mb-4 outline-none"
        >
          {input.title || `Your ${plan.eventLabel.toLowerCase()} plan`}
        </h2>
        <p className="font-sans text-lg font-medium text-evently-muted leading-relaxed mb-6">{plan.ideas.summary}</p>
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          <Chip icon={<CalendarDays className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>
            {formatDate(input.date)} · {relativeDays(plan.summary.daysUntil).toLowerCase()}
          </Chip>
          <Chip icon={<Users className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>{input.guests} guests</Chip>
          <Chip icon={<Wallet className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>{formatMoney(input.budget, input.currency)}</Chip>
          {input.location && <Chip icon={<MapPin className="w-3.5 h-3.5 text-evently-prompt" aria-hidden="true" />}>{input.location}</Chip>}
          {input.theme && <Chip>{input.theme}</Chip>}
        </div>
        <button type="button" onClick={onEdit} className={PILL_GLASS}>
          <Pencil className="w-4 h-4" aria-hidden="true" /> Adjust details
        </button>
      </div>

      {plan.warnings.length > 0 && (
        <div className="rounded-[24px] border-2 border-white bg-[#fff4e5]/80 backdrop-blur-[20px] px-6 py-4 space-y-1.5">
          {plan.warnings.map((w) => (
            <p key={w} className="flex gap-2.5 font-sans text-[15px] font-medium text-[#7a4a1f] leading-relaxed">
              <AlertTriangle className="w-[18px] h-[18px] flex-shrink-0 mt-[3px]" aria-hidden="true" />
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] items-start">
        <BudgetCard plan={plan} />
        <TimelineCard plan={plan} />
      </div>
      <VendorsCard plan={plan} />
      <IdeasSection plan={plan} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Section
 * ------------------------------------------------------------------------- */

export default function PlanSection({
  state,
  onSubmitDetails,
  onEdit,
  onCancelEdit,
}: {
  state: PlannerState;
  onSubmitDetails: (values: Partial<PlanInput>) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const visible = state.status !== 'idle';

  // Bring the section into view whenever the planner moves to a new step.
  useEffect(() => {
    if (!visible) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [state.status, visible]);

  if (!visible) return null;

  return (
    <section ref={ref} id="plan" aria-label="Your event plan" className="relative isolate overflow-hidden px-6 py-20 max-md:py-14">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(60% 40% at 15% 0%, rgba(240,190,130,0.45) 0%, rgba(240,190,130,0) 100%),' +
            'radial-gradient(50% 45% at 90% 25%, rgba(232,170,160,0.35) 0%, rgba(232,170,160,0) 100%),' +
            'radial-gradient(60% 50% at 30% 85%, rgba(170,195,235,0.35) 0%, rgba(170,195,235,0) 100%),' +
            '#f7f2ec',
        }}
      />
      <div className="relative max-w-[1160px] mx-auto">
        {state.status === 'parsing' && <LoadingCard stage="parsing" />}
        {state.status === 'planning' && <LoadingCard stage="planning" />}
        {state.status === 'error' && <ErrorCard message={state.message} retry={state.retry} />}
        {state.status === 'details' && (
          <DetailsCard key={`${state.reason}-${state.fields.join()}`} state={state} onSubmit={onSubmitDetails} onCancel={onCancelEdit} />
        )}
        {state.status === 'done' && <PlanView key={state.plan.id} plan={state.plan} onEdit={onEdit} />}
      </div>
    </section>
  );
}
