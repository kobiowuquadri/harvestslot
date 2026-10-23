/**
 * Seed-only clock. The demo seed runs real business operations "in the past" so historical bookings
 * are internally consistent (Prisma fills now() defaults and UUIDv7 ids client-side). Never used by
 * the API or worker at runtime.
 */
const RealDate = Date;
let offsetMs = 0;

class SeedClockDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...(args as [string]));
  }
  static override now(): number {
    return RealDate.now() + offsetMs;
  }
}

export function installSeedClock(): void {
  globalThis.Date = SeedClockDate as unknown as DateConstructor;
}

export function setClock(at: Date | number): void {
  offsetMs = (typeof at === 'number' ? at : at.getTime()) - RealDate.now();
}

export function resetClock(): void {
  offsetMs = 0;
}

export function realNow(): Date {
  return new RealDate(RealDate.now());
}
