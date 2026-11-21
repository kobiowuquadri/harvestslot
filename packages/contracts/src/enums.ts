import { z } from 'zod';

/**
 * Domain enums shared by API and web. They mirror the Prisma enums; a test in packages/db asserts
 * that both lists stay identical.
 */
function e<const T extends readonly [string, ...string[]]>(values: T) {
  return { values, schema: z.enum(values) };
}

export const PlatformRoleE = e(['USER', 'ADMIN']);
export const UserStatusE = e(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
export const OrgTypeE = e(['PROCESSOR', 'TRANSPORTER', 'COOPERATIVE']);
export const OrgStatusE = e(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']);
export const MembershipRoleE = e([
  'OWNER',
  'MANAGER',
  'RECEIVING_OFFICER',
  'FINANCE_OFFICER',
  'DISPATCHER',
  'DRIVER',
  'REPRESENTATIVE',
]);
export const MembershipStatusE = e(['ACTIVE', 'REVOKED']);
export const FarmerClaimStatusE = e(['SELF_REGISTERED', 'REPRESENTED_UNCLAIMED', 'CLAIMED']);
export const LocationSourceE = e(['DEVICE_GPS', 'SELF_REPORTED_PIN', 'COOPERATIVE_REPORTED', 'DESCRIPTION_ONLY']);
export const CoopMembershipStatusE = e(['ACTIVE', 'ENDED']);
export const DelegationScopeE = e([
  'ASSIST_DATA_ENTRY',
  'APPROVE_SALE',
  'CONFIRM_HANDOVER',
  'VIEW_FINANCIALS',
  'CONFIRM_PAYMENT_RECEIPT',
]);
export const ConsentMethodE = e(['FARMER_IN_APP', 'RECORDED_BY_REPRESENTATIVE']);
export const FacilityStatusE = e(['ACTIVE', 'INACTIVE']);
export const CropRequestStatusE = e(['OPEN', 'ADDED', 'DISMISSED']);
export const ProcessingProductE = e(['GARRI', 'FLOUR', 'STARCH', 'FUFU', 'CHIPS', 'TOMATO_PASTE', 'OTHER']);
export const LineStatusE = e(['ACTIVE', 'INACTIVE']);
export const SlotStatusE = e(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']);
export const HarvestRequestStatusE = e(['DRAFT', 'PUBLISHED', 'CLOSED', 'WITHDRAWN']);
export const TransportPreferenceE = e(['PROCESSOR_PAYS', 'FARMER_MAY_PAY']);
export const OfferStatusE = e(['DRAFT', 'OPEN', 'COUNTERED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'LAPSED']);
/** How the produce changes hands: the buyer collects at the farm, or the farmer delivers to the facility. */
export const HandoverArrangementE = e(['COLLECT_FROM_FARM', 'FARMER_DELIVERS']);
export const ProposerPartyE = e(['PROCESSOR', 'FARMER']);
export const FreightPayerE = e(['PROCESSOR', 'FARMER']);
export const RejectionHandlingE = e(['RETURNED_AT_PROCESSOR_COST', 'FARMER_COLLECTS', 'AGREED_DISPOSAL']);
export const ReservationStatusE = e(['HELD', 'CONFIRMED', 'CONSUMED', 'RELEASED', 'EXPIRED']);
export const HarvestLotStatusE = e([
  'ALLOCATED',
  'HARVEST_STARTED',
  'READY_FOR_PICKUP',
  'COLLECTED',
  'DELIVERED',
  'RELEASED',
  'INCIDENT',
]);
export const BookingStatusE = e([
  'DRAFT',
  'AWAITING_CONFIRMATIONS',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
]);
export const TermsChangeReasonE = e([
  'INITIAL',
  'TRANSPORT_ADDED',
  'TRANSPORT_REPLACED',
  'TRANSPORT_REMOVED',
  'AMENDMENT',
  'OVER_DELIVERY',
]);
export const AmendmentStatusE = e(['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED']);
export const BookingPartyE = e(['FARMER', 'PROCESSOR', 'TRANSPORTER', 'ADMIN']);
export const ConfirmationMethodE = e(['EXPLICIT', 'OFFER_ISSUANCE', 'QUOTE_ACCEPTANCE', 'CARRIED_FORWARD']);
export const VehicleTypeE = e(['PICKUP_VAN', 'LIGHT_TRUCK', 'MEDIUM_TRUCK', 'HEAVY_TRUCK', 'TRACTOR_TRAILER']);
export const VehicleStatusE = e(['ACTIVE', 'MAINTENANCE', 'RETIRED']);
export const DriverStatusE = e(['ACTIVE', 'INACTIVE']);
export const QuoteStatusE = e(['SUBMITTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED']);
export const TripStatusE = e(['HELD', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'EXPIRED', 'CANCELLED']);
export const ShipmentStatusE = e([
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'COLLECTED',
  'PICKUP_CONFIRMED',
  'IN_TRANSIT',
  'ARRIVED_AT_FACILITY',
  'DELIVERED',
  'CANCELLED',
]);
export const HandoverPurposeE = e(['PICKUP', 'DELIVERY']);
export const HandoverMethodE = e(['COUNTERPARTY_APP', 'HANDOVER_CODE', 'EXCEPTION_APPROVED']);
export const ReceivingStatusE = e(['DRAFT', 'AWAITING_FARMER_REVIEW', 'FINAL', 'DISPUTED', 'REVIEW_OVERDUE']);
export const WeighingMethodE = e(['WEIGHBRIDGE', 'PLATFORM_SCALE', 'HANGING_SCALE', 'COUNT_ESTIMATE']);
export const EvidenceVerificationE = e(['SELF_REPORTED', 'DOCUMENT_UPLOADED', 'ADMIN_REVIEWED']);
export const WeightEvidenceKindE = e(['WEIGHBRIDGE_TICKET', 'SCALE_PHOTO', 'OTHER']);
export const RejectionReasonE = e([
  'ROTTEN_OR_DAMAGED',
  'UNDERSIZED',
  'EXCESS_SOIL_OR_STEMS',
  'TOO_LONG_SINCE_HARVEST',
  'OVER_CONTRACT_EXCESS',
  'OTHER',
]);
export const RejectedDispositionE = e(['NONE', 'RETURNED_TO_FARMER', 'FARMER_COLLECTS', 'AGREED_DISPOSAL', 'PENDING']);
export const FarmerReceivingDecisionE = e(['ACCEPTED', 'DISPUTED']);
export const ProcessingStatusE = e(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
export const InvoiceKindE = e(['PRODUCE', 'FREIGHT', 'PLATFORM_FEE']);
export const PartyTypeE = e(['FARMER', 'ORGANISATION', 'PLATFORM']);
export const InvoiceStatusE = e(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']);
export const PaymentMethodE = e(['BANK_TRANSFER', 'CASH', 'MOBILE_MONEY', 'PAYSTACK', 'PAYSTACK_SIMULATED']);
export const PaymentAttemptStatusE = e([
  'REPORTED',
  'CONFIRMED_BY_RECIPIENT',
  'REJECTED_BY_RECIPIENT',
  'PROVIDER_PENDING',
  'PROVIDER_SUCCESS',
  'PROVIDER_FAILED',
  'PROVIDER_ABANDONED',
  'PROVIDER_REVERSED',
]);
export const VerificationLevelE = e(['REPORTED_BY_PAYER', 'CONFIRMED_BY_RECIPIENT', 'VERIFIED_BY_PROVIDER', 'SIMULATED']);
export const ReceiptDecisionE = e(['CONFIRMED', 'NOT_RECEIVED', 'AMOUNT_DIFFERS']);
export const RefundStatusE = e(['REPORTED', 'CONFIRMED_BY_RECIPIENT', 'PROVIDER_PROCESSED']);
export const DisputeCategoryE = e([
  'WEIGHT',
  'QUALITY_REJECTION',
  'PAYMENT_NOT_RECEIVED',
  'PAYMENT_AMOUNT',
  'PICKUP',
  'DELIVERY',
  'CANCELLATION',
  'OTHER',
]);
export const DisputeStatusE = e(['OPEN', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'RESOLVED', 'WITHDRAWN']);
export const ResolutionKindE = e(['ADMIN_DECISION', 'MUTUAL_SETTLEMENT']);
export const IncidentKindE = e([
  'TRANSPORT_FAILURE',
  'PROCESSOR_CANNOT_RECEIVE',
  'HARVEST_PROBLEM',
  'HANDOVER_EXCEPTION',
  'OTHER',
]);
export const IncidentStatusE = e(['OPEN', 'RESOLVED']);
export const AttachmentPurposeE = e([
  'ORG_DOCUMENT',
  'IDENTITY_DOCUMENT',
  'HARVEST_PHOTO',
  'PICKUP_EVIDENCE',
  'DELIVERY_EVIDENCE',
  'WEIGHT_EVIDENCE',
  'QUALITY_PHOTO',
  'PAYMENT_EVIDENCE',
  'DISPUTE_EVIDENCE',
  'MESSAGE_ATTACHMENT',
  'CONSENT_FORM',
  'VOICE_NOTE',
  'DATA_EXPORT',
]);
export const ScanStatusE = e(['PENDING', 'CLEAN', 'INFECTED', 'NOT_SCANNED']);
export const DocumentReviewStatusE = e(['UNREVIEWED', 'ADMIN_APPROVED', 'ADMIN_REJECTED']);
export const NotificationChannelE = e(['IN_APP', 'EMAIL', 'SMS']);
export const DeliveryStatusE = e(['QUEUED', 'SENT', 'FAILED', 'UNAVAILABLE', 'SUPPRESSED', 'CAPTURED_LOCALLY', 'DEAD']);
export const OutboxStatusE = e(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD']);
export const ConsentTypeE = e(['TERMS', 'PRIVACY', 'CONTACT_EMAIL', 'CONTACT_SMS', 'LOCATION', 'VOICE_PROCESSING']);
export const DataRequestTypeE = e(['EXPORT', 'DELETION']);
export const DataRequestStatusE = e(['RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']);
export const LossStageE = e(['IN_TRANSIT', 'AT_FACILITY', 'PROCESSING']);
export const LossMethodE = e(['MEASURED_WEIGHT', 'ESTIMATED']);
export const VoiceDraftStatusE = e(['PROCESSING', 'READY_FOR_REVIEW', 'FAILED', 'DISCARDED', 'APPLIED']);

export type PlatformRole = (typeof PlatformRoleE.values)[number];
export type UserStatus = (typeof UserStatusE.values)[number];
export type OrgType = (typeof OrgTypeE.values)[number];
export type OrgStatus = (typeof OrgStatusE.values)[number];
export type MembershipRole = (typeof MembershipRoleE.values)[number];
export type FarmerClaimStatus = (typeof FarmerClaimStatusE.values)[number];
export type LocationSource = (typeof LocationSourceE.values)[number];
export type DelegationScope = (typeof DelegationScopeE.values)[number];
export type ConsentMethod = (typeof ConsentMethodE.values)[number];
export type CropRequestStatus = (typeof CropRequestStatusE.values)[number];
export type ProcessingProduct = (typeof ProcessingProductE.values)[number];
export type SlotStatus = (typeof SlotStatusE.values)[number];
export type HarvestRequestStatus = (typeof HarvestRequestStatusE.values)[number];
export type TransportPreference = (typeof TransportPreferenceE.values)[number];
export type OfferStatus = (typeof OfferStatusE.values)[number];
export type HandoverArrangement = (typeof HandoverArrangementE.values)[number];
export type ProposerParty = (typeof ProposerPartyE.values)[number];
export type FreightPayer = (typeof FreightPayerE.values)[number];
export type RejectionHandling = (typeof RejectionHandlingE.values)[number];
export type ReservationStatus = (typeof ReservationStatusE.values)[number];
export type HarvestLotStatus = (typeof HarvestLotStatusE.values)[number];
export type BookingStatus = (typeof BookingStatusE.values)[number];
export type TermsChangeReason = (typeof TermsChangeReasonE.values)[number];
export type AmendmentStatus = (typeof AmendmentStatusE.values)[number];
export type BookingParty = (typeof BookingPartyE.values)[number];
export type ConfirmationMethod = (typeof ConfirmationMethodE.values)[number];
export type VehicleType = (typeof VehicleTypeE.values)[number];
export type VehicleStatus = (typeof VehicleStatusE.values)[number];
export type QuoteStatus = (typeof QuoteStatusE.values)[number];
export type TripStatus = (typeof TripStatusE.values)[number];
export type ShipmentStatus = (typeof ShipmentStatusE.values)[number];
export type HandoverMethod = (typeof HandoverMethodE.values)[number];
export type ReceivingStatus = (typeof ReceivingStatusE.values)[number];
export type WeighingMethod = (typeof WeighingMethodE.values)[number];
export type EvidenceVerification = (typeof EvidenceVerificationE.values)[number];
export type RejectionReason = (typeof RejectionReasonE.values)[number];
export type RejectedDisposition = (typeof RejectedDispositionE.values)[number];
export type ProcessingStatus = (typeof ProcessingStatusE.values)[number];
export type InvoiceKind = (typeof InvoiceKindE.values)[number];
export type PartyType = (typeof PartyTypeE.values)[number];
export type InvoiceStatus = (typeof InvoiceStatusE.values)[number];
export type PaymentMethod = (typeof PaymentMethodE.values)[number];
export type PaymentAttemptStatus = (typeof PaymentAttemptStatusE.values)[number];
export type VerificationLevel = (typeof VerificationLevelE.values)[number];
export type DisputeCategory = (typeof DisputeCategoryE.values)[number];
export type DisputeStatus = (typeof DisputeStatusE.values)[number];
export type IncidentKind = (typeof IncidentKindE.values)[number];
export type AttachmentPurpose = (typeof AttachmentPurposeE.values)[number];
export type ScanStatus = (typeof ScanStatusE.values)[number];
export type DeliveryStatus = (typeof DeliveryStatusE.values)[number];
export type ConsentType = (typeof ConsentTypeE.values)[number];

/** Every enum, keyed by the Prisma enum name, for the drift test. */
export const ALL_ENUMS = {
  PlatformRole: PlatformRoleE.values,
  UserStatus: UserStatusE.values,
  OrgType: OrgTypeE.values,
  OrgStatus: OrgStatusE.values,
  MembershipRole: MembershipRoleE.values,
  MembershipStatus: MembershipStatusE.values,
  FarmerClaimStatus: FarmerClaimStatusE.values,
  LocationSource: LocationSourceE.values,
  CoopMembershipStatus: CoopMembershipStatusE.values,
  DelegationScope: DelegationScopeE.values,
  ConsentMethod: ConsentMethodE.values,
  FacilityStatus: FacilityStatusE.values,
  CropRequestStatus: CropRequestStatusE.values,
  ProcessingProduct: ProcessingProductE.values,
  LineStatus: LineStatusE.values,
  SlotStatus: SlotStatusE.values,
  HarvestRequestStatus: HarvestRequestStatusE.values,
  TransportPreference: TransportPreferenceE.values,
  OfferStatus: OfferStatusE.values,
  HandoverArrangement: HandoverArrangementE.values,
  ProposerParty: ProposerPartyE.values,
  FreightPayer: FreightPayerE.values,
  RejectionHandling: RejectionHandlingE.values,
  ReservationStatus: ReservationStatusE.values,
  HarvestLotStatus: HarvestLotStatusE.values,
  BookingStatus: BookingStatusE.values,
  TermsChangeReason: TermsChangeReasonE.values,
  AmendmentStatus: AmendmentStatusE.values,
  BookingParty: BookingPartyE.values,
  ConfirmationMethod: ConfirmationMethodE.values,
  VehicleType: VehicleTypeE.values,
  VehicleStatus: VehicleStatusE.values,
  DriverStatus: DriverStatusE.values,
  QuoteStatus: QuoteStatusE.values,
  TripStatus: TripStatusE.values,
  ShipmentStatus: ShipmentStatusE.values,
  HandoverPurpose: HandoverPurposeE.values,
  HandoverMethod: HandoverMethodE.values,
  ReceivingStatus: ReceivingStatusE.values,
  WeighingMethod: WeighingMethodE.values,
  EvidenceVerification: EvidenceVerificationE.values,
  WeightEvidenceKind: WeightEvidenceKindE.values,
  RejectionReason: RejectionReasonE.values,
  RejectedDisposition: RejectedDispositionE.values,
  FarmerReceivingDecision: FarmerReceivingDecisionE.values,
  ProcessingStatus: ProcessingStatusE.values,
  InvoiceKind: InvoiceKindE.values,
  PartyType: PartyTypeE.values,
  InvoiceStatus: InvoiceStatusE.values,
  PaymentMethod: PaymentMethodE.values,
  PaymentAttemptStatus: PaymentAttemptStatusE.values,
  VerificationLevel: VerificationLevelE.values,
  ReceiptDecision: ReceiptDecisionE.values,
  RefundStatus: RefundStatusE.values,
  DisputeCategory: DisputeCategoryE.values,
  DisputeStatus: DisputeStatusE.values,
  ResolutionKind: ResolutionKindE.values,
  IncidentKind: IncidentKindE.values,
  IncidentStatus: IncidentStatusE.values,
  AttachmentPurpose: AttachmentPurposeE.values,
  ScanStatus: ScanStatusE.values,
  DocumentReviewStatus: DocumentReviewStatusE.values,
  NotificationChannel: NotificationChannelE.values,
  DeliveryStatus: DeliveryStatusE.values,
  OutboxStatus: OutboxStatusE.values,
  ConsentType: ConsentTypeE.values,
  DataRequestType: DataRequestTypeE.values,
  DataRequestStatus: DataRequestStatusE.values,
  LossStage: LossStageE.values,
  LossMethod: LossMethodE.values,
  VoiceDraftStatus: VoiceDraftStatusE.values,
} as const;
