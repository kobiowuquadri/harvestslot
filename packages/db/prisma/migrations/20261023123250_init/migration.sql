-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'PHONE_VERIFY', 'PHONE_RECOVERY', 'ACCOUNT_CLAIM', 'STAFF_INVITE');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('PROCESSOR', 'TRANSPORTER', 'COOPERATIVE');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MANAGER', 'RECEIVING_OFFICER', 'FINANCE_OFFICER', 'DISPATCHER', 'DRIVER', 'REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "FarmerClaimStatus" AS ENUM ('SELF_REGISTERED', 'REPRESENTED_UNCLAIMED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('DEVICE_GPS', 'SELF_REPORTED_PIN', 'COOPERATIVE_REPORTED', 'DESCRIPTION_ONLY');

-- CreateEnum
CREATE TYPE "CoopMembershipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "DelegationScope" AS ENUM ('ASSIST_DATA_ENTRY', 'APPROVE_SALE', 'CONFIRM_HANDOVER', 'VIEW_FINANCIALS', 'CONFIRM_PAYMENT_RECEIPT');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('FARMER_IN_APP', 'RECORDED_BY_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProcessingProduct" AS ENUM ('GARRI', 'FLOUR', 'STARCH', 'FUFU', 'CHIPS', 'OTHER');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HarvestRequestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TransportPreference" AS ENUM ('PROCESSOR_PAYS', 'FARMER_MAY_PAY');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('OPEN', 'COUNTERED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'LAPSED');

-- CreateEnum
CREATE TYPE "ProposerParty" AS ENUM ('PROCESSOR', 'FARMER');

-- CreateEnum
CREATE TYPE "FreightPayer" AS ENUM ('PROCESSOR', 'FARMER');

-- CreateEnum
CREATE TYPE "RejectionHandling" AS ENUM ('RETURNED_AT_PROCESSOR_COST', 'FARMER_COLLECTS', 'AGREED_DISPOSAL');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONFIRMED', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HarvestLotStatus" AS ENUM ('ALLOCATED', 'HARVEST_STARTED', 'READY_FOR_PICKUP', 'COLLECTED', 'DELIVERED', 'RELEASED', 'INCIDENT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TermsChangeReason" AS ENUM ('INITIAL', 'TRANSPORT_ADDED', 'TRANSPORT_REPLACED', 'TRANSPORT_REMOVED', 'AMENDMENT', 'OVER_DELIVERY');

-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BookingParty" AS ENUM ('FARMER', 'PROCESSOR', 'TRANSPORTER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ConfirmationMethod" AS ENUM ('EXPLICIT', 'OFFER_ISSUANCE', 'QUOTE_ACCEPTANCE', 'CARRIED_FORWARD');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('PICKUP_VAN', 'LIGHT_TRUCK', 'MEDIUM_TRUCK', 'HEAVY_TRUCK', 'TRACTOR_TRAILER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('HELD', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'COLLECTED', 'PICKUP_CONFIRMED', 'IN_TRANSIT', 'ARRIVED_AT_FACILITY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HandoverPurpose" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "HandoverMethod" AS ENUM ('COUNTERPARTY_APP', 'HANDOVER_CODE', 'EXCEPTION_APPROVED');

-- CreateEnum
CREATE TYPE "ReceivingStatus" AS ENUM ('DRAFT', 'AWAITING_FARMER_REVIEW', 'FINAL', 'DISPUTED', 'REVIEW_OVERDUE');

-- CreateEnum
CREATE TYPE "WeighingMethod" AS ENUM ('WEIGHBRIDGE', 'PLATFORM_SCALE', 'HANGING_SCALE', 'COUNT_ESTIMATE');

-- CreateEnum
CREATE TYPE "EvidenceVerification" AS ENUM ('SELF_REPORTED', 'DOCUMENT_UPLOADED', 'ADMIN_REVIEWED');

-- CreateEnum
CREATE TYPE "WeightEvidenceKind" AS ENUM ('WEIGHBRIDGE_TICKET', 'SCALE_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('ROTTEN_OR_DAMAGED', 'UNDERSIZED', 'EXCESS_SOIL_OR_STEMS', 'TOO_LONG_SINCE_HARVEST', 'OVER_CONTRACT_EXCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "RejectedDisposition" AS ENUM ('NONE', 'RETURNED_TO_FARMER', 'FARMER_COLLECTS', 'AGREED_DISPOSAL', 'PENDING');

-- CreateEnum
CREATE TYPE "FarmerReceivingDecision" AS ENUM ('ACCEPTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('PRODUCE', 'FREIGHT', 'PLATFORM_FEE');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('FARMER', 'ORGANISATION', 'PLATFORM');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'MOBILE_MONEY', 'PAYSTACK', 'PAYSTACK_SIMULATED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('REPORTED', 'CONFIRMED_BY_RECIPIENT', 'REJECTED_BY_RECIPIENT', 'PROVIDER_PENDING', 'PROVIDER_SUCCESS', 'PROVIDER_FAILED', 'PROVIDER_ABANDONED', 'PROVIDER_REVERSED');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('REPORTED_BY_PAYER', 'CONFIRMED_BY_RECIPIENT', 'VERIFIED_BY_PROVIDER', 'SIMULATED');

-- CreateEnum
CREATE TYPE "ReceiptDecision" AS ENUM ('CONFIRMED', 'NOT_RECEIVED', 'AMOUNT_DIFFERS');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REPORTED', 'CONFIRMED_BY_RECIPIENT', 'PROVIDER_PROCESSED');

-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('WEIGHT', 'QUALITY_REJECTION', 'PAYMENT_NOT_RECEIVED', 'PAYMENT_AMOUNT', 'PICKUP', 'DELIVERY', 'CANCELLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'RESOLVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ResolutionKind" AS ENUM ('ADMIN_DECISION', 'MUTUAL_SETTLEMENT');

-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('TRANSPORT_FAILURE', 'PROCESSOR_CANNOT_RECEIVE', 'HARVEST_PROBLEM', 'HANDOVER_EXCEPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AttachmentPurpose" AS ENUM ('ORG_DOCUMENT', 'IDENTITY_DOCUMENT', 'HARVEST_PHOTO', 'PICKUP_EVIDENCE', 'DELIVERY_EVIDENCE', 'WEIGHT_EVIDENCE', 'QUALITY_PHOTO', 'PAYMENT_EVIDENCE', 'DISPUTE_EVIDENCE', 'MESSAGE_ATTACHMENT', 'CONSENT_FORM', 'VOICE_NOTE', 'DATA_EXPORT');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'NOT_SCANNED');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('UNREVIEWED', 'ADMIN_APPROVED', 'ADMIN_REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'UNAVAILABLE', 'SUPPRESSED', 'CAPTURED_LOCALLY', 'DEAD');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "IdempotencyState" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'CONTACT_EMAIL', 'CONTACT_SMS', 'LOCATION', 'VOICE_PROCESSING');

-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('EXPORT', 'DELETION');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LossStage" AS ENUM ('IN_TRANSIT', 'AT_FACILITY', 'PROCESSING');

-- CreateEnum
CREATE TYPE "LossMethod" AS ENUM ('MEASURED_WEIGHT', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "VoiceDraftStatus" AS ENUM ('PROCESSING', 'READY_FOR_REVIEW', 'FAILED', 'DISCARDED', 'APPLIED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "mfaSecretEnc" TEXT,
    "mfaEnabledAt" TIMESTAMPTZ(3),
    "mfaRecoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "notificationPrefs" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "mfaPending" BOOLEAN NOT NULL DEFAULT false,
    "mfaVerifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "farmerProfileId" UUID,
    "organisationId" UUID,
    "purpose" "TokenPurpose" NOT NULL,
    "target" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "type" "OrgType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "statusReason" TEXT,
    "registrationNumber" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "lga" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Oyo',
    "address" TEXT,
    "description" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedByUserId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "roles" "MembershipRole"[],
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "MembershipRole"[],
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "lga" TEXT NOT NULL,
    "community" TEXT,
    "claimStatus" "FarmerClaimStatus" NOT NULL DEFAULT 'SELF_REGISTERED',
    "createdByUserId" UUID,
    "createdViaOrgId" UUID,
    "contactConsentAt" TIMESTAMPTZ(3),
    "locationConsentAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "farmer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_locations" (
    "id" UUID NOT NULL,
    "farmerProfileId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "lga" TEXT NOT NULL,
    "community" TEXT,
    "approxLat" DECIMAL(8,5),
    "approxLng" DECIMAL(8,5),
    "exactLat" DECIMAL(9,6),
    "exactLng" DECIMAL(9,6),
    "accuracyM" INTEGER,
    "source" "LocationSource" NOT NULL DEFAULT 'DESCRIPTION_ONLY',
    "directions" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "farm_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooperative_memberships" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "farmerProfileId" UUID NOT NULL,
    "status" "CoopMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "memberRef" TEXT,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "endedReason" TEXT,
    "createdByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cooperative_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegation_consents" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "farmerProfileId" UUID NOT NULL,
    "scopes" "DelegationScope"[],
    "method" "ConsentMethod" NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "witnessName" TEXT,
    "evidenceAttachmentId" UUID,
    "note" TEXT,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokeReason" TEXT,

    CONSTRAINT "delegation_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lga" TEXT NOT NULL,
    "address" TEXT,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "status" "FacilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "acceptsCassava" BOOLEAN NOT NULL DEFAULT true,
    "qualityCriteria" JSONB NOT NULL,
    "minOrderKg" DECIMAL(14,3) NOT NULL,
    "maxPickupDistanceKm" INTEGER NOT NULL,
    "indicativePriceKoboPerKg" BIGINT,
    "defaultToleranceBps" INTEGER NOT NULL DEFAULT 500,
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 7,
    "rejectionHandling" "RejectionHandling" NOT NULL DEFAULT 'RETURNED_AT_PROCESSOR_COST',
    "cancellationTerms" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_lines" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "product" "ProcessingProduct" NOT NULL,
    "status" "LineStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "processing_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_slots" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "processingCapacityKg" DECIMAL(14,3) NOT NULL,
    "purchaseLimitKg" DECIMAL(14,3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "closedReason" TEXT,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "processing_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_adjustments" (
    "id" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "prevProcessingKg" DECIMAL(14,3) NOT NULL,
    "newProcessingKg" DECIMAL(14,3) NOT NULL,
    "prevPurchaseLimitKg" DECIMAL(14,3) NOT NULL,
    "newPurchaseLimitKg" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capacity_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_requests" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "farmerProfileId" UUID NOT NULL,
    "farmLocationId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "actingDelegationId" UUID,
    "status" "HarvestRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedQuantityKg" DECIMAL(14,3) NOT NULL,
    "eligibleQuantityKg" DECIMAL(14,3) NOT NULL,
    "earliestHarvestDate" DATE NOT NULL,
    "latestHarvestDate" DATE NOT NULL,
    "variety" TEXT,
    "cropAgeMonths" INTEGER,
    "notes" TEXT,
    "minPriceKoboPerKg" BIGINT,
    "transportPreference" "TransportPreference" NOT NULL DEFAULT 'PROCESSOR_PAYS',
    "maxDistanceKm" INTEGER,
    "clientDraftId" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closeReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "harvest_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_invitations" (
    "id" UUID NOT NULL,
    "harvestRequestId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_lots" (
    "id" UUID NOT NULL,
    "harvestRequestId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "quantityKg" DECIMAL(14,3) NOT NULL,
    "status" "HarvestLotStatus" NOT NULL DEFAULT 'ALLOCATED',
    "plannedHarvestDate" DATE NOT NULL,
    "harvestStartedAt" TIMESTAMPTZ(3),
    "readyForPickupAt" TIMESTAMPTZ(3),
    "reportedHarvestedKg" DECIMAL(14,3),
    "collectedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "harvest_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "harvestRequestId" UUID NOT NULL,
    "processorOrgId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'OPEN',
    "currentVersionNo" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" UUID,
    "decisionReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_versions" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "proposedBy" "ProposerParty" NOT NULL,
    "proposedByUserId" UUID NOT NULL,
    "actingForFarmerId" UUID,
    "delegationId" UUID,
    "slotId" UUID NOT NULL,
    "quantityKg" DECIMAL(14,3) NOT NULL,
    "priceKoboPerKg" BIGINT NOT NULL,
    "plannedHarvestDate" DATE NOT NULL,
    "pickupWindowStart" TIMESTAMPTZ(3) NOT NULL,
    "pickupWindowEnd" TIMESTAMPTZ(3) NOT NULL,
    "deliveryWindowStart" TIMESTAMPTZ(3) NOT NULL,
    "deliveryWindowEnd" TIMESTAMPTZ(3) NOT NULL,
    "qualityTerms" JSONB NOT NULL,
    "toleranceBps" INTEGER NOT NULL,
    "paymentTermsDays" INTEGER NOT NULL,
    "freightPayer" "FreightPayer" NOT NULL DEFAULT 'PROCESSOR',
    "rejectionHandling" "RejectionHandling" NOT NULL,
    "cancellationTerms" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "bookingId" UUID,
    "quantityKg" DECIMAL(14,3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMPTZ(3),
    "heldAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "releaseReason" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "harvestRequestId" UUID NOT NULL,
    "farmerProfileId" UUID NOT NULL,
    "processorOrgId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "currentTermsVersionNo" INTEGER NOT NULL DEFAULT 1,
    "confirmationDeadline" TIMESTAMPTZ(3),
    "preparedByUserId" UUID,
    "preparedDelegationId" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByUserId" UUID,
    "cancelledByParty" "BookingParty",
    "cancelReason" TEXT,
    "expiredAt" TIMESTAMPTZ(3),
    "lastReadiness" BOOLEAN NOT NULL DEFAULT false,
    "readinessCheckedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_terms_versions" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "reason" "TermsChangeReason" NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "quantityKg" DECIMAL(14,3) NOT NULL,
    "priceKoboPerKg" BIGINT NOT NULL,
    "slotId" UUID NOT NULL,
    "freightPayer" "FreightPayer" NOT NULL,
    "freightKobo" BIGINT,
    "transportQuoteId" UUID,
    "tripId" UUID,
    "platformFeeBps" INTEGER NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_amendments" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "termsVersionId" UUID NOT NULL,
    "baseVersionNo" INTEGER NOT NULL,
    "status" "AmendmentStatus" NOT NULL DEFAULT 'PENDING',
    "proposedByUserId" UUID NOT NULL,
    "proposedByParty" "BookingParty" NOT NULL,
    "reason" TEXT NOT NULL,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" UUID,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "booking_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confirmations" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "termsVersionId" UUID NOT NULL,
    "party" "BookingParty" NOT NULL,
    "method" "ConfirmationMethod" NOT NULL,
    "actorUserId" UUID,
    "actingForFarmerId" UUID,
    "delegationId" UUID,
    "organisationId" UUID,
    "carriedFromId" UUID,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "ready" BOOLEAN NOT NULL,
    "failingChecks" TEXT[],
    "trigger" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_incidents" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "kind" "IncidentKind" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "blocking" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,
    "openedByUserId" UUID NOT NULL,
    "openedByParty" "BookingParty" NOT NULL,
    "recoveryAction" TEXT,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "booking_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_messages" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "authorParty" "BookingParty" NOT NULL,
    "actingForFarmerId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "registrationPlate" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "capacityKg" DECIMAL(14,3) NOT NULL,
    "description" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "licenceNumber" TEXT,
    "status" "DriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_service_areas" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "lga" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_availability" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_quotes" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "transporterOrgId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "pickupWindowStart" TIMESTAMPTZ(3) NOT NULL,
    "pickupWindowEnd" TIMESTAMPTZ(3) NOT NULL,
    "deliveryWindowStart" TIMESTAMPTZ(3) NOT NULL,
    "deliveryWindowEnd" TIMESTAMPTZ(3) NOT NULL,
    "priceKobo" BIGINT NOT NULL,
    "freightPayer" "FreightPayer" NOT NULL,
    "includedServices" TEXT[],
    "cancellationTerms" TEXT NOT NULL,
    "validUntil" TIMESTAMPTZ(3) NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" UUID,
    "decisionReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transport_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_reservations" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "transporterOrgId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "bufferMinutes" INTEGER NOT NULL,
    "blockStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "blockEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByUserId" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "trip_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "transporterOrgId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "enRouteAt" TIMESTAMPTZ(3),
    "arrivedPickupAt" TIMESTAMPTZ(3),
    "collectedAt" TIMESTAMPTZ(3),
    "pickupConfirmedAt" TIMESTAMPTZ(3),
    "departedAt" TIMESTAMPTZ(3),
    "arrivedFacilityAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "deliveryConfirmedByUserId" UUID,
    "deliveryMethod" "HandoverMethod",
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_records" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "reportedQuantityKg" DECIMAL(14,3) NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "accuracyM" INTEGER,
    "locationSource" "LocationSource",
    "note" TEXT,
    "confirmationMethod" "HandoverMethod",
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedByUserId" UUID,
    "confirmedActingForFarmerId" UUID,
    "confirmedDelegationId" UUID,
    "farmerReportedQuantityKg" DECIMAL(14,3),
    "exceptionReason" TEXT,
    "exceptionRequestedAt" TIMESTAMPTZ(3),
    "exceptionApprovedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pickup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_codes" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "purpose" "HandoverPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMPTZ(3),
    "issuedToUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiving_records" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "status" "ReceivingStatus" NOT NULL DEFAULT 'DRAFT',
    "grossKg" DECIMAL(14,3) NOT NULL,
    "tareKg" DECIMAL(14,3) NOT NULL,
    "netKg" DECIMAL(14,3) NOT NULL,
    "weighingMethod" "WeighingMethod" NOT NULL,
    "scaleReference" TEXT,
    "weightVerification" "EvidenceVerification" NOT NULL DEFAULT 'SELF_REPORTED',
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionSubmittedAt" TIMESTAMPTZ(3),
    "decisionSubmittedByUserId" UUID,
    "reviewDeadline" TIMESTAMPTZ(3),
    "farmerDecision" "FarmerReceivingDecision",
    "farmerDecidedAt" TIMESTAMPTZ(3),
    "farmerDecidedByUserId" UUID,
    "farmerDelegationId" UUID,
    "farmerNote" TEXT,
    "finalisedAt" TIMESTAMPTZ(3),
    "escalatedAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "receiving_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_evidence" (
    "id" UUID NOT NULL,
    "receivingRecordId" UUID NOT NULL,
    "kind" "WeightEvidenceKind" NOT NULL,
    "attachmentId" UUID,
    "suppliedByUserId" UUID NOT NULL,
    "suppliedByParty" "BookingParty" NOT NULL,
    "verification" "EvidenceVerification" NOT NULL DEFAULT 'SELF_REPORTED',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_assessments" (
    "id" UUID NOT NULL,
    "receivingRecordId" UUID NOT NULL,
    "assessedByUserId" UUID NOT NULL,
    "acceptedKg" DECIMAL(14,3) NOT NULL,
    "rejectedKg" DECIMAL(14,3) NOT NULL,
    "rejectionReasons" "RejectionReason"[],
    "rejectionNote" TEXT,
    "rejectedDisposition" "RejectedDisposition" NOT NULL DEFAULT 'NONE',
    "criteriaResults" JSONB NOT NULL,
    "hoursSinceHarvest" DECIMAL(8,2),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "quality_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_records" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "inputKg" DECIMAL(14,3),
    "startedAt" TIMESTAMPTZ(3),
    "startedByUserId" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "completedByUserId" UUID,
    "outputProduct" "ProcessingProduct",
    "outputKg" DECIMAL(14,3),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "processing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_records" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "stage" "LossStage" NOT NULL,
    "quantityKg" DECIMAL(14,3) NOT NULL,
    "method" "LossMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "bookingId" UUID NOT NULL,
    "payerType" "PartyType" NOT NULL,
    "payerOrgId" UUID,
    "payerFarmerId" UUID,
    "payeeType" "PartyType" NOT NULL,
    "payeeOrgId" UUID,
    "payeeFarmerId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "subtotalKobo" BIGINT NOT NULL,
    "adjustmentsKobo" BIGINT NOT NULL DEFAULT 0,
    "totalKobo" BIGINT NOT NULL,
    "confirmedPaidKobo" BIGINT NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "termsVersionId" UUID,
    "receivingRecordId" UUID,
    "lastReminderAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantityKg" DECIMAL(14,3),
    "unitPriceKobo" BIGINT,
    "amountKobo" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustments" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "disputeId" UUID,
    "resolutionId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "payerReference" TEXT,
    "providerReference" TEXT,
    "paidOn" TIMESTAMPTZ(3),
    "status" "PaymentAttemptStatus" NOT NULL,
    "verificationLevel" "VerificationLevel" NOT NULL,
    "providerEnvironment" TEXT,
    "providerStatus" TEXT,
    "providerPaidAt" TIMESTAMPTZ(3),
    "providerVerifiedAt" TIMESTAMPTZ(3),
    "checkoutUrl" TEXT,
    "reportedByUserId" UUID,
    "reportedActingForFarmerId" UUID,
    "note" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_evidence" (
    "id" UUID NOT NULL,
    "paymentAttemptId" UUID NOT NULL,
    "attachmentId" UUID NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_confirmations" (
    "id" UUID NOT NULL,
    "paymentAttemptId" UUID NOT NULL,
    "decision" "ReceiptDecision" NOT NULL,
    "amountReceivedKobo" BIGINT,
    "decidedByUserId" UUID NOT NULL,
    "actingForFarmerId" UUID,
    "delegationId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_records" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "paymentAttemptId" UUID,
    "amountKobo" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REPORTED',
    "providerReference" TEXT,
    "reportedByUserId" UUID NOT NULL,
    "confirmedByUserId" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refund_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" UUID NOT NULL,
    "invoiceId" UUID,
    "receivingRecordId" UUID,
    "category" "DisputeCategory" NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "openedByUserId" UUID NOT NULL,
    "openedByParty" "BookingParty" NOT NULL,
    "respondentParty" "BookingParty" NOT NULL,
    "actingForFarmerId" UUID,
    "delegationId" UUID,
    "amountInQuestionKobo" BIGINT,
    "quantityInQuestionKg" DECIMAL(14,3),
    "description" TEXT NOT NULL,
    "responseDeadline" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "authorParty" "BookingParty" NOT NULL,
    "actingForFarmerId" UUID,
    "body" TEXT NOT NULL,
    "proposedAdjustmentKobo" BIGINT,
    "settlementAcceptedAt" TIMESTAMPTZ(3),
    "settlementAcceptedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_events" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "fromStatus" "DisputeStatus",
    "toStatus" "DisputeStatus" NOT NULL,
    "actorUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolutions" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "kind" "ResolutionKind" NOT NULL,
    "outcome" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "adjustmentKobo" BIGINT,
    "revisedAcceptedKg" DECIMAL(14,3),
    "decidedByUserId" UUID NOT NULL,
    "agreedByUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "organisationId" UUID,
    "farmerProfileId" UUID,
    "bookingId" UUID,
    "disputeId" UUID,
    "harvestRequestId" UUID,
    "linkedEntityId" UUID,
    "purpose" "AttachmentPurpose" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewedByUserId" UUID,
    "reviewNote" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "bookingId" UUID,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "destinationMasked" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attemptNo" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "capturedSubject" TEXT,
    "capturedBody" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorParty" TEXT,
    "actingForFarmerId" UUID,
    "delegationId" UUID,
    "organisationId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "data" JSONB,
    "requestId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" "IdempotencyState" NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "rawBodySha256" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processingError" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "integration_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "reason" TEXT,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "supported_locations" (
    "id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "lga" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "centerLat" DECIMAL(8,5) NOT NULL,
    "centerLng" DECIMAL(8,5) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supported_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "farmerProfileId" UUID,
    "type" "ConsentType" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "method" "ConsentMethod" NOT NULL,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "note" TEXT,
    "resultAttachmentId" UUID,
    "processedByUserId" UUID,
    "outcomeNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_drafts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "farmerProfileId" UUID NOT NULL,
    "attachmentId" UUID NOT NULL,
    "status" "VoiceDraftStatus" NOT NULL DEFAULT 'PROCESSING',
    "language" TEXT NOT NULL,
    "transcript" TEXT,
    "extracted" JSONB,
    "provider" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "voice_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_tokenHash_key" ON "verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "verification_tokens_target_purpose_createdAt_idx" ON "verification_tokens"("target", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "organisations_type_status_idx" ON "organisations"("type", "status");

-- CreateIndex
CREATE INDEX "memberships_organisationId_status_idx" ON "memberships"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organisationId_key" ON "memberships"("userId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_tokenHash_key" ON "staff_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "staff_invitations_email_idx" ON "staff_invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_profiles_userId_key" ON "farmer_profiles"("userId");

-- CreateIndex
CREATE INDEX "farmer_profiles_lga_idx" ON "farmer_profiles"("lga");

-- CreateIndex
CREATE INDEX "farm_locations_farmerProfileId_idx" ON "farm_locations"("farmerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "cooperative_memberships_cooperativeId_farmerProfileId_key" ON "cooperative_memberships"("cooperativeId", "farmerProfileId");

-- CreateIndex
CREATE INDEX "delegation_consents_farmerProfileId_cooperativeId_idx" ON "delegation_consents"("farmerProfileId", "cooperativeId");

-- CreateIndex
CREATE INDEX "facilities_organisationId_idx" ON "facilities"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "processing_lines_facilityId_name_key" ON "processing_lines"("facilityId", "name");

-- CreateIndex
CREATE INDEX "processing_slots_facilityId_startsAt_idx" ON "processing_slots"("facilityId", "startsAt");

-- CreateIndex
CREATE INDEX "processing_slots_status_startsAt_idx" ON "processing_slots"("status", "startsAt");

-- CreateIndex
CREATE INDEX "capacity_adjustments_slotId_idx" ON "capacity_adjustments"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_requests_reference_key" ON "harvest_requests"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_requests_clientDraftId_key" ON "harvest_requests"("clientDraftId");

-- CreateIndex
CREATE INDEX "harvest_requests_status_earliestHarvestDate_idx" ON "harvest_requests"("status", "earliestHarvestDate");

-- CreateIndex
CREATE INDEX "harvest_requests_farmerProfileId_idx" ON "harvest_requests"("farmerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "offer_invitations_harvestRequestId_facilityId_key" ON "offer_invitations"("harvestRequestId", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_lots_bookingId_key" ON "harvest_lots"("bookingId");

-- CreateIndex
CREATE INDEX "harvest_lots_harvestRequestId_status_idx" ON "harvest_lots"("harvestRequestId", "status");

-- CreateIndex
CREATE INDEX "offers_harvestRequestId_status_idx" ON "offers"("harvestRequestId", "status");

-- CreateIndex
CREATE INDEX "offers_processorOrgId_status_idx" ON "offers"("processorOrgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "offer_versions_offerId_versionNo_key" ON "offer_versions"("offerId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_offerId_key" ON "reservations"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_bookingId_key" ON "reservations"("bookingId");

-- CreateIndex
CREATE INDEX "reservations_slotId_status_idx" ON "reservations"("slotId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_offerId_key" ON "bookings"("offerId");

-- CreateIndex
CREATE INDEX "bookings_farmerProfileId_status_idx" ON "bookings"("farmerProfileId", "status");

-- CreateIndex
CREATE INDEX "bookings_processorOrgId_status_idx" ON "bookings"("processorOrgId", "status");

-- CreateIndex
CREATE INDEX "bookings_slotId_idx" ON "bookings"("slotId");

-- CreateIndex
CREATE INDEX "bookings_status_confirmationDeadline_idx" ON "bookings"("status", "confirmationDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "booking_terms_versions_bookingId_versionNo_key" ON "booking_terms_versions"("bookingId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "booking_amendments_termsVersionId_key" ON "booking_amendments"("termsVersionId");

-- CreateIndex
CREATE INDEX "booking_amendments_bookingId_status_idx" ON "booking_amendments"("bookingId", "status");

-- CreateIndex
CREATE INDEX "confirmations_bookingId_idx" ON "confirmations"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "confirmations_termsVersionId_party_key" ON "confirmations"("termsVersionId", "party");

-- CreateIndex
CREATE INDEX "readiness_events_bookingId_createdAt_idx" ON "readiness_events"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_incidents_bookingId_status_idx" ON "booking_incidents"("bookingId", "status");

-- CreateIndex
CREATE INDEX "booking_messages_bookingId_createdAt_idx" ON "booking_messages"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registrationPlate_key" ON "vehicles"("registrationPlate");

-- CreateIndex
CREATE INDEX "vehicles_organisationId_idx" ON "vehicles"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_organisationId_userId_key" ON "drivers"("organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "transport_service_areas_organisationId_lga_key" ON "transport_service_areas"("organisationId", "lga");

-- CreateIndex
CREATE INDEX "transport_availability_vehicleId_startsAt_idx" ON "transport_availability"("vehicleId", "startsAt");

-- CreateIndex
CREATE INDEX "transport_quotes_bookingId_status_idx" ON "transport_quotes"("bookingId", "status");

-- CreateIndex
CREATE INDEX "transport_quotes_transporterOrgId_status_idx" ON "transport_quotes"("transporterOrgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_reservations_quoteId_key" ON "trip_reservations"("quoteId");

-- CreateIndex
CREATE INDEX "trip_reservations_vehicleId_status_idx" ON "trip_reservations"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "trip_reservations_driverId_status_idx" ON "trip_reservations"("driverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_tripId_key" ON "shipments"("tripId");

-- CreateIndex
CREATE INDEX "shipments_bookingId_idx" ON "shipments"("bookingId");

-- CreateIndex
CREATE INDEX "shipments_driverId_status_idx" ON "shipments"("driverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_records_shipmentId_key" ON "pickup_records"("shipmentId");

-- CreateIndex
CREATE INDEX "handover_codes_shipmentId_purpose_idx" ON "handover_codes"("shipmentId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "receiving_records_bookingId_key" ON "receiving_records"("bookingId");

-- CreateIndex
CREATE INDEX "receiving_records_facilityId_status_idx" ON "receiving_records"("facilityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quality_assessments_receivingRecordId_key" ON "quality_assessments"("receivingRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "processing_records_bookingId_key" ON "processing_records"("bookingId");

-- CreateIndex
CREATE INDEX "loss_records_bookingId_idx" ON "loss_records"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_payerOrgId_status_idx" ON "invoices"("payerOrgId", "status");

-- CreateIndex
CREATE INDEX "invoices_payeeOrgId_status_idx" ON "invoices"("payeeOrgId", "status");

-- CreateIndex
CREATE INDEX "invoices_payeeFarmerId_status_idx" ON "invoices"("payeeFarmerId", "status");

-- CreateIndex
CREATE INDEX "invoices_payerFarmerId_status_idx" ON "invoices"("payerFarmerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_bookingId_kind_key" ON "invoices"("bookingId", "kind");

-- CreateIndex
CREATE INDEX "adjustments_invoiceId_idx" ON "adjustments"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_providerReference_key" ON "payment_attempts"("providerReference");

-- CreateIndex
CREATE INDEX "payment_attempts_invoiceId_status_idx" ON "payment_attempts"("invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_confirmations_paymentAttemptId_key" ON "receipt_confirmations"("paymentAttemptId");

-- CreateIndex
CREATE INDEX "refund_records_invoiceId_idx" ON "refund_records"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_reference_key" ON "disputes"("reference");

-- CreateIndex
CREATE INDEX "disputes_bookingId_idx" ON "disputes"("bookingId");

-- CreateIndex
CREATE INDEX "disputes_status_responseDeadline_idx" ON "disputes"("status", "responseDeadline");

-- CreateIndex
CREATE INDEX "dispute_messages_disputeId_createdAt_idx" ON "dispute_messages"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "dispute_events_disputeId_createdAt_idx" ON "dispute_events"("disputeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "resolutions_disputeId_key" ON "resolutions"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_objectKey_key" ON "attachments"("objectKey");

-- CreateIndex
CREATE INDEX "attachments_bookingId_idx" ON "attachments"("bookingId");

-- CreateIndex
CREATE INDEX "attachments_organisationId_idx" ON "attachments"("organisationId");

-- CreateIndex
CREATE INDEX "attachments_disputeId_idx" ON "attachments"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_attempts_status_nextAttemptAt_idx" ON "delivery_attempts"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_notificationId_channel_key" ON "delivery_attempts"("notificationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON "outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextAttemptAt_idx" ON "outbox_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_createdAt_idx" ON "audit_events"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_action_createdAt_idx" ON "audit_events"("action", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actorUserId_operation_key_key" ON "idempotency_records"("actorUserId", "operation", "key");

-- CreateIndex
CREATE INDEX "integration_webhook_events_status_receivedAt_idx" ON "integration_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_webhook_events_provider_dedupeKey_key" ON "integration_webhook_events"("provider", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "supported_locations_state_lga_key" ON "supported_locations"("state", "lga");

-- CreateIndex
CREATE INDEX "consent_records_userId_type_idx" ON "consent_records"("userId", "type");

-- CreateIndex
CREATE INDEX "consent_records_farmerProfileId_type_idx" ON "consent_records"("farmerProfileId", "type");

-- CreateIndex
CREATE INDEX "data_requests_status_idx" ON "data_requests"("status");

-- CreateIndex
CREATE INDEX "voice_drafts_userId_createdAt_idx" ON "voice_drafts"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_profiles" ADD CONSTRAINT "farmer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_locations" ADD CONSTRAINT "farm_locations_farmerProfileId_fkey" FOREIGN KEY ("farmerProfileId") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_memberships" ADD CONSTRAINT "cooperative_memberships_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_memberships" ADD CONSTRAINT "cooperative_memberships_farmerProfileId_fkey" FOREIGN KEY ("farmerProfileId") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_consents" ADD CONSTRAINT "delegation_consents_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_consents" ADD CONSTRAINT "delegation_consents_farmerProfileId_fkey" FOREIGN KEY ("farmerProfileId") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_lines" ADD CONSTRAINT "processing_lines_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_slots" ADD CONSTRAINT "processing_slots_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "processing_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_slots" ADD CONSTRAINT "processing_slots_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_adjustments" ADD CONSTRAINT "capacity_adjustments_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "processing_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_requests" ADD CONSTRAINT "harvest_requests_farmerProfileId_fkey" FOREIGN KEY ("farmerProfileId") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_requests" ADD CONSTRAINT "harvest_requests_farmLocationId_fkey" FOREIGN KEY ("farmLocationId") REFERENCES "farm_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_invitations" ADD CONSTRAINT "offer_invitations_harvestRequestId_fkey" FOREIGN KEY ("harvestRequestId") REFERENCES "harvest_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_invitations" ADD CONSTRAINT "offer_invitations_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_lots" ADD CONSTRAINT "harvest_lots_harvestRequestId_fkey" FOREIGN KEY ("harvestRequestId") REFERENCES "harvest_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_lots" ADD CONSTRAINT "harvest_lots_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_harvestRequestId_fkey" FOREIGN KEY ("harvestRequestId") REFERENCES "harvest_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_processorOrgId_fkey" FOREIGN KEY ("processorOrgId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "processing_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "processing_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_harvestRequestId_fkey" FOREIGN KEY ("harvestRequestId") REFERENCES "harvest_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_farmerProfileId_fkey" FOREIGN KEY ("farmerProfileId") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_processorOrgId_fkey" FOREIGN KEY ("processorOrgId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "processing_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_terms_versions" ADD CONSTRAINT "booking_terms_versions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_amendments" ADD CONSTRAINT "booking_amendments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_amendments" ADD CONSTRAINT "booking_amendments_termsVersionId_fkey" FOREIGN KEY ("termsVersionId") REFERENCES "booking_terms_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_termsVersionId_fkey" FOREIGN KEY ("termsVersionId") REFERENCES "booking_terms_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_events" ADD CONSTRAINT "readiness_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_incidents" ADD CONSTRAINT "booking_incidents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_service_areas" ADD CONSTRAINT "transport_service_areas_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_availability" ADD CONSTRAINT "transport_availability_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_availability" ADD CONSTRAINT "transport_availability_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_transporterOrgId_fkey" FOREIGN KEY ("transporterOrgId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reservations" ADD CONSTRAINT "trip_reservations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reservations" ADD CONSTRAINT "trip_reservations_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "transport_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reservations" ADD CONSTRAINT "trip_reservations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reservations" ADD CONSTRAINT "trip_reservations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_records" ADD CONSTRAINT "pickup_records_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_records" ADD CONSTRAINT "pickup_records_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_codes" ADD CONSTRAINT "handover_codes_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_records" ADD CONSTRAINT "receiving_records_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_records" ADD CONSTRAINT "receiving_records_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_evidence" ADD CONSTRAINT "weight_evidence_receivingRecordId_fkey" FOREIGN KEY ("receivingRecordId") REFERENCES "receiving_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_assessments" ADD CONSTRAINT "quality_assessments_receivingRecordId_fkey" FOREIGN KEY ("receivingRecordId") REFERENCES "receiving_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_records" ADD CONSTRAINT "processing_records_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_records" ADD CONSTRAINT "processing_records_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "processing_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_records" ADD CONSTRAINT "loss_records_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_evidence" ADD CONSTRAINT "payment_evidence_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_confirmations" ADD CONSTRAINT "receipt_confirmations_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_farmerProfileId_fkey" FOREIGN KEY ("farmerProfileId") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
