import { AlertTriangle, CalendarDays, MapPin, Pencil, Users, Wallet } from 'lucide-react';
import { BUTTON, CHIP_ICON, Chip, Eyebrow } from '@/components/ui';
import { formatDate, formatMoney, relativeDays, type Plan } from '@/lib/planner';
import { useFocusOnMount } from '@/lib/useFocusOnMount';
import { BudgetCard, TimelineCard, VendorsCard } from './PlanCards';
import { IdeasSection } from './IdeasSection';

/** The finished plan: summary, warnings, budget, timeline, vendors and ideas. */
export function PlanView({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const { input } = plan;
  return (
    <div className="space-y-6">
      <div className="text-center max-w-[820px] mx-auto mb-10">
        <Eyebrow>Your personalised plan</Eyebrow>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-sans text-[clamp(34px,4.5vw,52px)] font-medium text-evently-text leading-[1.05] tracking-[-0.04em] mb-4 outline-none"
        >
          {input.title || `Your ${plan.eventLabel.toLowerCase()} plan`}
        </h2>
        <p className="font-sans text-lg font-medium text-evently-muted leading-relaxed mb-6">{plan.ideas.summary}</p>
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          <Chip icon={<CalendarDays className={CHIP_ICON} aria-hidden="true" />}>
            {formatDate(input.date)} · {relativeDays(plan.summary.daysUntil).toLowerCase()}
          </Chip>
          <Chip icon={<Users className={CHIP_ICON} aria-hidden="true" />}>{input.guests} guests</Chip>
          <Chip icon={<Wallet className={CHIP_ICON} aria-hidden="true" />}>{formatMoney(input.budget, input.currency)}</Chip>
          {input.location && <Chip icon={<MapPin className={CHIP_ICON} aria-hidden="true" />}>{input.location}</Chip>}
          {input.theme && <Chip>{input.theme}</Chip>}
        </div>
        <button type="button" onClick={onEdit} className={BUTTON.glass}>
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
