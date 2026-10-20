import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react';
import { BUTTON, Eyebrow, GlassCard } from '@/components/ui';
import { useFocusOnMount } from '@/lib/useFocusOnMount';

const STEPS = ['Reading your description', 'Building your budget, timeline and vendor list', 'Adding personalised ideas'];

/** Progress card while Gemini reads the description and the plan is built. */
export function LoadingCard({ stage }: { stage: 'parsing' | 'planning' }) {
  const active = stage === 'parsing' ? 0 : 1;
  return (
    <GlassCard className="max-w-[640px] mx-auto">
      <div role="status" aria-live="polite">
        <Eyebrow>Working on it</Eyebrow>
        <p className="font-sans text-[26px] font-medium tracking-[-0.03em] text-evently-text mb-6">Planning your event…</p>
        <ol className="space-y-3.5">
          {STEPS.map((label, i) => {
            const done = i < active;
            // Planning and ideas happen in the same request, so both show as in progress.
            const current = i === active || (stage === 'planning' && i === STEPS.length - 1);
            return (
              <li
                key={label}
                className={`flex items-center gap-3 font-sans text-base font-medium ${done || current ? 'text-evently-text' : 'text-evently-muted'}`}
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/70 border border-white flex-shrink-0">
                  {done && <Check className="w-4 h-4 text-evently-prompt" aria-hidden="true" />}
                  {!done && current && <Loader2 className="w-4 h-4 text-evently-prompt motion-safe:animate-spin" aria-hidden="true" />}
                  {!done && !current && <span className="w-1.5 h-1.5 rounded-full bg-evently-muted/60" />}
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

/** Shown when parsing or planning fails; offers a retry when one is possible. */
export function ErrorCard({ message, retry }: { message: string; retry?: () => void }) {
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
          <button type="button" onClick={retry} className={`${BUTTON.dark} mt-6`}>
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    </GlassCard>
  );
}
