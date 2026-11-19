import type { ReactNode } from 'react';

/** Grey intro band used at the top of the public content pages. */
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-line/70 bg-canvas">
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16">
        <p className="font-display text-sm font-semibold text-forest">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-[2.75rem] sm:leading-[1.1]">{title}</h1>
        {children ? <div className="mx-auto mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">{children}</div> : null}
      </div>
    </section>
  );
}
