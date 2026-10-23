-- Constraints, exclusion rules and immutability triggers that Prisma's schema language cannot express.
-- Application code performs the same checks first to return friendly errors; these are the backstop.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------- Reference sequences (human-friendly numbers) -------------
CREATE SEQUENCE IF NOT EXISTS harvest_ref_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS booking_ref_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS dispute_ref_seq START 1001;

-- ------------- Range and consistency checks -------------
ALTER TABLE farm_locations
  ADD CONSTRAINT farm_locations_lat_range CHECK ("exactLat" IS NULL OR "exactLat" BETWEEN -90 AND 90),
  ADD CONSTRAINT farm_locations_lng_range CHECK ("exactLng" IS NULL OR "exactLng" BETWEEN -180 AND 180),
  ADD CONSTRAINT farm_locations_approx_lat_range CHECK ("approxLat" IS NULL OR "approxLat" BETWEEN -90 AND 90),
  ADD CONSTRAINT farm_locations_approx_lng_range CHECK ("approxLng" IS NULL OR "approxLng" BETWEEN -180 AND 180),
  ADD CONSTRAINT farm_locations_accuracy_nonneg CHECK ("accuracyM" IS NULL OR "accuracyM" >= 0);

ALTER TABLE facilities
  ADD CONSTRAINT facilities_lat_range CHECK ("lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT facilities_lng_range CHECK ("lng" BETWEEN -180 AND 180),
  ADD CONSTRAINT facilities_min_order_nonneg CHECK ("minOrderKg" >= 0),
  ADD CONSTRAINT facilities_distance_positive CHECK ("maxPickupDistanceKm" > 0),
  ADD CONSTRAINT facilities_price_nonneg CHECK ("indicativePriceKoboPerKg" IS NULL OR "indicativePriceKoboPerKg" >= 0),
  ADD CONSTRAINT facilities_tolerance_range CHECK ("defaultToleranceBps" BETWEEN 0 AND 5000),
  ADD CONSTRAINT facilities_payment_terms_range CHECK ("defaultPaymentTermsDays" BETWEEN 0 AND 180);

ALTER TABLE processing_slots
  ADD CONSTRAINT processing_slots_interval CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT processing_slots_capacity_positive CHECK ("processingCapacityKg" >= 0),
  ADD CONSTRAINT processing_slots_purchase_nonneg CHECK ("purchaseLimitKg" >= 0);

-- Non-overlapping slots per processing line (cancelled slots do not occupy the line).
ALTER TABLE processing_slots
  ADD CONSTRAINT processing_slots_no_overlap
  EXCLUDE USING gist ("lineId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE (status <> 'CANCELLED');

ALTER TABLE capacity_adjustments
  ADD CONSTRAINT capacity_adjustments_nonneg CHECK ("newProcessingKg" >= 0 AND "newPurchaseLimitKg" >= 0);

ALTER TABLE harvest_requests
  ADD CONSTRAINT harvest_requests_estimated_positive CHECK ("estimatedQuantityKg" > 0),
  ADD CONSTRAINT harvest_requests_eligible_positive CHECK ("eligibleQuantityKg" > 0),
  ADD CONSTRAINT harvest_requests_eligible_le_estimated CHECK ("eligibleQuantityKg" <= "estimatedQuantityKg"),
  ADD CONSTRAINT harvest_requests_dates CHECK ("latestHarvestDate" >= "earliestHarvestDate"),
  ADD CONSTRAINT harvest_requests_min_price_nonneg CHECK ("minPriceKoboPerKg" IS NULL OR "minPriceKoboPerKg" >= 0),
  ADD CONSTRAINT harvest_requests_crop_age CHECK ("cropAgeMonths" IS NULL OR "cropAgeMonths" BETWEEN 0 AND 60),
  ADD CONSTRAINT harvest_requests_distance CHECK ("maxDistanceKm" IS NULL OR "maxDistanceKm" > 0);

ALTER TABLE harvest_lots
  ADD CONSTRAINT harvest_lots_quantity_positive CHECK ("quantityKg" > 0),
  ADD CONSTRAINT harvest_lots_reported_nonneg CHECK ("reportedHarvestedKg" IS NULL OR "reportedHarvestedKg" >= 0);

ALTER TABLE offer_versions
  ADD CONSTRAINT offer_versions_quantity_positive CHECK ("quantityKg" > 0),
  ADD CONSTRAINT offer_versions_price_positive CHECK ("priceKoboPerKg" > 0),
  ADD CONSTRAINT offer_versions_pickup_window CHECK ("pickupWindowEnd" > "pickupWindowStart"),
  ADD CONSTRAINT offer_versions_delivery_window CHECK ("deliveryWindowEnd" > "deliveryWindowStart"),
  ADD CONSTRAINT offer_versions_delivery_after_pickup CHECK ("deliveryWindowEnd" > "pickupWindowStart"),
  ADD CONSTRAINT offer_versions_tolerance CHECK ("toleranceBps" BETWEEN 0 AND 5000),
  ADD CONSTRAINT offer_versions_payment_terms CHECK ("paymentTermsDays" BETWEEN 0 AND 180);

ALTER TABLE reservations
  ADD CONSTRAINT reservations_quantity_positive CHECK ("quantityKg" > 0),
  ADD CONSTRAINT reservations_hold_has_expiry CHECK (status <> 'HELD' OR "expiresAt" IS NOT NULL);

ALTER TABLE booking_terms_versions
  ADD CONSTRAINT terms_quantity_positive CHECK ("quantityKg" > 0),
  ADD CONSTRAINT terms_price_positive CHECK ("priceKoboPerKg" > 0),
  ADD CONSTRAINT terms_freight_nonneg CHECK ("freightKobo" IS NULL OR "freightKobo" >= 0),
  ADD CONSTRAINT terms_fee_range CHECK ("platformFeeBps" BETWEEN 0 AND 10000);

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_capacity_positive CHECK ("capacityKg" > 0);

ALTER TABLE transport_availability
  ADD CONSTRAINT transport_availability_interval CHECK ("endsAt" > "startsAt");

ALTER TABLE transport_quotes
  ADD CONSTRAINT transport_quotes_price_nonneg CHECK ("priceKobo" >= 0),
  ADD CONSTRAINT transport_quotes_pickup_window CHECK ("pickupWindowEnd" > "pickupWindowStart"),
  ADD CONSTRAINT transport_quotes_delivery_window CHECK ("deliveryWindowEnd" > "deliveryWindowStart"),
  ADD CONSTRAINT transport_quotes_delivery_after_pickup CHECK ("deliveryWindowEnd" > "pickupWindowStart");

ALTER TABLE trip_reservations
  ADD CONSTRAINT trip_reservations_interval CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT trip_reservations_buffer_nonneg CHECK ("bufferMinutes" >= 0),
  ADD CONSTRAINT trip_reservations_block CHECK ("blockStartsAt" <= "startsAt" AND "blockEndsAt" >= "endsAt"),
  ADD CONSTRAINT trip_reservations_hold_has_expiry CHECK (status <> 'HELD' OR "expiresAt" IS NOT NULL);

-- A vehicle and a driver can each serve only one confirmed/in-progress trip at a time (buffer included).
ALTER TABLE trip_reservations
  ADD CONSTRAINT trip_reservations_vehicle_no_overlap
  EXCLUDE USING gist ("vehicleId" WITH =, tstzrange("blockStartsAt", "blockEndsAt", '[)') WITH &&)
  WHERE (status IN ('CONFIRMED', 'IN_PROGRESS'));

ALTER TABLE trip_reservations
  ADD CONSTRAINT trip_reservations_driver_no_overlap
  EXCLUDE USING gist ("driverId" WITH =, tstzrange("blockStartsAt", "blockEndsAt", '[)') WITH &&)
  WHERE (status IN ('CONFIRMED', 'IN_PROGRESS') AND "driverId" IS NOT NULL);

ALTER TABLE pickup_records
  ADD CONSTRAINT pickup_records_quantity_nonneg CHECK ("reportedQuantityKg" >= 0),
  ADD CONSTRAINT pickup_records_farmer_qty_nonneg CHECK ("farmerReportedQuantityKg" IS NULL OR "farmerReportedQuantityKg" >= 0),
  ADD CONSTRAINT pickup_records_lat_range CHECK ("lat" IS NULL OR "lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT pickup_records_lng_range CHECK ("lng" IS NULL OR "lng" BETWEEN -180 AND 180),
  ADD CONSTRAINT pickup_records_accuracy CHECK ("accuracyM" IS NULL OR "accuracyM" >= 0);

ALTER TABLE receiving_records
  ADD CONSTRAINT receiving_tare_nonneg CHECK ("tareKg" >= 0),
  ADD CONSTRAINT receiving_gross_ge_tare CHECK ("grossKg" >= "tareKg"),
  ADD CONSTRAINT receiving_net_is_gross_minus_tare CHECK ("netKg" = "grossKg" - "tareKg");

ALTER TABLE quality_assessments
  ADD CONSTRAINT quality_accepted_nonneg CHECK ("acceptedKg" >= 0),
  ADD CONSTRAINT quality_rejected_nonneg CHECK ("rejectedKg" >= 0),
  ADD CONSTRAINT quality_rejection_has_disposition CHECK ("rejectedKg" = 0 OR "rejectedDisposition" <> 'NONE');

ALTER TABLE processing_records
  ADD CONSTRAINT processing_input_nonneg CHECK ("inputKg" IS NULL OR "inputKg" >= 0),
  ADD CONSTRAINT processing_output_nonneg CHECK ("outputKg" IS NULL OR "outputKg" >= 0),
  ADD CONSTRAINT processing_times CHECK ("completedAt" IS NULL OR "startedAt" IS NULL OR "completedAt" >= "startedAt");

ALTER TABLE loss_records
  ADD CONSTRAINT loss_records_quantity_positive CHECK ("quantityKg" > 0);

ALTER TABLE invoices
  ADD CONSTRAINT invoices_subtotal_nonneg CHECK ("subtotalKobo" >= 0),
  ADD CONSTRAINT invoices_total_consistent CHECK ("totalKobo" = "subtotalKobo" + "adjustmentsKobo"),
  ADD CONSTRAINT invoices_total_nonneg CHECK ("totalKobo" >= 0),
  ADD CONSTRAINT invoices_paid_range CHECK ("confirmedPaidKobo" >= 0 AND "confirmedPaidKobo" <= "totalKobo"),
  ADD CONSTRAINT invoices_currency CHECK (currency = 'NGN');

ALTER TABLE invoice_lines
  ADD CONSTRAINT invoice_lines_amount_nonneg CHECK ("amountKobo" >= 0);

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_amount_positive CHECK ("amountKobo" > 0),
  ADD CONSTRAINT payment_attempts_currency CHECK (currency = 'NGN');

ALTER TABLE refund_records
  ADD CONSTRAINT refund_records_amount_positive CHECK ("amountKobo" > 0);

ALTER TABLE disputes
  ADD CONSTRAINT disputes_amount_nonneg CHECK ("amountInQuestionKobo" IS NULL OR "amountInQuestionKobo" >= 0),
  ADD CONSTRAINT disputes_quantity_nonneg CHECK ("quantityInQuestionKg" IS NULL OR "quantityInQuestionKg" >= 0);

ALTER TABLE attachments
  ADD CONSTRAINT attachments_size_positive CHECK ("sizeBytes" > 0);

-- accepted + rejected must equal the recorded delivered net weight.
CREATE OR REPLACE FUNCTION hs_check_quality_totals() RETURNS trigger AS $$
DECLARE net NUMERIC(14,3);
BEGIN
  SELECT "netKg" INTO net FROM receiving_records WHERE id = NEW."receivingRecordId";
  IF NEW."acceptedKg" + NEW."rejectedKg" <> net THEN
    RAISE EXCEPTION 'accepted (%) + rejected (%) must equal delivered net weight (%)',
      NEW."acceptedKg", NEW."rejectedKg", net USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER quality_assessments_totals
  BEFORE INSERT OR UPDATE ON quality_assessments
  FOR EACH ROW EXECUTE FUNCTION hs_check_quality_totals();

-- ------------- Partial unique indexes -------------
CREATE UNIQUE INDEX delegation_one_active_per_pair
  ON delegation_consents ("cooperativeId", "farmerProfileId") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX amendment_one_pending_per_booking
  ON booking_amendments ("bookingId") WHERE status = 'PENDING';
CREATE UNIQUE INDEX trip_one_active_per_booking
  ON trip_reservations ("bookingId") WHERE status IN ('HELD', 'CONFIRMED', 'IN_PROGRESS');
CREATE UNIQUE INDEX shipment_one_active_per_booking
  ON shipments ("bookingId") WHERE status <> 'CANCELLED';
CREATE UNIQUE INDEX quote_one_open_per_transporter
  ON transport_quotes ("bookingId", "transporterOrgId") WHERE status = 'SUBMITTED';
CREATE UNIQUE INDEX handover_one_open_code
  ON handover_codes ("shipmentId", purpose) WHERE "consumedAt" IS NULL;
CREATE UNIQUE INDEX coop_membership_active
  ON cooperative_memberships ("farmerProfileId", "cooperativeId") WHERE status = 'ACTIVE';

-- ------------- Immutability (append-only history) -------------
CREATE OR REPLACE FUNCTION hs_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: this record is append-only history', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_events', 'booking_terms_versions', 'offer_versions', 'confirmations', 'readiness_events',
    'dispute_events', 'capacity_adjustments', 'receipt_confirmations', 'adjustments', 'invoice_lines',
    'resolutions', 'payment_evidence', 'weight_evidence', 'loss_records', 'booking_messages'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION hs_forbid_change()',
                   t || '_append_only', t);
  END LOOP;
END $$;

-- Business records that may change state but must never be deleted.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'invoices', 'payment_attempts', 'refund_records', 'disputes', 'dispute_messages',
    'receiving_records', 'quality_assessments', 'pickup_records', 'shipments', 'trip_reservations',
    'reservations', 'harvest_lots', 'offers', 'transport_quotes', 'booking_amendments',
    'delegation_consents', 'attachments', 'booking_incidents', 'processing_records'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION hs_forbid_change()',
                   t || '_no_delete', t);
  END LOOP;
END $$;

-- Dispute messages: only the settlement-acceptance fields may be set after creation.
CREATE OR REPLACE FUNCTION hs_dispute_message_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
     OR NEW."proposedAdjustmentKobo" IS DISTINCT FROM OLD."proposedAdjustmentKobo"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'dispute messages cannot be edited' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dispute_messages_guard BEFORE UPDATE ON dispute_messages
  FOR EACH ROW EXECUTE FUNCTION hs_dispute_message_guard();

-- Delegation consents: only revocation fields may change; scope changes require a new consent.
CREATE OR REPLACE FUNCTION hs_delegation_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.scopes IS DISTINCT FROM OLD.scopes
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW."grantedAt" IS DISTINCT FROM OLD."grantedAt"
     OR NEW."farmerProfileId" IS DISTINCT FROM OLD."farmerProfileId"
     OR NEW."cooperativeId" IS DISTINCT FROM OLD."cooperativeId"
     OR NEW."recordedByUserId" IS DISTINCT FROM OLD."recordedByUserId" THEN
    RAISE EXCEPTION 'delegation consents are immutable except for revocation' USING ERRCODE = '55000';
  END IF;
  IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN
    RAISE EXCEPTION 'a revoked delegation cannot be reinstated' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER delegation_consents_guard BEFORE UPDATE ON delegation_consents
  FOR EACH ROW EXECUTE FUNCTION hs_delegation_guard();
