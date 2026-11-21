-- Crops become data that administrators manage (they were a fixed enum), and farmers can ask for a
-- crop that is not listed yet. Existing harvests and intake lines keep their crop.

CREATE TYPE "CropRequestStatus" AS ENUM ('OPEN', 'ADDED', 'DISMISSED');

CREATE TABLE "crops" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "noun" TEXT NOT NULL,
    "nounIsPlural" BOOLEAN NOT NULL DEFAULT false,
    "produce" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "maxHoursHarvestToDelivery" INTEGER NOT NULL DEFAULT 48,
    "soilAndStemsRemoved" BOOLEAN NOT NULL DEFAULT false,
    "qualityNotes" TEXT,
    "products" "ProcessingProduct"[] DEFAULT ARRAY['OTHER']::"ProcessingProduct"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "crops_pkey" PRIMARY KEY ("code")
);

-- The crops supported at launch: reference data every environment needs (not demo data).
-- Administrators can edit them, switch them off, or add more without a release.
INSERT INTO "crops" ("code", "label", "noun", "nounIsPlural", "produce", "why", "maxHoursHarvestToDelivery", "soilAndStemsRemoved", "qualityNotes", "products", "sortOrder", "updatedAt") VALUES
  ('CASSAVA', 'Cassava', 'cassava', false, 'fresh roots', 'Roots start to spoil within two to three days of being dug up.', 48, true, 'Fresh roots, harvested no more than 48 hours before delivery.', ARRAY['GARRI', 'FLOUR', 'STARCH', 'FUFU', 'CHIPS', 'OTHER']::"ProcessingProduct"[], 10, CURRENT_TIMESTAMP),
  ('TOMATO', 'Tomatoes', 'tomatoes', true, 'fresh tomatoes', 'Ripe tomatoes bruise and soften within days, faster in the heat.', 24, false, 'Firm, ripe tomatoes in crates, picked no more than 24 hours before delivery.', ARRAY['TOMATO_PASTE', 'OTHER']::"ProcessingProduct"[], 20, CURRENT_TIMESTAMP),
  ('PEPPER', 'Peppers', 'peppers', true, 'fresh peppers', 'Fresh peppers wrinkle and rot within days of picking.', 48, false, 'Fresh, firm peppers in sacks or crates, picked no more than 48 hours before delivery.', ARRAY['OTHER']::"ProcessingProduct"[], 30, CURRENT_TIMESTAMP),
  ('PLANTAIN', 'Plantain', 'plantain', false, 'fresh bunches', 'Bunches ripen and soften within days of harvest.', 72, false, 'Green or turning bunches, harvested no more than 72 hours before delivery.', ARRAY['OTHER']::"ProcessingProduct"[], 40, CURRENT_TIMESTAMP),
  ('OIL_PALM_FRUIT', 'Oil palm fruit', 'oil palm fruit', false, 'fresh fruit bunches', 'Fresh fruit bunches lose oil quality within a day or two of cutting.', 48, false, 'Fresh fruit bunches, cut no more than 48 hours before delivery.', ARRAY['OTHER']::"ProcessingProduct"[], 50, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Existing values are kept: the enum column becomes a text code that points at "crops".
ALTER TABLE "harvest_requests" ALTER COLUMN "crop" DROP DEFAULT;
ALTER TABLE "harvest_requests" ALTER COLUMN "crop" TYPE TEXT USING "crop"::text;
ALTER TABLE "harvest_requests" ALTER COLUMN "crop" SET DEFAULT 'CASSAVA';
ALTER TABLE "processing_lines" ALTER COLUMN "crop" DROP DEFAULT;
ALTER TABLE "processing_lines" ALTER COLUMN "crop" TYPE TEXT USING "crop"::text;
ALTER TABLE "processing_lines" ALTER COLUMN "crop" SET DEFAULT 'CASSAVA';
DROP TYPE "Crop";

CREATE TABLE "crop_requests" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "note" TEXT,
    "requestedByUserId" UUID NOT NULL,
    "lga" TEXT,
    "status" "CropRequestStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedCropCode" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crop_requests_status_nameKey_idx" ON "crop_requests"("status", "nameKey");

ALTER TABLE "processing_lines" ADD CONSTRAINT "processing_lines_crop_fkey" FOREIGN KEY ("crop") REFERENCES "crops"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_requests" ADD CONSTRAINT "harvest_requests_crop_fkey" FOREIGN KEY ("crop") REFERENCES "crops"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_requests" ADD CONSTRAINT "crop_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
