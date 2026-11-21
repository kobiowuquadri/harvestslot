import type { DelegationScope, MembershipRole, OrgType } from './enums.js';

/** Roles that may exist in each organisation type. */
export const ROLES_BY_ORG_TYPE: Record<OrgType, readonly MembershipRole[]> = {
  PROCESSOR: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER', 'FINANCE_OFFICER'],
  TRANSPORTER: ['OWNER', 'DISPATCHER', 'DRIVER'],
  COOPERATIVE: ['OWNER', 'REPRESENTATIVE'],
};

interface PermissionRule {
  orgType: OrgType;
  roles: readonly MembershipRole[];
  description: string;
}

/**
 * Organisation permissions. The API is the authority (it checks these against memberships loaded from
 * the database); the web app uses the same table only to hide actions a user cannot perform.
 */
export const ORG_PERMISSIONS = {
  'processor.org.manage': { orgType: 'PROCESSOR', roles: ['OWNER', 'MANAGER'], description: 'Edit organisation profile and documents' },
  'processor.staff.manage': { orgType: 'PROCESSOR', roles: ['OWNER'], description: 'Invite, change and remove staff' },
  'processor.facility.manage': { orgType: 'PROCESSOR', roles: ['OWNER', 'MANAGER'], description: 'Manage facilities and processing lines' },
  'processor.slot.manage': { orgType: 'PROCESSOR', roles: ['OWNER', 'MANAGER'], description: 'Publish slots and adjust capacity' },
  'processor.offer.manage': { orgType: 'PROCESSOR', roles: ['OWNER', 'MANAGER'], description: 'Create, revise and withdraw offers' },
  'processor.booking.commercial': {
    orgType: 'PROCESSOR',
    roles: ['OWNER', 'MANAGER'],
    description: 'Confirm terms, accept freight quotes, amend or cancel bookings',
  },
  'processor.booking.view': {
    orgType: 'PROCESSOR',
    roles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER', 'FINANCE_OFFICER'],
    description: 'View bookings and intake schedule',
  },
  'processor.receiving.record': {
    orgType: 'PROCESSOR',
    roles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'],
    description: 'Record arrival, weights, evidence and quality decisions',
  },
  'processor.processing.record': {
    orgType: 'PROCESSOR',
    roles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'],
    description: 'Record processing start and completion',
  },
  'processor.invoice.view': { orgType: 'PROCESSOR', roles: ['OWNER', 'MANAGER', 'FINANCE_OFFICER'], description: 'View invoices' },
  'processor.payment.manage': {
    orgType: 'PROCESSOR',
    roles: ['OWNER', 'FINANCE_OFFICER'],
    description: 'Report payments, pay fee invoices, confirm receipts',
  },
  'processor.analytics.view': { orgType: 'PROCESSOR', roles: ['OWNER', 'MANAGER', 'FINANCE_OFFICER'], description: 'View reports' },

  'transport.org.manage': { orgType: 'TRANSPORTER', roles: ['OWNER'], description: 'Edit organisation profile and documents' },
  'transport.staff.manage': { orgType: 'TRANSPORTER', roles: ['OWNER'], description: 'Manage staff and drivers' },
  'transport.fleet.manage': {
    orgType: 'TRANSPORTER',
    roles: ['OWNER', 'DISPATCHER'],
    description: 'Manage vehicles, availability and service areas',
  },
  'transport.quote.manage': {
    orgType: 'TRANSPORTER',
    roles: ['OWNER', 'DISPATCHER'],
    description: 'Submit quotes and accept assignments',
  },
  'transport.job.view': { orgType: 'TRANSPORTER', roles: ['OWNER', 'DISPATCHER', 'DRIVER'], description: 'View jobs' },
  'transport.job.execute': { orgType: 'TRANSPORTER', roles: ['DRIVER'], description: 'Record milestones on assigned jobs' },
  'transport.invoice.manage': { orgType: 'TRANSPORTER', roles: ['OWNER'], description: 'View freight invoices and confirm receipts' },

  'coop.org.manage': { orgType: 'COOPERATIVE', roles: ['OWNER'], description: 'Edit organisation profile and staff' },
  'coop.members.manage': {
    orgType: 'COOPERATIVE',
    roles: ['OWNER', 'REPRESENTATIVE'],
    description: 'Register members, record consent, invite members to claim accounts',
  },
  'coop.act': {
    orgType: 'COOPERATIVE',
    roles: ['OWNER', 'REPRESENTATIVE'],
    description: 'Act for members within their delegation scopes',
  },
} as const satisfies Record<string, PermissionRule>;

export type OrgPermission = keyof typeof ORG_PERMISSIONS;

export function roleGrants(permission: OrgPermission, orgType: OrgType, roles: readonly MembershipRole[]): boolean {
  const rule: PermissionRule = ORG_PERMISSIONS[permission];
  return rule.orgType === orgType && roles.some((r) => rule.roles.includes(r));
}

/** Delegation scope a cooperative representative needs for each farmer-side action. `null` = any valid delegation. */
export const FARMER_ACTION_SCOPES = {
  'profile.view': null,
  'harvest.view': null,
  'booking.view': null,
  'harvest.edit': 'ASSIST_DATA_ENTRY',
  'location.edit': 'ASSIST_DATA_ENTRY',
  'offer.prepare': 'ASSIST_DATA_ENTRY',
  'harvest.progress': 'ASSIST_DATA_ENTRY',
  'message.send': 'ASSIST_DATA_ENTRY',
  'offer.accept': 'APPROVE_SALE',
  'offer.counter': 'APPROVE_SALE',
  'offer.decline': 'APPROVE_SALE',
  'terms.confirm': 'APPROVE_SALE',
  'freight.accept': 'APPROVE_SALE',
  'booking.cancel': 'APPROVE_SALE',
  'receiving.review': 'APPROVE_SALE',
  'dispute.open': 'APPROVE_SALE',
  'pickup.confirm': 'CONFIRM_HANDOVER',
  'finance.view': 'VIEW_FINANCIALS',
  'payment.confirm': 'CONFIRM_PAYMENT_RECEIPT',
} as const satisfies Record<string, DelegationScope | null>;

export type FarmerAction = keyof typeof FARMER_ACTION_SCOPES;

export function scopeAllows(action: FarmerAction, scopes: readonly DelegationScope[]): boolean {
  const required = FARMER_ACTION_SCOPES[action];
  return required === null || scopes.includes(required);
}

export const DELEGATION_SCOPE_LABELS: Record<DelegationScope, { label: string; description: string }> = {
  ASSIST_DATA_ENTRY: {
    label: 'Help with data entry',
    description: 'Create and update harvest requests and farm locations, prepare offers for approval, report harvest progress.',
  },
  APPROVE_SALE: {
    label: 'Approve sales',
    description: 'Accept offers and terms, accept farmer-paid transport, review receiving decisions, open disputes, cancel bookings.',
  },
  CONFIRM_HANDOVER: { label: 'Confirm pickups', description: 'Confirm handover of produce to the transporter at the farm.' },
  VIEW_FINANCIALS: { label: 'View finances', description: 'See invoices and payment status for this farmer.' },
  CONFIRM_PAYMENT_RECEIPT: {
    label: 'Confirm payments received',
    description: 'Confirm or dispute that a payment reached the farmer.',
  },
};
