import { useRef, useState, type ReactNode } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { MAX_DESCRIPTION } from '@/lib/planner';

const VIDEO_SRC =
  'https://pollen-batch-41236914.figma.site/_components/v2/f0ee2dae7671c170c34f12e31c4cb41418976c98/769c564298c132f7919405cd9f17c1b1231f341d.769c5642.mp4';

const DEFAULT_PROMPT =
  "I'm planning a 120-guest wedding in Kolkata this February. We love marigolds, Bengali food and live music, and want to stay under ₹15 lakh....";

function NavButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="bg-transparent border-none cursor-pointer font-sans text-[15px] font-medium uppercase text-evently-text tracking-[0.04em] transition-opacity hover:opacity-55"
    >
      {children}
    </button>
  );
}

export default function Hero({ onPlan, busy }: { onPlan: (prompt: string) => void; busy: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const submit = () => {
    if (!busy) onPlan(prompt);
  };

  return (
    <section className="relative min-h-svh w-full overflow-hidden">
      <video
        className="absolute inset-0 w-full h-full object-cover z-0"
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />

      <div
        className="absolute inset-x-0 top-0 h-[687px] pointer-events-none z-[1]"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)' }}
      />

      <div className="relative z-[2] max-w-[1360px] mx-auto">
        <nav className="relative flex items-center justify-between px-20 pt-6 pb-4 max-md:px-6 max-md:pt-5" aria-label="Main">
          <span className="font-display text-[40px] max-md:text-[32px] text-black leading-none select-none">evently</span>

          <div className="absolute left-1/2 -translate-x-1/2 flex gap-8 max-md:hidden">
            <NavButton>Discover</NavButton>
            <NavButton>Pricing</NavButton>
            <NavButton>FAQs</NavButton>
          </div>

          <div className="flex items-center gap-8">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer font-sans text-[15px] font-semibold uppercase text-[#292929] tracking-[0.04em] transition-opacity hover:opacity-55 max-md:hidden"
            >
              Login
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              aria-busy={busy}
              className="bg-evently-dark text-[#fafafa] border-none cursor-pointer font-sans text-[15px] font-medium uppercase tracking-[0.04em] px-5 py-3.5 rounded-full transition-all hover:bg-[#333] active:scale-95 disabled:opacity-70 disabled:cursor-default"
            >
              Plan My Event
            </button>
          </div>
        </nav>

        <div className="flex flex-col items-center px-6 pt-16 pb-24 text-center">
          <h1 className="font-sans text-[clamp(40px,6vw,68px)] font-medium text-evently-text leading-[1.05] tracking-[-0.04em] max-w-[820px] mb-5">
            What are we celebrating next?
          </h1>
          <p className="font-sans text-xl font-medium text-evently-muted leading-relaxed max-w-[500px] mb-10">
            Tell our AI what you're planning and what you love. We'll create a personalized plan for your event.
          </p>

          <div className="relative w-[701px] max-md:w-[calc(100vw-48px)] min-h-[208px] bg-white/[0.06] border-[3px] border-white rounded-[44px] shadow-[0_0_4px_0_rgba(0,0,0,0.15)] overflow-hidden backdrop-blur-[20px]">
            <label htmlFor="event-prompt" className="sr-only">
              Describe your event
            </label>
            <textarea
              id="event-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd + Enter submits; plain Enter still inserts a newline.
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              maxLength={MAX_DESCRIPTION}
              rows={3}
              className="absolute left-[29px] top-[57px] -translate-y-1/2 w-[609px] max-md:w-[calc(100%-58px)] font-sans text-xl max-md:text-[17px] font-medium text-evently-prompt leading-relaxed break-words text-left bg-transparent border-none outline-none resize-none placeholder:text-evently-prompt/60 focus-visible:ring-2 focus-visible:ring-white/80 rounded-xl"
              placeholder="Describe your wedding, birthday or community event…"
            />

            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" />
            <button
              type="button"
              aria-label="Upload inspiration"
              onClick={() => fileInputRef.current?.click()}
              className="absolute left-[21px] top-[137px] w-11 h-11 bg-transparent border border-white/70 rounded-full cursor-pointer flex items-center justify-center backdrop-blur-[14px] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            >
              <Upload className="w-[18px] h-[18px] text-evently-text flex-shrink-0" />
            </button>

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              aria-busy={busy}
              className="absolute bottom-[21px] right-[21px] w-[156px] h-14 bg-black border-none rounded-[44px] shadow-[0_0_2px_0_rgba(0,0,0,0.05)] cursor-pointer flex items-center justify-center gap-2 font-sans text-base font-medium text-[#fafafa] uppercase tracking-[0.02em] transition-all hover:bg-[#333] active:scale-95 disabled:cursor-default disabled:hover:bg-black"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
                  Planning…
                </>
              ) : (
                'Plan My Event'
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
