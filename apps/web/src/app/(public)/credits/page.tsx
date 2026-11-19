import type { Metadata } from 'next';
import { PageIntro } from '@/components/domain/marketing';
import { Photo } from '@/components/domain/photo';
import { photos } from '@/content/photos';

export const metadata: Metadata = { title: 'Photo credits' };

export default function CreditsPage() {
  return (
    <>
      <PageIntro eyebrow="Credits" title="Photo credits">
        The photographs on this site come from Wikimedia Commons contributors and are used under the open licences listed below. The people shown are not HarvestSlot users or endorsers.
      </PageIntro>
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.values(photos).map((p) => (
            <li key={p.src} className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
              <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-line">
                <Photo photo={p} sizes="80px" />
              </div>
              <div className="min-w-0 text-sm">
                <a href={p.source} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink" target="_blank" rel="noopener noreferrer">
                  {p.title}
                </a>
                <p className="mt-1 text-muted">by {p.author}</p>
                <p className="mt-1">
                  <a href={p.licenseUrl} className="text-leaf underline underline-offset-2" target="_blank" rel="noopener noreferrer">
                    {p.license}
                  </a>
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm leading-relaxed text-muted">
          Changes: images were resized and converted to WebP, and some are displayed in greyscale. Under their CC BY-SA licences, these adapted files may be reused under the same licence with attribution to the original authors.
        </p>
      </div>
    </>
  );
}
