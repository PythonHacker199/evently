import { CalendarDays, ExternalLink, Users, Wallet } from 'lucide-react';
import { CardTitle, GlassCard, TITLE_ICON } from '@/components/ui';
import { formatDate, formatMoney, relativeDays, type Plan } from '@/lib/planner';

// Warm ramp built around the prompt colour (#905831); contingency stays neutral.
const SWATCHES = ['#905831', '#c0793f', '#e0a463', '#c98b7a', '#a7708a', '#7d7fa6', '#86a39b', '#d9c08c'];
const CONTINGENCY = '#cfc8c0';

function swatch(key: string, index: number): string {
  return key === 'contingency' ? CONTINGENCY : SWATCHES[index % SWATCHES.length];
}

/** Stacked bar and itemised list of the budget split. */
export function BudgetCard({ plan }: { plan: Plan }) {
  const { currency, total, categories } = plan.budget;
  return (
    <GlassCard>
      <CardTitle icon={<Wallet className={TITLE_ICON} aria-hidden="true" />}>Budget split</CardTitle>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-5">
        <span className="font-sans text-[34px] max-md:text-[28px] font-medium tracking-[-0.03em] text-evently-text">{formatMoney(total, currency)}</span>
        <span className="font-sans text-[15px] font-medium text-evently-muted">≈ {formatMoney(plan.summary.perGuest, currency)} per guest</span>
      </div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-white/60 mb-6" aria-hidden="true">
        {categories.map((c, i) => (
          <span key={c.key} style={{ width: `${c.pct}%`, background: swatch(c.key, i) }} className="h-full" />
        ))}
      </div>
      <ul className="divide-y divide-white/80">
        {categories.map((c, i) => (
          <li key={c.key} className="flex items-center gap-3 py-2.5 font-sans text-[15px]">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: swatch(c.key, i) }} aria-hidden="true" />
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

/** Milestones counted back from the event date. */
export function TimelineCard({ plan }: { plan: Plan }) {
  return (
    <GlassCard>
      <CardTitle icon={<CalendarDays className={TITLE_ICON} aria-hidden="true" />}>Timeline</CardTitle>
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

function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Who to book, by when, with what budget and which questions to ask. */
export function VendorsCard({ plan }: { plan: Plan }) {
  return (
    <GlassCard>
      <CardTitle icon={<Users className={TITLE_ICON} aria-hidden="true" />}>Vendors to book</CardTitle>
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
                href={mapsUrl(v.mapsQuery)}
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
