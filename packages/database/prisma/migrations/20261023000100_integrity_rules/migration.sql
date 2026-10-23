-- =====================================================================
-- Integrity rules Prisma's schema language cannot express.
-- Hand-written; keep in sync with docs/database.md.
-- =====================================================================

-- Extensions live in their own schema (Supabase convention; keeps public clean).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 1. Uniqueness among NON-archived records
-- ---------------------------------------------------------------------

-- One active vehicle per normalized plate.
CREATE UNIQUE INDEX "vehicles_active_plate_uq"
  ON "vehicles" ("plate_normalized") WHERE "archived_at" IS NULL;

-- One active vehicle per VIN (VIN optional).
CREATE UNIQUE INDEX "vehicles_active_vin_uq"
  ON "vehicles" ("vin") WHERE "archived_at" IS NULL AND "vin" IS NOT NULL;

-- Exactly one open (current) ownership record per vehicle.
CREATE UNIQUE INDEX "ownership_records_one_current_uq"
  ON "ownership_records" ("vehicle_id") WHERE "end_date" IS NULL;

-- One active primary photo per vehicle.
CREATE UNIQUE INDEX "vehicle_photos_one_primary_uq"
  ON "vehicle_photos" ("vehicle_id") WHERE "angle" = 'PRIMARY' AND "removed_at" IS NULL;

-- One non-cancelled assessment per vehicle per tax year.
CREATE UNIQUE INDEX "tax_assessments_vehicle_year_uq"
  ON "tax_assessments" ("vehicle_id", "tax_year") WHERE "cancelled_at" IS NULL;

-- Business registration numbers unique among active owners.
CREATE UNIQUE INDEX "owners_active_business_reg_uq"
  ON "owners" ("business_reg_number")
  WHERE "archived_at" IS NULL AND "business_reg_number" IS NOT NULL;

