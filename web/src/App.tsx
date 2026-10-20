import Hero from '@/components/Hero';
import PlanSection from '@/components/PlanSection';
import { usePlanner } from '@/lib/planner';

export default function App() {
  const planner = usePlanner();
  return (
    <div>
      <Hero onPlan={planner.start} busy={planner.busy} />
      <PlanSection
        state={planner.state}
        onSubmitDetails={planner.submitDetails}
        onEdit={planner.editDetails}
        onCancelEdit={planner.cancelEdit}
      />
    </div>
  );
}
