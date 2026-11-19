import Image from 'next/image';
import type { Photo as PhotoData } from '@/content/photos';
import { cn } from '@/lib/utils';

/**
 * Openly licensed photography (credited on /credits). Files are pre-optimised WebP, so Next's
 * runtime optimiser is skipped. `mono` renders the photo in greyscale — the display treatment only;
 * the file itself is unchanged.
 */
export function Photo({ photo, className, mono = false, priority = false, sizes }: { photo: PhotoData; className?: string; mono?: boolean; priority?: boolean; sizes?: string }) {
  return (
    <Image
      src={photo.src}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      priority={priority}
      sizes={sizes}
      unoptimized
      className={cn('h-full w-full object-cover', mono && 'grayscale contrast-[1.05]', className)}
    />
  );
}
