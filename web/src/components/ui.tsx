import type { ReactNode } from 'react';

/** Frosted-glass panel used for every card below the hero. */
export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white/45 border-[3px] border-white rounded-[32px] shadow-[0_0_4px_0_rgba(0,0,0,0.15)] backdrop-blur-[20px] p-8 max-md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-evently-muted mb-2">{children}</p>;
}

export function CardTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2.5 font-sans text-[22px] font-medium tracking-[-0.02em] text-evently-text mb-5">
      <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/70 border border-white text-evently-prompt">{icon}</span>
      {children}
    </h3>
  );
}

export function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 border border-white px-3.5 py-1.5 font-sans text-sm font-medium text-evently-text">
      {icon}
      {children}
    </span>
  );
}

const PILL =
  'inline-flex items-center justify-center gap-2 rounded-full font-sans text-[15px] font-medium uppercase tracking-[0.04em] px-5 h-12 cursor-pointer transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-evently-prompt disabled:opacity-60 disabled:cursor-default';

/** Button styles shared by the plan cards. */
export const BUTTON = {
  dark: `${PILL} bg-evently-dark text-[#fafafa] hover:bg-[#333]`,
  glass: `${PILL} bg-white/60 border-2 border-white text-evently-text hover:bg-white/90`,
} as const;

/** Small inline icon size used inside chips. */
export const CHIP_ICON = 'w-3.5 h-3.5 text-evently-prompt';
/** Icon size used inside card titles. */
export const TITLE_ICON = 'w-[18px] h-[18px]';
