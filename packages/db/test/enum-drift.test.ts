import { describe, expect, it } from 'vitest';
import { ALL_ENUMS } from '@harvestslot/contracts';
import * as prismaEnums from '../src/generated/prisma/enums.js';

describe('contract enums mirror Prisma enums', () => {
  // Server-internal enums that never cross the API boundary.
  const INTERNAL_ONLY = ['IdempotencyState', 'TokenPurpose', 'WebhookStatus'];
  const prismaNames = Object.keys(prismaEnums).filter((k) => /^[A-Z]/.test(k) && !INTERNAL_ONLY.includes(k));

  it('every Prisma enum has a contract twin and vice versa', () => {
    expect(new Set(Object.keys(ALL_ENUMS))).toEqual(new Set(prismaNames));
  });

  for (const [name, values] of Object.entries(ALL_ENUMS)) {
    it(`${name} values match`, () => {
      const prismaValues = Object.values((prismaEnums as Record<string, Record<string, string>>)[name] ?? {});
      expect([...values].sort()).toEqual([...prismaValues].sort());
    });
  }
});
