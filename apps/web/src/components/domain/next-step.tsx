import type { ReactNode } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Every screen answers "What happens next?": the stage in plain words, what this person should do now
 * (or who they are waiting for), and one prominent action.
 */
export function NextStepCard({
  stage,
  forYou,
  waitingFor,
  action,
  secondary,
  tone = 'action',
  children,
}: {
  stage: string;
  forYou?: string | null;
  waitingFor?: string | null;
  action?: ReactNode;
  secondary?: ReactNode;
  tone?: 'action' | 'waiting' | 'done';
  children?: ReactNode;
}) {
  const waiting = !forYou && Boolean(waitingFor);
  const t = waiting ? 'waiting' : tone;
  return (
    <section
      aria-label="What happens next"
      className={cn(
        'rounded-2xl border p-5 sm:p-6',
        t === 'action' && 'border-forest/30 bg-leaf-50',
        t === 'waiting' && 'border-line bg-surface',
        t === 'done' && 'border-line bg-canvas/60',
      )}
    >
      <p className="text-[13px] font-semibold text-forest">What happens next</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">{stage}</h2>
      {forYou ? (
        <p className="mt-2 flex items-start gap-2 text-[15px] text-ink">
          <ArrowRight className="mt-1 size-4 shrink-0 text-forest" aria-hidden /> {forYou}
        </p>
      ) : waitingFor ? (
        <p className="mt-2 flex items-start gap-2 text-[15px] text-muted">
          <Clock className="mt-1 size-4 shrink-0" aria-hidden /> {waitingFor}
        </p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
      {action || secondary ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </section>
  );
}
