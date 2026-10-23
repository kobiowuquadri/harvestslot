import type {
  BookingStatus,
  DisputeStatus,
  OfferStatus,
  ReceivingStatus,
  ReservationStatus,
  ShipmentStatus,
  TripStatus,
} from '@harvestslot/contracts';
import { DomainError } from './errors.js';

/**
 * Explicit state machines. Every status change in the API goes through `transition()`, so an
 * action that is not in the table cannot happen regardless of which endpoint calls it.
 * See docs/DOMAIN_AND_STATE_MACHINES.md for actor, preconditions and side effects per transition.
 */
type Machine<S extends string, A extends string> = Record<S, Partial<Record<A, S>>>;

export type BookingAction = 'approve' | 'discard' | 'confirm' | 'expire' | 'cancel' | 'startHarvest' | 'complete';
export const BOOKING_MACHINE: Machine<BookingStatus, BookingAction> = {
  DRAFT: { approve: 'AWAITING_CONFIRMATIONS', discard: 'CANCELLED', expire: 'EXPIRED', cancel: 'CANCELLED' },
  AWAITING_CONFIRMATIONS: { confirm: 'CONFIRMED', expire: 'EXPIRED', cancel: 'CANCELLED' },
  CONFIRMED: { startHarvest: 'ACTIVE', cancel: 'CANCELLED' },
  ACTIVE: { complete: 'COMPLETED' },
  COMPLETED: {},
  CANCELLED: {},
  EXPIRED: {},
};

export type OfferAction = 'revise' | 'counter' | 'accept' | 'acceptCounter' | 'decline' | 'withdraw' | 'expire' | 'lapse';
export const OFFER_MACHINE: Machine<OfferStatus, OfferAction> = {
  OPEN: { revise: 'OPEN', counter: 'COUNTERED', accept: 'ACCEPTED', decline: 'DECLINED', withdraw: 'WITHDRAWN', expire: 'EXPIRED', lapse: 'LAPSED' },
  COUNTERED: { revise: 'OPEN', acceptCounter: 'ACCEPTED', decline: 'DECLINED', withdraw: 'WITHDRAWN', expire: 'EXPIRED', lapse: 'LAPSED' },
  ACCEPTED: {},
  DECLINED: {},
  WITHDRAWN: {},
  EXPIRED: {},
  LAPSED: {},
};

export type ReservationAction = 'confirm' | 'consume' | 'release' | 'expire' | 'resize';
export const RESERVATION_MACHINE: Machine<ReservationStatus, ReservationAction> = {
  HELD: { confirm: 'CONFIRMED', release: 'RELEASED', expire: 'EXPIRED', resize: 'HELD' },
  CONFIRMED: { consume: 'CONSUMED', release: 'RELEASED', resize: 'CONFIRMED' },
  CONSUMED: {},
  RELEASED: {},
  EXPIRED: {},
};

export type TripAction = 'confirm' | 'start' | 'complete' | 'release' | 'expire' | 'cancel';
export const TRIP_MACHINE: Machine<TripStatus, TripAction> = {
  HELD: { confirm: 'CONFIRMED', release: 'RELEASED', expire: 'EXPIRED', cancel: 'CANCELLED' },
  CONFIRMED: { start: 'IN_PROGRESS', cancel: 'CANCELLED', release: 'RELEASED' },
  IN_PROGRESS: { complete: 'COMPLETED' },
  COMPLETED: {},
  RELEASED: {},
  EXPIRED: {},
  CANCELLED: {},
};

export type ShipmentAction =
  | 'depart'
  | 'arrivePickup'
  | 'recordCollection'
  | 'confirmPickup'
  | 'leavePickup'
  | 'arriveFacility'
  | 'confirmDelivery'
  | 'cancel';
export const SHIPMENT_MACHINE: Machine<ShipmentStatus, ShipmentAction> = {
  ASSIGNED: { depart: 'EN_ROUTE_TO_PICKUP', arrivePickup: 'ARRIVED_AT_PICKUP', cancel: 'CANCELLED' },
  EN_ROUTE_TO_PICKUP: { arrivePickup: 'ARRIVED_AT_PICKUP', cancel: 'CANCELLED' },
  ARRIVED_AT_PICKUP: { recordCollection: 'COLLECTED', cancel: 'CANCELLED' },
  COLLECTED: { confirmPickup: 'PICKUP_CONFIRMED' },
  PICKUP_CONFIRMED: { leavePickup: 'IN_TRANSIT' },
  IN_TRANSIT: { arriveFacility: 'ARRIVED_AT_FACILITY' },
  ARRIVED_AT_FACILITY: { confirmDelivery: 'DELIVERED' },
  DELIVERED: {},
  CANCELLED: {},
};

export type ReceivingAction = 'submitNoDiscrepancy' | 'submitWithDiscrepancy' | 'farmerAccept' | 'farmerDispute' | 'escalate' | 'resolve';
export const RECEIVING_MACHINE: Machine<ReceivingStatus, ReceivingAction> = {
  DRAFT: { submitNoDiscrepancy: 'FINAL', submitWithDiscrepancy: 'AWAITING_FARMER_REVIEW' },
  AWAITING_FARMER_REVIEW: { farmerAccept: 'FINAL', farmerDispute: 'DISPUTED', escalate: 'REVIEW_OVERDUE' },
  REVIEW_OVERDUE: { farmerAccept: 'FINAL', farmerDispute: 'DISPUTED', resolve: 'FINAL' },
  DISPUTED: { resolve: 'FINAL' },
  FINAL: {},
};

export type DisputeAction = 'awaitResponse' | 'respond' | 'escalate' | 'resolve' | 'withdraw';
export const DISPUTE_MACHINE: Machine<DisputeStatus, DisputeAction> = {
  OPEN: { awaitResponse: 'AWAITING_RESPONSE', respond: 'UNDER_REVIEW', escalate: 'UNDER_REVIEW', resolve: 'RESOLVED', withdraw: 'WITHDRAWN' },
  AWAITING_RESPONSE: { respond: 'UNDER_REVIEW', escalate: 'UNDER_REVIEW', resolve: 'RESOLVED', withdraw: 'WITHDRAWN' },
  UNDER_REVIEW: { respond: 'UNDER_REVIEW', resolve: 'RESOLVED', withdraw: 'WITHDRAWN' },
  RESOLVED: {},
  WITHDRAWN: {},
};

export function canTransition<S extends string, A extends string>(machine: Machine<S, A>, from: S, action: A): boolean {
  return machine[from]?.[action] !== undefined;
}

/** Returns the next state or throws INVALID_STATE_TRANSITION. */
export function transition<S extends string, A extends string>(machine: Machine<S, A>, from: S, action: A, entity = 'record'): S {
  const next = machine[from]?.[action];
  if (next === undefined) {
    throw new DomainError('INVALID_STATE_TRANSITION', `Cannot ${action} a ${entity} that is ${from.toLowerCase().replace(/_/g, ' ')}`, {
      from,
      action,
    });
  }
  return next;
}

export function allowedActions<S extends string, A extends string>(machine: Machine<S, A>, from: S): A[] {
  return Object.keys(machine[from] ?? {}) as A[];
}

export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
export const PRE_CONFIRMATION_STATUSES: readonly BookingStatus[] = ['DRAFT', 'AWAITING_CONFIRMATIONS'];