-- One active role assignment per (user, role, office scope).
CREATE UNIQUE INDEX "user_roles_active_uq"
  ON "user_roles" ("user_id", "role_id", COALESCE("office_id", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "revoked_at" IS NULL;

-- ---------------------------------------------------------------------
-- 2. Fuzzy search indexes (registration portal search box)
-- ---------------------------------------------------------------------
CREATE INDEX "owners_search_name_trgm" ON "owners" USING gin ("search_name" extensions.gin_trgm_ops);
CREATE INDEX "vehicles_plate_trgm" ON "vehicles" USING gin ("plate_normalized" extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 3. CHECK constraints
-- ---------------------------------------------------------------------
ALTER TABLE "owners" ADD CONSTRAINT "owners_type_fields_chk" CHECK (
  ("owner_type" = 'INDIVIDUAL' AND "full_legal_name" IS NOT NULL)
  OR
  ("owner_type" = 'BUSINESS' AND "business_name" IS NOT NULL AND "business_reg_number" IS NOT NULL)
);

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_year_chk"
  CHECK ("manufacture_year" IS NULL OR "manufacture_year" BETWEEN 1900 AND 2100);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_chk"
  CHECK (("passenger_capacity" IS NULL OR "passenger_capacity" >= 0) AND ("load_capacity_kg" IS NULL OR "load_capacity_kg" >= 0));
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_plate_normalized_chk"
  CHECK ("plate_normalized" <> '' AND "plate_normalized" !~ '\s');

ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_dates_chk"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "registrations" ADD CONSTRAINT "registrations_validity_chk"
  CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_amount_chk" CHECK ("amount" >= 0);
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_verified_reference_chk"
  CHECK ("source" <> 'VERIFIED_OFFICIAL' OR (length(coalesce("legal_reference", '')) >= 3 AND "approved_by" IS NOT NULL));

ALTER TABLE "tax_assessments" ADD CONSTRAINT "tax_assessments_amount_chk" CHECK ("amount_due" >= 0);
ALTER TABLE "tax_assessments" ADD CONSTRAINT "tax_assessments_exemption_chk"
  CHECK ("exempted_at" IS NULL OR ("exempted_by" IS NOT NULL AND length(coalesce("exemption_reason", '')) >= 10));

ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_reversal_chk" CHECK (
  ("status" = 'POSTED' AND "reversed_at" IS NULL)
  OR ("status" = 'REVERSED' AND "reversed_at" IS NOT NULL AND "reversed_by" IS NOT NULL AND length(coalesce("reversal_reason", '')) >= 10)
);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_chk" CHECK ("amount" > 0);

ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size_chk" CHECK ("size_bytes" > 0 AND "size_bytes" <= 15728640);

ALTER TABLE "supporting_documents" ADD CONSTRAINT "supporting_documents_target_chk"
  CHECK ("vehicle_id" IS NOT NULL OR "owner_id" IS NOT NULL);

-- ---------------------------------------------------------------------
-- 4. Append-only / no-hard-delete protections
--    These fire even if application code has a bug.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dds_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DDS: % on % is not allowed (append-only record)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Audit logs & verification events: no UPDATE, no DELETE.
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();
CREATE TRIGGER verification_events_append_only BEFORE UPDATE OR DELETE ON "verification_events"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();

-- Financial and registration records: no DELETE.
CREATE TRIGGER tax_payments_no_delete BEFORE DELETE ON "tax_payments"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();
CREATE TRIGGER payment_allocations_no_delete BEFORE DELETE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();
CREATE TRIGGER tax_receipts_no_delete BEFORE DELETE ON "tax_receipts"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();
CREATE TRIGGER tax_assessments_no_delete BEFORE DELETE ON "tax_assessments"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();
CREATE TRIGGER registrations_no_delete BEFORE DELETE ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();
CREATE TRIGGER vehicles_no_delete BEFORE DELETE ON "vehicles"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();
CREATE TRIGGER ownership_records_no_delete BEFORE DELETE ON "ownership_records"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();

-- Payments: only the reversal fields may change, and only POSTED → REVERSED.
CREATE OR REPLACE FUNCTION dds_payment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."vehicle_id" IS DISTINCT FROM OLD."vehicle_id"
     OR NEW."paid_at" IS DISTINCT FROM OLD."paid_at"
     OR NEW."payment_reference" IS DISTINCT FROM OLD."payment_reference"
     OR NEW."collected_by" IS DISTINCT FROM OLD."collected_by"
     OR NEW."method" IS DISTINCT FROM OLD."method" THEN
    RAISE EXCEPTION 'DDS: posted payment fields are immutable; reverse and re-record instead'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'DDS: a reversed payment cannot be changed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tax_payments_guard BEFORE UPDATE ON "tax_payments"
  FOR EACH ROW EXECUTE FUNCTION dds_payment_guard();

-- Allocations are immutable once written.
CREATE TRIGGER payment_allocations_immutable BEFORE UPDATE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION dds_block_mutation();

-- Receipts: only voiding is allowed.
CREATE OR REPLACE FUNCTION dds_receipt_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."receipt_number" IS DISTINCT FROM OLD."receipt_number"
     OR NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
     OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
     OR NEW."issued_by" IS DISTINCT FROM OLD."issued_by"
     OR OLD."voided_at" IS NOT NULL THEN
    RAISE EXCEPTION 'DDS: receipts can only be voided once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tax_receipts_guard BEFORE UPDATE ON "tax_receipts"
  FOR EACH ROW EXECUTE FUNCTION dds_receipt_guard();

-- ---------------------------------------------------------------------
-- 5. Allocations may not exceed the assessment amount (posted payments).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dds_allocation_cap() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  due NUMERIC(14,2);
  allocated NUMERIC(14,2);
BEGIN
  SELECT "amount_due" INTO due FROM "tax_assessments" WHERE "id" = NEW."assessment_id" FOR UPDATE;
  SELECT COALESCE(SUM(a."amount"), 0) INTO allocated
    FROM "payment_allocations" a JOIN "tax_payments" p ON p."id" = a."payment_id"
   WHERE a."assessment_id" = NEW."assessment_id" AND p."status" = 'POSTED';
  IF allocated + NEW."amount" > due THEN
    RAISE EXCEPTION 'DDS: allocation exceeds assessment balance (due %, allocated %, new %)', due, allocated, NEW."amount"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_allocations_cap BEFORE INSERT ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION dds_allocation_cap();

-- ---------------------------------------------------------------------
-- 6. Least-privilege DB role for the VERIFICATION portal.
--    A login role that is a member of dds_verifier is created outside migrations;
--    its connection string goes to the verification Vercel project only.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dds_verifier') THEN
    CREATE ROLE dds_verifier NOLOGIN;
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO dds_verifier;
GRANT SELECT ON
  "vehicles", "vehicle_categories", "owners", "ownership_records", "registrations",
  "registration_offices", "vehicle_photos", "stored_files", "tax_assessments",
  "tax_payments", "payment_allocations", "tax_receipts", "review_requests",
  "users", "roles", "permissions", "role_permissions", "user_roles", "system_settings"
TO dds_verifier;
GRANT INSERT ON "verification_events", "review_requests", "audit_logs" TO dds_verifier;
GRANT SELECT, INSERT, UPDATE ON "rate_limit_buckets", "number_sequences" TO dds_verifier;
GRANT UPDATE ("last_login_at") ON "users" TO dds_verifier;
GRANT USAGE ON SEQUENCE "audit_logs_id_seq" TO dds_verifier;
