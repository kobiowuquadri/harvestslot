'use client';

import Link from 'next/link';
import { FileCheck2, KeyRound, Plus, ShieldCheck, Sprout, UserPlus, Users } from 'lucide-react';
import {
  lagosStartOfDay,
  type BookingSummary,
  type CoopMemberDto,
  type DelegationScope,
  type FarmerClaimStatus,
} from '@harvestslot/contracts';
import { StatusBadge } from '@/components/domain/display';
import {
  ActivityFeed,
  MobileRows,
  AttentionList,
  DashboardHeader,
  greeting,
  KpiStrip,
  Panel,
  PanelEmpty,
  PanelLink,
  sumKg,
  todayLabel,
  tonnes,
} from '@/components/domain/dashboard';
import { Button } from '@/components/ui/button';
import { Badge, Table, Td, Th } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import type { Workspace } from '@/lib/session';
import { OrgStatusAlert, useFirstName, type Page } from './shared';

const CLAIM: Record<FarmerClaimStatus, { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  SELF_REGISTERED: { label: 'Own account', tone: 'success' },
  CLAIMED: { label: 'Claimed', tone: 'success' },
  REPRESENTED_UNCLAIMED: { label: 'Not yet claimed', tone: 'warning' },
};
const SCOPE: Record<DelegationScope, string> = {
  ASSIST_DATA_ENTRY: 'Data entry',
  APPROVE_SALE: 'Approve sales',
  CONFIRM_HANDOVER: 'Handovers',
  VIEW_FINANCIALS: 'View payments',
  CONFIRM_PAYMENT_RECEIPT: 'Confirm payments',
};
const SHORT = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

