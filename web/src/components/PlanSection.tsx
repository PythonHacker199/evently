import { useEffect, useRef } from 'react';
import type { PlanInput, PlannerState } from '@/lib/planner';
import { DetailsCard } from './plan/DetailsCard';
import { PlanView } from './plan/PlanView';
import { ErrorCard, LoadingCard } from './plan/StatusCards';

const SECTION_BACKGROUND =
  'radial-gradient(60% 40% at 15% 0%, rgba(240,190,130,0.45) 0%, rgba(240,190,130,0) 100%),' +
  'radial-gradient(50% 45% at 90% 25%, rgba(232,170,160,0.35) 0%, rgba(232,170,160,0) 100%),' +
  'radial-gradient(60% 50% at 30% 85%, rgba(170,195,235,0.35) 0%, rgba(170,195,235,0) 100%),' +
  '#f7f2ec';

/** Everything below the hero: progress, follow-up questions, errors and the finished plan. */
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
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [state.status, visible]);

  if (!visible) return null;

  return (
    <section ref={ref} id="plan" aria-label="Your event plan" className="relative isolate overflow-hidden px-6 py-20 max-md:py-14">
      <div className="absolute inset-0 -z-10" aria-hidden="true" style={{ background: SECTION_BACKGROUND }} />
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
