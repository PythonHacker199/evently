import type { ReactNode } from 'react';
import { CalendarDays, Lightbulb, PiggyBank, ShieldAlert, Sparkles } from 'lucide-react';
import { CardTitle, GlassCard, TITLE_ICON } from '@/components/ui';
import type { Plan } from '@/lib/planner';

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

/** Gemini's personalised ideas, run of show, tips, savings and risks. */
export function IdeasSection({ plan }: { plan: Plan }) {
  const { ideas } = plan;
  return (
    <>
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <h3 className="flex items-center gap-2.5 font-sans text-[22px] font-medium tracking-[-0.02em] text-evently-text">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/70 border border-white text-evently-prompt">
              <Sparkles className={TITLE_ICON} aria-hidden="true" />
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
            <CardTitle icon={<CalendarDays className={TITLE_ICON} aria-hidden="true" />}>On the day</CardTitle>
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
        <TipList icon={<Lightbulb className={TITLE_ICON} aria-hidden="true" />} title="Tips for you" items={ideas.personalizedTips} />
        <TipList icon={<PiggyBank className={TITLE_ICON} aria-hidden="true" />} title="Ways to save" items={ideas.savingTips} />
        <TipList icon={<ShieldAlert className={TITLE_ICON} aria-hidden="true" />} title="Watch out for" items={ideas.risks} />
      </div>
    </>
  );
}