export function CooperativeDashboard({ w }: { w: Extract<Workspace, { kind: 'cooperative' }> }) {
  const firstName = useFirstName();
  const members = useApi<CoopMemberDto[]>(['coop-members', w.orgId], `/cooperatives/${w.orgId}/members`);
  const bookings = useApi<Page<BookingSummary>>(
    ['bookings', w.orgId, 'coop', 'dashboard'],
    `/bookings?view=cooperative&organisationId=${w.orgId}&limit=50`,
  );
  const active = (members.data ?? []).filter((m) => m.status === 'ACTIVE');
  const withPermission = active.filter((m) => m.activeDelegation);
  const unclaimed = active.filter((m) => m.claimStatus === 'REPRESENTED_UNCLAIMED');
  const pending = (bookings.data?.items ?? []).filter((b) =>
    ['DRAFT', 'AWAITING_CONFIRMATIONS'].includes(b.status),
  );
  const inProgress = (bookings.data?.items ?? []).filter((b) =>
    ['AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'].includes(b.status),
  );

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''} · ${todayLabel()}`}
        title={w.label}
        description="Help member farmers sell their harvest, only within the permissions they have given you."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/coop/members">
                <Users className="size-4" aria-hidden /> Members
              </Link>
            </Button>
            <Button asChild>
              <Link href="/coop/members/new">
                <Plus className="size-4" aria-hidden /> Register a member
              </Link>
            </Button>
          </>
        }
      />
      <OrgStatusAlert workspace={w} />

      <KpiStrip
        items={[
          {
            label: 'Active members',
            icon: Users,
            href: '/coop/members',
            value: members.data ? active.length : undefined,
            sub: members.data
              ? `${unclaimed.length} account${unclaimed.length === 1 ? '' : 's'} not yet claimed`
              : null,
          },
          {
            label: 'Permissions recorded',
            icon: KeyRound,
            href: '/coop/members',
            value: members.data ? `${withPermission.length} / ${active.length}` : undefined,
            meter:
              members.data && active.length
                ? {
                    value: withPermission.length / active.length,
                    label: 'Share of members who have given permissions',
                  }
                : undefined,
          },
          {
            label: 'Open harvest requests',
            icon: Sprout,
            href: '/coop/members',
            value: members.data ? active.reduce((a, m) => a + m.openRequests, 0) : undefined,
            sub: 'Across all members',
          },
          {
            label: 'Bookings in progress',
            icon: FileCheck2,
            href: '/bookings',
            value: bookings.data ? inProgress.length : undefined,
            sub: bookings.data ? `${tonnes(sumKg(inProgress.map((b) => b.quantityKg)))} of cassava` : null,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Panel
            title="Bookings needing approval"
            description="Prepared for members; the member or an approved representative must confirm"
            action={<PanelLink href="/bookings" />}
            bodyClassName="p-0"
          >
            {pending.length === 0 ? (
              <PanelEmpty icon={FileCheck2} title="Nothing waiting for approval">
                Bookings you prepare for members appear here until they are confirmed.
              </PanelEmpty>
            ) : (
              <>
                <MobileRows
                  rows={pending.slice(0, 6).map((b) => ({
                    key: b.id,
                    href: `/bookings/${b.id}`,
                    title: (
                      <>
                        <span className="font-mono text-[13px]">{b.reference}</span> · {b.farmerName}
                      </>
                    ),
                    meta: `${b.processorName} · harvest ${SHORT.format(lagosStartOfDay(b.plannedHarvestDate))}`,
                    aside: (
                      <>
                        <span className="text-sm font-semibold tabular text-ink">
                          {tonnes(sumKg([b.quantityKg]))}
                        </span>
                        <StatusBadge kind="booking" status={b.status} />
                      </>
                    ),
                  }))}
                />
                <div className="hidden md:block">
                  <Table caption="Bookings needing approval" bare className="min-w-[660px]">
                    <thead>
                      <tr>
                        <Th className="pl-5">Booking</Th>
                        <Th>Buyer</Th>
                        <Th className="text-right">Quantity</Th>
                        <Th>Harvest</Th>
                        <Th className="pr-5">Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.slice(0, 6).map((b) => (
                        <tr key={b.id} className="hover:bg-canvas/60">
                          <Td className="pl-5">
                            <Link
                              href={`/bookings/${b.id}`}
                              className="font-mono text-[13px] font-semibold text-ink hover:underline"
                            >
                              {b.reference}
                            </Link>
                            <span className="block text-[13px] text-muted">{b.farmerName}</span>
                          </Td>
                          <Td className="text-[13px] text-ink">{b.processorName}</Td>
                          <Td className="text-right font-medium tabular text-ink">
                            {tonnes(sumKg([b.quantityKg]))}
                          </Td>
                          <Td className="text-[13px] text-ink">
                            {SHORT.format(lagosStartOfDay(b.plannedHarvestDate))}
                          </Td>
                          <Td className="pr-5">
                            <StatusBadge kind="booking" status={b.status} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </>
            )}
          </Panel>

          <Panel
            title="Members"
            description="Account status and the permissions each member has given"
            action={<PanelLink href="/coop/members">All members</PanelLink>}
            bodyClassName="p-0"
          >
            {active.length === 0 ? (
              <PanelEmpty
                icon={UserPlus}
                title="No members yet"
                action={
                  <Button asChild size="sm">
                    <Link href="/coop/members/new">Register a member</Link>
                  </Button>
                }
              >
                Register farmers with their recorded consent; they can claim their own account later.
              </PanelEmpty>
            ) : (
              <>
                <MobileRows
                  rows={[...active]
                    .sort((a, b) => b.activeBookings + b.openRequests - (a.activeBookings + a.openRequests))
                    .slice(0, 6)
                    .map((m) => ({
                      key: m.membershipId,
                      title: m.displayName,
                      meta: `${m.lga} · ${m.activeDelegation ? m.activeDelegation.scopes.map((s) => SCOPE[s]).join(', ') : 'No permissions recorded'}`,
                      aside: (
                        <>
                          <Badge tone={CLAIM[m.claimStatus].tone}>{CLAIM[m.claimStatus].label}</Badge>
                          <span className="text-xs text-muted tabular">
                            {m.openRequests} requests · {m.activeBookings} bookings
                          </span>
                        </>
                      ),
                    }))}
                />
                <div className="hidden md:block">
                  <Table caption="Members" bare className="min-w-[680px]">
                    <thead>
                      <tr>
                        <Th className="pl-5">Member</Th>
                        <Th>Account</Th>
                        <Th>Permissions</Th>
                        <Th className="text-right">Requests</Th>
                        <Th className="pr-5 text-right">Bookings</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...active]
                        .sort(
                          (a, b) => b.activeBookings + b.openRequests - (a.activeBookings + a.openRequests),
                        )
                        .slice(0, 6)
                        .map((m) => (
                          <tr key={m.membershipId} className="hover:bg-canvas/60">
                            <Td className="pl-5">
                              <span className="block font-medium text-ink">{m.displayName}</span>
                              <span className="text-[13px] text-muted">
                                {m.community ? `${m.community}, ` : ''}
                                {m.lga}
                                {m.memberRef ? ` · ${m.memberRef}` : ''}
                              </span>
                            </Td>
                            <Td>
                              <Badge tone={CLAIM[m.claimStatus].tone}>{CLAIM[m.claimStatus].label}</Badge>
                            </Td>
                            <Td className="text-[13px]">
                              {m.activeDelegation ? (
                                <span className="text-ink">
                                  {m.activeDelegation.scopes.map((s) => SCOPE[s]).join(', ')}
                                </span>
                              ) : (
                                <span className="text-muted">None recorded</span>
                              )}
                            </Td>
                            <Td className="text-right tabular text-ink">{m.openRequests}</Td>
                            <Td className="pr-5 text-right tabular text-ink">{m.activeBookings}</Td>
                          </tr>
                        ))}
                    </tbody>
                  </Table>
                </div>
              </>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Needs attention">
            <AttentionList
              items={[
                {
                  label: 'Bookings awaiting approval',
                  detail: 'Prepared and waiting for confirmation',
                  count: bookings.data ? pending.length : undefined,
                  href: '/bookings',
                  icon: FileCheck2,
                  tone: 'warning',
                },
                {
                  label: 'Members without permissions',
                  detail: 'You cannot act for them yet',
                  count: members.data ? active.length - withPermission.length : undefined,
                  href: '/coop/members',
                  icon: ShieldCheck,
                  tone: 'info',
                },
                {
                  label: 'Accounts not yet claimed',
                  detail: 'Share the claim code with the member',
                  count: members.data ? unclaimed.length : undefined,
                  href: '/coop/members',
                  icon: KeyRound,
                  tone: 'neutral',
                },
              ]}
            />
          </Panel>
          <Panel title="Recent activity" action={<PanelLink href="/notifications" />}>
            <ActivityFeed limit={6} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
