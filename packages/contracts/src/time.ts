import { z } from 'zod';

/** User-facing schedules are shown in Africa/Lagos (WAT, UTC+1, no daylight saving). Storage is UTC. */
export const LAGOS_TZ = 'Africa/Lagos';
const LAGOS_OFFSET_MINUTES = 60;

export const isoDateTime = z.iso.datetime({ offset: true, message: 'Use an ISO-8601 date-time' });
export const isoDate = z.iso.date({ message: 'Use a YYYY-MM-DD date' });

/** Calendar date (YYYY-MM-DD) in Lagos for an instant. */
export function lagosDateString(instant: Date): string {
  const shifted = new Date(instant.getTime() + LAGOS_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** UTC instant of 00:00 Lagos time on the given calendar date. */
export function lagosStartOfDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0) - LAGOS_OFFSET_MINUTES * 60_000);
}

/** UTC instant for a Lagos wall-clock time on a calendar date. */
export function lagosDateTime(date: string, hour: number, minute = 0): Date {
  return new Date(lagosStartOfDay(date).getTime() + (hour * 60 + minute) * 60_000);
}

/** Database DATE values come back as UTC-midnight Date objects; render them back to YYYY-MM-DD. */
export function dbDateToString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Converts YYYY-MM-DD to the UTC-midnight Date Prisma expects for DATE columns. */
export function stringToDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  const d = stringToDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return dbDateToString(d);
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-NG', {
  timeZone: LAGOS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat('en-NG', {
  timeZone: LAGOS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('en-NG', {
  timeZone: LAGOS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "Thu 23 Oct, 14:00" in Lagos time. */
export function formatLagosDateTime(iso: string | Date): string {
  return dateTimeFormatter.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** "Thu 23 Oct 2026" — accepts an instant or a YYYY-MM-DD calendar date. */
export function formatLagosDate(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return dateFormatter.format(lagosDateTime(value, 12));
  }
  return dateFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

/** "Thu 23 Oct, 08:00–12:00" for windows inside one day, otherwise both ends in full. */
export function formatLagosWindow(start: string | Date, end: string | Date): string {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  if (lagosDateString(s) === lagosDateString(e)) {
    return `${formatLagosDateTime(s)}–${timeFormatter.format(e)}`;
  }
  return `${formatLagosDateTime(s)} → ${formatLagosDateTime(e)}`;
}

/** Relative description for operational attention ("in 3 h", "2 d ago"). */
export function formatRelative(target: string | Date, now: Date = new Date()): string {
  const t = typeof target === 'string' ? new Date(target) : target;
  const diffMs = t.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  let text: string;
  if (minutes < 1) return 'now';
  if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 60 * 48) text = `${Math.round(minutes / 60)} h`;
  else text = `${Math.round(minutes / (60 * 24))} d`;
  return diffMs >= 0 ? `in ${text}` : `${text} ago`;
}
