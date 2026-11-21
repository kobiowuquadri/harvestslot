-- Crops: cassava (the first crop) and tomatoes. Additive only, so a running older API keeps working.
CREATE TYPE "Crop" AS ENUM ('CASSAVA', 'TOMATO');

ALTER TYPE "ProcessingProduct" ADD VALUE IF NOT EXISTS 'TOMATO_PASTE' BEFORE 'OTHER';

ALTER TABLE "harvest_requests" ADD COLUMN "crop" "Crop" NOT NULL DEFAULT 'CASSAVA';
ALTER TABLE "processing_lines" ADD COLUMN "crop" "Crop" NOT NULL DEFAULT 'CASSAVA';
