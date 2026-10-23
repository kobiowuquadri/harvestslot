import type {
  BookingParty,
  BookingStatus,
  DeliveryStatus,
  DisputeCategory,
  DisputeStatus,
  HarvestLotStatus,
  HarvestRequestStatus,
  IncidentKind,
  InvoiceKind,
  MembershipRole,
  OfferStatus,
  OrgStatus,
  ReceivingStatus,
  RejectedDisposition,
  RejectionHandling,
  RejectionReason,
  ShipmentStatus,
  SlotStatus,
  VehicleType,
  VerificationLevel,
  WeighingMethod,
} from './enums.js';

/** Status text is always shown as words (with an icon), never as colour alone. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  DRAFT: 'Draft — awaiting farmer approval',
  AWAITING_CONFIRMATIONS: 'Awaiting confirmations',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Harvest in progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  OPEN: 'Open — awaiting farmer',
  COUNTERED: 'Counter-offer — awaiting processor',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
  LAPSED: 'Lapsed — quantity no longer available',
};

export const HARVEST_STATUS_LABELS: Record<HarvestRequestStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CLOSED: 'Closed to new offers',
  WITHDRAWN: 'Withdrawn',
};

export const LOT_STATUS_LABELS: Record<HarvestLotStatus, string> = {
  ALLOCATED: 'Allocated',
  HARVEST_STARTED: 'Harvesting',
  READY_FOR_PICKUP: 'Ready for pickup',
  COLLECTED: 'Collected',
  DELIVERED: 'Delivered',
  RELEASED: 'Released',
  INCIDENT: 'Incident',
};

export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = {
  DRAFT: 'Draft (not visible)',
  PUBLISHED: 'Published',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'On the way to farm',
  ARRIVED_AT_PICKUP: 'Arrived at farm',
  COLLECTED: 'Loaded — awaiting farmer confirmation',
  PICKUP_CONFIRMED: 'Pickup confirmed',
  IN_TRANSIT: 'In transit',
  ARRIVED_AT_FACILITY: 'Arrived at facility',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const RECEIVING_STATUS_LABELS: Record<ReceivingStatus, string> = {
  DRAFT: 'Weighing recorded',
  AWAITING_FARMER_REVIEW: 'Awaiting farmer review',
  FINAL: 'Final',
  DISPUTED: 'Disputed',
  REVIEW_OVERDUE: 'Review overdue — escalated',
};

export const VERIFICATION_LABELS: Record<VerificationLevel, { label: string; description: string }> = {
  REPORTED_BY_PAYER: {
    label: 'Reported by payer',
    description: 'The payer says this payment was made. The recipient has not yet confirmed it arrived.',
  },
  CONFIRMED_BY_RECIPIENT: {
    label: 'Confirmed by recipient',
    description: 'The recipient confirmed the money arrived.',
  },
  VERIFIED_BY_PROVIDER: {
    label: 'Verified by payment provider',
    description: 'Paystack confirmed this transaction by server-side verification.',
  },
  SIMULATED: {
    label: 'Simulated (development)',
    description: 'Produced by the local payment simulator. No money moved.',
  },
};

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  PRODUCE: 'Produce invoice',
  FREIGHT: 'Freight invoice',
  PLATFORM_FEE: 'HarvestSlot service fee',
};

export const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
  WEIGHT: 'Weight',
  QUALITY_REJECTION: 'Quality rejection',
  PAYMENT_NOT_RECEIVED: 'Payment not received',
  PAYMENT_AMOUNT: 'Payment amount',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
  CANCELLATION: 'Cancellation',
  OTHER: 'Other',
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  OPEN: 'Open',
  AWAITING_RESPONSE: 'Awaiting response',
  UNDER_REVIEW: 'Under administrator review',
  RESOLVED: 'Resolved',
  WITHDRAWN: 'Withdrawn',
};

export const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
  ROTTEN_OR_DAMAGED: 'Rotten or damaged roots',
  UNDERSIZED: 'Undersized roots',
  EXCESS_SOIL_OR_STEMS: 'Excess soil or stems',
  TOO_LONG_SINCE_HARVEST: 'Too long since harvest',
  OVER_CONTRACT_EXCESS: 'Above the contracted quantity',
  OTHER: 'Other',
};

export const DISPOSITION_LABELS: Record<RejectedDisposition, string> = {
  NONE: 'Not applicable',
  RETURNED_TO_FARMER: 'Returned to farmer',
  FARMER_COLLECTS: 'Farmer collects',
  AGREED_DISPOSAL: 'Disposed as agreed',
  PENDING: 'Decision pending',
};

export const REJECTION_HANDLING_LABELS: Record<RejectionHandling, string> = {
  RETURNED_AT_PROCESSOR_COST: 'Rejected cassava is returned to the farmer at the processor’s cost',
  FARMER_COLLECTS: 'Farmer collects rejected cassava from the facility',
  AGREED_DISPOSAL: 'Rejected cassava is disposed of as agreed with the farmer',
};

export const WEIGHING_METHOD_LABELS: Record<WeighingMethod, string> = {
  WEIGHBRIDGE: 'Weighbridge',
  PLATFORM_SCALE: 'Platform scale',
  HANGING_SCALE: 'Hanging scale',
  COUNT_ESTIMATE: 'Estimate (not weighed)',
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  PICKUP_VAN: 'Pickup van',
  LIGHT_TRUCK: 'Light truck',
  MEDIUM_TRUCK: 'Medium truck',
  HEAVY_TRUCK: 'Heavy truck',
  TRACTOR_TRAILER: 'Tractor with trailer',
};

export const PARTY_LABELS: Record<BookingParty, string> = {
  FARMER: 'Farmer',
  PROCESSOR: 'Processor',
  TRANSPORTER: 'Transporter',
  ADMIN: 'HarvestSlot administrator',
};

export const ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  RECEIVING_OFFICER: 'Receiving officer',
  FINANCE_OFFICER: 'Finance officer',
  DISPATCHER: 'Dispatcher',
  DRIVER: 'Driver',
  REPRESENTATIVE: 'Representative',
};

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  PENDING_REVIEW: 'Pending administrator review',
  APPROVED: 'Reviewed by HarvestSlot',
  REJECTED: 'Not approved',
  SUSPENDED: 'Suspended',
};

export const INCIDENT_KIND_LABELS: Record<IncidentKind, string> = {
  TRANSPORT_FAILURE: 'Transport failure',
  PROCESSOR_CANNOT_RECEIVE: 'Processor cannot receive',
  HARVEST_PROBLEM: 'Harvest problem',
  HANDOVER_EXCEPTION: 'Handover exception',
  OTHER: 'Other',
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  FAILED: 'Failed (will retry)',
  UNAVAILABLE: 'Not sent — no provider configured',
  SUPPRESSED: 'Not sent — demo account or contact preference',
  CAPTURED_LOCALLY: 'Captured locally (development) — not delivered',
  DEAD: 'Failed permanently',
};
