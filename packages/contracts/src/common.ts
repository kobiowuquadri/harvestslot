import { z } from 'zod';

export const uuid = z.uuid({ message: 'Invalid identifier' });
export const idParam = z.object({ id: uuid });

/** Bounded cursor pagination. `cursor` is the last item's id from the previous page (UUIDv7 ids are time-ordered). */
export const pageQuery = z.object({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PageQuery = z.infer<typeof pageQuery>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

/** Optimistic concurrency: clients echo the version they edited. */
export const expectedVersion = z.object({ expectedVersion: z.number().int().min(1) });

export const reasonText = z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(1000);
export const shortText = (max = 200) => z.string().trim().min(1, 'Required').max(max);
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/** E.164 Nigerian mobile numbers (+234…); local 0-prefixed numbers are normalised. */
export const phoneNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .transform((v) => (v.startsWith('0') && v.length === 11 ? `+234${v.slice(1)}` : v))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a phone number like +2348012345678 or 08012345678'));

export const emailAddress = z
  .email({ message: 'Enter a valid email address' })
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

/** Nigeria bounding box; coordinates outside it are almost certainly an input mistake. */
export const nigeriaPoint = z
  .object({ lat: latitude, lng: longitude })
  .refine((p) => p.lat >= 4 && p.lat <= 14 && p.lng >= 2.6 && p.lng <= 14.7, 'Location must be within Nigeria');

/** Oyo State local government areas supported in this release (seeded into supported_locations). */
export const OYO_LGAS = [
  'Akinyele',
  'Afijio',
  'Atiba',
  'Egbeda',
  'Ibadan North',
  'Ibadan North-East',
  'Ibadan North-West',
  'Ibadan South-East',
  'Ibadan South-West',
  'Ibarapa Central',
  'Ido',
  'Iseyin',
  'Itesiwaju',
  'Kajola',
  'Lagelu',
  'Ogbomosho North',
  'Ogbomosho South',
  'Oluyole',
  'Ona Ara',
  'Oyo East',
  'Oyo West',
  'Saki East',
  'Saki West',
  'Surulere',
] as const;
export const lgaName = z.string().trim().min(2).max(80);
