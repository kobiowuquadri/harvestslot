import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileQuestion,
  Hourglass,
  PackageCheck,
  ShieldCheck,
  ShieldQuestion,
  Truck,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  BOOKING_STATUS_LABELS,
  DISPUTE_STATUS_LABELS,
  HARVEST_STATUS_LABELS,
  OFFER_STATUS_LABELS,
  RECEIVING_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  SLOT_STATUS_LABELS,
  VERIFICATION_LABELS,
  formatKg,
  formatLagosDate,
  formatLagosDateTime,
  formatLagosWindow,
  formatNaira,
  formatPricePerKg,
  formatRelative,
  formatTonnes,
  type VerificationLevel,
} from '@harvestslot/contracts';
import { Badge } from '@/components/ui/primitives';

export const Money = ({ kobo, className }: { kobo: number | null | undefined; className?: string }) => (
  <span className={`tabular ${className ?? ''}`}>{kobo === null || kobo === undefined ? '—' : formatNaira(kobo)}</span>
);
export const Price = ({ kobo }: { kobo: number | null | undefined }) => <span className="tabular">{kobo === null || kobo === undefined ? 'Not set' : formatPricePerKg(kobo)}</span>;

/** Kilograms are canonical; tonnes are shown alongside for large quantities. */
export const Kg = ({ kg, tonnes = false }: { kg: string | null | undefined; tonnes?: boolean }) =>
  kg === null || kg === undefined ? (
    <span>—</span>
  ) : (
    <span className="tabular">
      {formatKg(kg)}
      {tonnes && Number(kg) >= 1000 ? <span className="text-muted"> ({formatTonnes(kg)})</span> : null}
    </span>
  );

export const When = ({ at, relative = false }: { at: string | null | undefined; relative?: boolean }) =>
  at ? (
    <time dateTime={at} title={`${formatLagosDateTime(at)} (Lagos time)`}>
      {formatLagosDateTime(at)}
      {relative ? <span className="text-muted"> · {formatRelative(at)}</span> : null}
    </time>
  ) : (
    <span>—</span>
  );

export const DateOnly = ({ date }: { date: string | null | undefined }) => (date ? <time dateTime={date}>{formatLagosDate(date)}</time> : <span>—</span>);

export const Window = ({ start, end }: { start: string; end: string }) => (
  <time dateTime={start} title="Lagos time">
    {formatLagosWindow(start, end)}
  </time>
);

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
interface StatusStyle {
  tone: Tone;
  icon: typeof CheckCircle2;
}

const BOOKING: Record<string, StatusStyle> = {
  DRAFT: { tone: 'warning', icon: CircleDashed },
  AWAITING_CONFIRMATIONS: { tone: 'warning', icon: Hourglass },
  CONFIRMED: { tone: 'success', icon: CheckCircle2 },
  ACTIVE: { tone: 'info', icon: CircleDot },
  COMPLETED: { tone: 'success', icon: PackageCheck },
  CANCELLED: { tone: 'danger', icon: Ban },
  EXPIRED: { tone: 'neutral', icon: Clock },
};

const generic = (status: string): StatusStyle => {
  if (/CANCEL|REJECT|DECLIN|FAIL|DEAD|WITHDRAWN|LAPSED/.test(status)) return { tone: 'danger', icon: XCircle };
  if (/EXPIRED|CLOSED/.test(status)) return { tone: 'neutral', icon: Clock };
  if (/DISPUT|OVERDUE|REVIEW|AWAITING|PENDING|COUNTERED|OPEN|DRAFT|HELD|REPORTED/.test(status)) return { tone: 'warning', icon: Hourglass };
  if (/COMPLETE|DELIVERED|FINAL|PAID|CONFIRMED|ACCEPTED|RESOLVED|PUBLISHED|APPROVED|SUCCESS|VERIFIED/.test(status)) return { tone: 'success', icon: CheckCircle2 };
  if (/TRANSIT|ROUTE|COLLECT|ARRIVED|ASSIGNED|PICKUP/.test(status)) return { tone: 'info', icon: Truck };
  return { tone: 'neutral', icon: FileQuestion };
};

const LABELS: Record<string, Record<string, string>> = {
  booking: BOOKING_STATUS_LABELS,
  offer: OFFER_STATUS_LABELS,
  harvest: HARVEST_STATUS_LABELS,
  shipment: SHIPMENT_STATUS_LABELS,
  receiving: RECEIVING_STATUS_LABELS,
  dispute: DISPUTE_STATUS_LABELS,
  slot: SLOT_STATUS_LABELS,
};

/** Status shown as icon + words, never colour alone. */
export function StatusBadge({ kind, status, label }: { kind: keyof typeof LABELS | 'invoice' | 'generic'; status: string; label?: string }) {
  const style = kind === 'booking' ? (BOOKING[status] ?? generic(status)) : generic(status);
  const text = label ?? (kind in LABELS ? LABELS[kind]![status] : undefined) ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  const Icon = style.icon;
  return (
    <Badge tone={style.tone}>
      <Icon className="size-3.5" aria-hidden />
      {text}
    </Badge>
  );
}

/** Distinguishes what the payer reported, what the recipient confirmed, and what a provider verified. */
export function VerificationTag({ level }: { level: VerificationLevel }) {
  const v = VERIFICATION_LABELS[level];
  const tone: Tone = level === 'VERIFIED_BY_PROVIDER' || level === 'CONFIRMED_BY_RECIPIENT' ? 'success' : level === 'SIMULATED' ? 'accent' : 'warning';
  const Icon = level === 'REPORTED_BY_PAYER' ? ShieldQuestion : ShieldCheck;
  return (
    <Badge tone={tone} title={v.description}>
      <Icon className="size-3.5" aria-hidden />
      {v.label}
    </Badge>
  );
}

export function ReviewedTag({ approved, children }: { approved: boolean; children?: ReactNode }) {
  return approved ? (
    <Badge tone="success" title="Organisation documents were reviewed by a HarvestSlot administrator. This is not an external registry check.">
      <ShieldCheck className="size-3.5" aria-hidden />
      {children ?? 'Reviewed by HarvestSlot'}
    </Badge>
  ) : (
    <Badge tone="warning">
      <AlertCircle className="size-3.5" aria-hidden />
      Not yet reviewed
    </Badge>
  );
}

export const DemoTag = () => <Badge tone="accent">Demo data</Badge>;
