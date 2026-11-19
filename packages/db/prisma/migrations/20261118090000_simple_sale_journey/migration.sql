-- Simplified sale journey (DECISIONS #33): offers can be drafts, carry a handover arrangement instead of
-- requiring transport, and accounts can be created before farm or facility details are known.

-- AlterEnum
ALTER TYPE "OfferStatus" ADD VALUE 'DRAFT' BEFORE 'OPEN';

-- CreateEnum
CREATE TYPE "HandoverArrangement" AS ENUM ('COLLECT_FROM_FARM', 'FARMER_DELIVERS');

-- AlterTable
ALTER TABLE "organisations" ALTER COLUMN "lga" DROP NOT NULL;
ALTER TABLE "farmer_profiles" ALTER COLUMN "lga" DROP NOT NULL;

-- AlterTable
ALTER TABLE "offer_versions" ADD COLUMN "handoverArrangement" "HandoverArrangement",
ADD COLUMN "farmerDeliveryCostKobo" BIGINT;

-- AlterTable
ALTER TABLE "offer_invitations" ADD COLUMN "declinedAt" TIMESTAMPTZ(3),
ADD COLUMN "declinedByUserId" UUID,
ADD COLUMN "declineReason" TEXT;

-- Range check (application code validates first; this is the backstop).
ALTER TABLE "offer_versions"
  ADD CONSTRAINT offer_versions_farmer_delivery_cost_nonneg CHECK ("farmerDeliveryCostKobo" IS NULL OR "farmerDeliveryCostKobo" >= 0);
