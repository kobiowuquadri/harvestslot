import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function useIsoNow(): string {
  return new Date().toISOString();
}

/** datetime-local input value (Lagos wall clock) ⇄ ISO instant. Lagos is UTC+1 without DST. */
export function isoToLagosInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  return d.toISOString().slice(0, 16);
}

export function lagosInputToIso(value: string): string {
  return new Date(`${value}:00+01:00`).toISOString();
}

export function nairaToKobo(naira: string): number | null {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(naira.trim().replace(/,/g, ''));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export function koboToNairaInput(kobo: number): string {
  return (kobo / 100).toFixed(2).replace(/\.00$/, '');
}
