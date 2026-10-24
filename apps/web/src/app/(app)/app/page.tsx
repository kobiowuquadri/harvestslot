'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, CloudOff, Plus } from 'lucide-react';
import { ORG_STATUS_LABELS, type BookingSummary, type HarvestDto, type InboxItem, type InvoiceDto, type JobDto, type OfferDto, type OpportunityDto, type CoopMemberDto } from '@harvestslot/contracts';
import { BookingCards, HarvestCards, InvoiceRows, OfferCards } from '@/components/domain/lists';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Kg, Window } from '@/components/domain/display';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { useT } from '@/i18n';
import { listDrafts, type HarvestDraft } from '@/lib/drafts';
import { can, useApi } from '@/lib/hooks';
import { useSession, type Workspace } from '@/lib/session';

type Page<T> = { items: T[]; nextCursor: string | null };

function Section({ title, href, linkLabel = 'See all', children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-forest">{title}</h2>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-leaf">
            {linkLabel} <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function OrgStatusAlert({ workspace }: { workspace: Extract<Workspace, { status: unknown }> }) {
  if (workspace.status === 'APPROVED') return null;
  return (
    <Alert tone={workspace.status === 'PENDING_REVIEW' ? 'warning' : 'danger'} title={`Organisation status: ${ORG_STATUS_LABELS[workspace.status]}`}>
      {workspace.status === 'PENDING_REVIEW'
        ? 'You can set things up now. Publishing capacity, making offers and quoting are available once an administrator has reviewed your organisation documents.'
        : 'Contact HarvestSlot support about your organisation status.'}{' '}
      <Link className="underline" href="/organisation">
        Organisation details
      </Link>
    </Alert>
  );
}

function FarmerDashboard() {
  const { me } = useSession();
  const { t } = useT();
  const [drafts, setDrafts] = useState<HarvestDraft[]>([]);
  useEffect(() => {
    if (me) listDrafts(me.user.id).then(setDrafts).catch(() => setDrafts([]));
  }, [me]);
  const bookings = useApi<Page<BookingSummary>>(['bookings', 'farmer'], '/bookings?view=farmer&limit=20');
  const harvests = useApi<HarvestDto[]>(['harvests', 'mine'], '/harvests');
  const invoices = useApi<InvoiceDto[]>(['invoices', 'payee-open'], '/invoices?role=payee&status=OPEN');
  const needsAction = (bookings.data?.items ?? []).filter((b) => ['DRAFT', 'AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'].includes(b.status));
  const offers = (harvests.data ?? []).filter((h) => h.openOffers > 0);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Hello, ${me?.farmerProfile?.displayName ?? me?.user.displayName}`}
        description="Arrange a buyer, a processing slot and transport before you harvest."
        actions={
          <Button asChild size="lg">
            <Link href="/farmer/harvests/new">
              <Plus className="size-5" aria-hidden /> {t('farmer.newRequest')}
            </Link>
          </Button>
        }
      />
      {drafts.length ? (
        <Alert tone="info" title={`${drafts.length} draft${drafts.length > 1 ? 's' : ''} saved on this phone`} action={<Button asChild size="sm" variant="outline"><Link href="/farmer/harvests">Review</Link></Button>}>
          <span className="inline-flex items-center gap-1">
            <CloudOff className="size-4" aria-hidden /> Not yet sent to HarvestSlot. Sending is a separate step once you are online.
          </span>
        </Alert>
      ) : null}
      <Section title={t('farmer.nextAction')} href="/bookings">
        <QueryView query={bookings} isEmpty={() => needsAction.length === 0} empty={<EmptyState title="Nothing needs your attention">When a processor makes an offer or a booking needs your confirmation, it appears here.</EmptyState>}>
          {() => <BookingCards items={needsAction.slice(0, 6)} perspective="farmer" />}
        </QueryView>
      </Section>
      {offers.length ? (
        <Section title="Harvest requests with offers" href="/farmer/harvests">
          <HarvestCards items={offers} hrefFor={(h) => `/farmer/harvests/${h.id}`} />
        </Section>
      ) : null}
      <Section title="Payments to confirm" href="/invoices">
        <QueryView query={invoices} isEmpty={(d) => d.length === 0} empty={<p className="text-sm text-muted">No unpaid invoices.</p>}>
          {(d) => <InvoiceRows items={d.slice(0, 5)} />}
        </QueryView>
      </Section>
    </div>
  );
}

function ProcessorDashboard({ w }: { w: Extract<Workspace, { kind: 'processor' }> }) {
  const intake = useApi<Array<{ bookingId: string; reference: string; farmerName: string; quantityKg: string; deliveryWindow: { start: string; end: string }; transportStatus: string; delayed: boolean }>>(['intake', w.orgId], `/organisations/${w.orgId}/intake`);
  const commercial = can(w, 'processor.offer.manage');
  const inbox = useApi<InboxItem[]>(['inbox', w.orgId], commercial ? `/organisations/${w.orgId}/inbox` : null);
  const offers = useApi<OfferDto[]>(['offers', w.orgId, 'open'], commercial ? `/organisations/${w.orgId}/offers` : null);
  const awaiting = useApi<Page<BookingSummary>>(['bookings', w.orgId, 'AWAITING'], `/bookings?view=processor&organisationId=${w.orgId}&status=AWAITING_CONFIRMATIONS`);
  const responseNeeded = (offers.data ?? []).filter((o) => o.awaiting === 'PROCESSOR');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={w.label} description="Supply pipeline, intake and receiving." />
      <OrgStatusAlert workspace={w} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {commercial ? <Stat label="New harvest requests" value={inbox.data?.filter((i) => !i.existingOfferId).length} href="/processor/inbox" /> : null}
        {commercial ? <Stat label="Offers awaiting you" value={responseNeeded.length} href="/processor/offers" /> : null}
        <Stat label="Bookings awaiting confirmation" value={awaiting.data?.items.length} href="/bookings" />
      </div>
      <Section title="Upcoming intake" href="/processor/intake">
        <QueryView query={intake} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No deliveries scheduled">Confirmed bookings appear here with their delivery windows.</EmptyState>}>
          {(d) => (
            <ul className="flex flex-col gap-2">
              {d.slice(0, 8).map((r) => (
                <li key={r.bookingId}>
                  <Link href={`/bookings/${r.bookingId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface p-3 text-sm hover:border-leaf">
                    <span className="font-mono font-semibold text-forest">{r.reference}</span>
                    <span>{r.farmerName}</span>
                    <Kg kg={r.quantityKg} tonnes />
                    <Window start={r.deliveryWindow.start} end={r.deliveryWindow.end} />
                    <span className="text-muted">{r.transportStatus.replace(/_/g, ' ').toLowerCase()}</span>
                    {r.delayed ? <span className="font-semibold text-danger">Delayed</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
      {commercial && responseNeeded.length ? (
        <Section title="Counter-offers to answer" href="/processor/offers">
          <OfferCards items={responseNeeded.slice(0, 4)} perspective="processor" />
        </Section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number | undefined; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-surface p-4 hover:border-leaf">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular text-forest">{value ?? '—'}</p>
    </Link>
  );
}

function TransporterDashboard({ w }: { w: Extract<Workspace, { kind: 'transporter' }> }) {
  const manager = can(w, 'transport.quote.manage');
  const jobs = useApi<JobDto[]>(['jobs', w.orgId], `/organisations/${w.orgId}/jobs`);
  const opportunities = useApi<OpportunityDto[]>(['opportunities', w.orgId], manager ? `/organisations/${w.orgId}/opportunities` : null);
  const active = (jobs.data ?? []).filter((j) => !['DELIVERED', 'CANCELLED'].includes(j.status));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={w.label} description={manager ? 'Find loads, quote, and run your jobs.' : 'Your assigned jobs.'} />
      <OrgStatusAlert workspace={w} />
      {manager ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="Loads needing transport" value={opportunities.data?.filter((o) => !o.myQuote).length} href="/transport/opportunities" />
          <Stat label="Active jobs" value={active.length} href="/transport/jobs" />
        </div>
      ) : null}
      <Section title="Active jobs" href="/transport/jobs">
        <QueryView query={jobs} isEmpty={() => active.length === 0} empty={<EmptyState title="No active jobs">Accepted transport jobs appear here.</EmptyState>}>
          {() => (
            <ul className="flex flex-col gap-2">
              {active.map((j) => (
                <li key={j.shipmentId}>
                  <Link href={`/transport/jobs/${j.shipmentId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface p-3 text-sm hover:border-leaf">
                    <span className="font-mono font-semibold text-forest">{j.bookingReference}</span>
                    <span>
                      {j.pickup.lga} → {j.destination.facilityName}
                    </span>
                    <Window start={j.pickupWindow.start} end={j.pickupWindow.end} />
                    <span className="text-muted">
                      {j.vehicle.plate} · {j.driver.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
    </div>
  );
}

function CooperativeDashboard({ w }: { w: Extract<Workspace, { kind: 'cooperative' }> }) {
  const members = useApi<CoopMemberDto[]>(['coop-members', w.orgId], `/cooperatives/${w.orgId}/members`);
  const bookings = useApi<Page<BookingSummary>>(['bookings', w.orgId, 'coop'], `/bookings?view=cooperative&organisationId=${w.orgId}&limit=20`);
  const pending = (bookings.data?.items ?? []).filter((b) => ['DRAFT', 'AWAITING_CONFIRMATIONS'].includes(b.status));
  const active = (members.data ?? []).filter((m) => m.status === 'ACTIVE');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={w.label}
        description="Help member farmers within the permissions they have given you."
        actions={
          <Button asChild>
            <Link href="/coop/members/new">
              <Plus className="size-4" aria-hidden /> Register a member
            </Link>
          </Button>
        }
      />
      <OrgStatusAlert workspace={w} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Active members" value={members.data ? active.length : undefined} href="/coop/members" />
        <Stat label="Members with active permissions" value={members.data ? active.filter((m) => m.activeDelegation).length : undefined} href="/coop/members" />
        <Stat label="Member bookings awaiting approval" value={bookings.data ? pending.length : undefined} href="/bookings" />
      </div>
      <Section title="Member bookings needing approval" href="/bookings">
        <QueryView query={bookings} isEmpty={() => pending.length === 0} empty={<p className="text-sm text-muted">None right now.</p>}>
          {() => <BookingCards items={pending} perspective="cooperative" />}
        </QueryView>
      </Section>
    </div>
  );
}

export default function DashboardPage() {
  const { workspace } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (workspace?.kind === 'admin') router.replace('/admin');
  }, [workspace, router]);
  return (
    <>
      {params.get('welcome') ? (
        <Alert tone="success" title="Welcome to HarvestSlot" className="mb-6">
          Your account is ready. Check your email for a verification link.
        </Alert>
      ) : null}
      {workspace?.kind === 'farmer' ? <FarmerDashboard /> : null}
      {workspace?.kind === 'processor' ? <ProcessorDashboard w={workspace} /> : null}
      {workspace?.kind === 'transporter' ? <TransporterDashboard w={workspace} /> : null}
      {workspace?.kind === 'cooperative' ? <CooperativeDashboard w={workspace} /> : null}
    </>
  );
}
