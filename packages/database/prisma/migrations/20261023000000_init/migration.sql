-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'LPG', 'OTHER');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL', 'AUTOMATIC', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleUsage" AS ENUM ('PRIVATE', 'COMMERCIAL', 'PUBLIC_TRANSPORT', 'GOVERNMENT', 'NGO', 'DIPLOMATIC', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PhotoAngle" AS ENUM ('PRIMARY', 'FRONT', 'REAR', 'LEFT', 'RIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('REGISTRATION_CERTIFICATE', 'INSPECTION_CERTIFICATE', 'INSURANCE', 'OWNERSHIP_TRANSFER', 'BUSINESS_LICENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxRuleSource" AS ENUM ('CONFIGURED', 'VERIFIED_OFFICIAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASS', 'CONDITIONAL', 'FAIL');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('VERIFICATION_PORTAL', 'REGISTRATION_PORTAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Portal" AS ENUM ('REGISTRATION', 'VERIFICATION', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "staff_number" VARCHAR(50),
    "phone" VARCHAR(30),
    "office_id" UUID,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfa_required" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'so',
    "last_login_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "requires_mfa" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300),
    "module" VARCHAR(40) NOT NULL,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "office_id" UUID,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_offices" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "region" VARCHAR(100) NOT NULL,
    "zone" VARCHAR(100),
    "woreda" VARCHAR(100),
    "address" VARCHAR(300),
    "phone" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "registration_offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "vehicle_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "full_legal_name" VARCHAR(200),
    "national_id_ref" VARCHAR(50),
    "business_name" VARCHAR(200),
    "business_reg_number" VARCHAR(60),
    "authorized_rep_name" VARCHAR(200),
    "authorized_rep_phone" VARCHAR(30),
    "search_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "address" VARCHAR(300),
    "locality" VARCHAR(120),
    "notes" VARCHAR(1000),
    "photo_file_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate_number" VARCHAR(30) NOT NULL,
    "plate_normalized" VARCHAR(30) NOT NULL,
    "previous_plate" VARCHAR(30),
    "vin" VARCHAR(40),
    "engine_number" VARCHAR(40),
    "category_id" UUID NOT NULL,
    "make" VARCHAR(80) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "manufacture_year" SMALLINT,
    "color" VARCHAR(40),
    "fuel_type" "FuelType",
    "transmission" "TransmissionType",
    "usage" "VehicleUsage" NOT NULL,
    "passenger_capacity" SMALLINT,
    "load_capacity_kg" DECIMAL(10,2),
    "current_owner_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "record_status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_records" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "end_date" TIMESTAMPTZ(3),
    "transfer_reason" VARCHAR(300),
    "transfer_ref" VARCHAR(80),
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ownership_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "certificate_number" VARCHAR(50) NOT NULL,
    "office_id" UUID NOT NULL,
    "registering_officer_id" UUID,
    "registered_at" TIMESTAMPTZ(3) NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3),
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(1000),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "pathname" VARCHAR(400) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "original_name" VARCHAR(255),
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by" UUID,
    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_photos" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "angle" "PhotoAngle" NOT NULL,
    "caption" VARCHAR(200),
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supporting_documents" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID,
    "owner_id" UUID,
    "file_id" UUID NOT NULL,
    "doc_type" "DocumentType" NOT NULL,
    "doc_number" VARCHAR(80),
    "issued_at" DATE,
    "expires_at" DATE,
    "notes" VARCHAR(500),
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "supporting_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_records" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "inspected_at" TIMESTAMPTZ(3) NOT NULL,
    "inspector_name" VARCHAR(200) NOT NULL,
    "result" "InspectionResult" NOT NULL,
    "certificate_number" VARCHAR(50),
    "valid_until" DATE,
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "inspection_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "tax_year" SMALLINT NOT NULL,
    "category_id" UUID,
    "usage" "VehicleUsage",
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ETB',
    "due_date" DATE NOT NULL,
    "allow_partial" BOOLEAN NOT NULL DEFAULT false,
    "source" "TaxRuleSource" NOT NULL DEFAULT 'CONFIGURED',
    "legal_reference" VARCHAR(500),
    "penalty_note" VARCHAR(1000),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_assessments" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "tax_year" SMALLINT NOT NULL,
    "tax_rule_id" UUID NOT NULL,
    "amount_due" DECIMAL(14,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "allow_partial" BOOLEAN NOT NULL,
    "exempted_at" TIMESTAMPTZ(3),
    "exempted_by" UUID,
    "exemption_reason" VARCHAR(500),
    "exemption_ref" VARCHAR(80),
    "under_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" VARCHAR(500),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" UUID,
    "cancelled_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "tax_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_payments" (
    "id" UUID NOT NULL,
    "payment_reference" VARCHAR(80) NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ETB',
    "method" "PaymentMethod" NOT NULL,
    "external_ref" VARCHAR(120),
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "collected_by" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "reversed_at" TIMESTAMPTZ(3),
    "reversed_by" UUID,
    "reversal_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tax_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_receipts" (
    "id" UUID NOT NULL,
    "receipt_number" VARCHAR(50) NOT NULL,
    "payment_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" UUID,
    "void_reason" VARCHAR(500),
    CONSTRAINT "tax_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "name" VARCHAR(50) NOT NULL,
    "prefix" VARCHAR(20) NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT '1',
    "padding" SMALLINT NOT NULL DEFAULT 6,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "verification_events" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "officer_id" UUID NOT NULL,
    "plate_query" VARCHAR(40) NOT NULL,
    "plate_normalized" VARCHAR(30) NOT NULL,
    "vehicle_id" UUID,
    "statuses" TEXT[] NOT NULL,
    "reason" VARCHAR(300),
    "location" VARCHAR(200),
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_requests" (
    "id" UUID NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "plate_query" VARCHAR(40),
    "vehicle_id" UUID,
    "verification_ref" VARCHAR(40),
    "submitted_by" UUID NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" UUID,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(64),
    "portal" "Portal" NOT NULL,
    "ip_hash" CHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(500),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(120) NOT NULL,
    "window_start" TIMESTAMPTZ(0) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_staff_number_key" ON "users"("staff_number");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "registration_offices_code_key" ON "registration_offices"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_categories_code_key" ON "vehicle_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "owners_photo_file_id_key" ON "owners"("photo_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_certificate_number_key" ON "registrations"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_pathname_key" ON "stored_files"("pathname");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_photos_file_id_key" ON "vehicle_photos"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "supporting_documents_file_id_key" ON "supporting_documents"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_records_certificate_number_key" ON "inspection_records"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "tax_payments_payment_reference_key" ON "tax_payments"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_assessment_id_key" ON "payment_allocations"("payment_id", "assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_receipts_receipt_number_key" ON "tax_receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "tax_receipts_payment_id_key" ON "tax_receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_events_reference_key" ON "verification_events"("reference");

-- CreateIndex
CREATE INDEX "users_office_id_idx" ON "users"("office_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "owners_search_name_idx" ON "owners"("search_name");

-- CreateIndex
CREATE INDEX "owners_business_reg_number_idx" ON "owners"("business_reg_number");

-- CreateIndex
CREATE INDEX "owners_national_id_ref_idx" ON "owners"("national_id_ref");

-- CreateIndex
CREATE INDEX "owners_owner_type_idx" ON "owners"("owner_type");

-- CreateIndex
CREATE INDEX "vehicles_plate_normalized_idx" ON "vehicles"("plate_normalized");

-- CreateIndex
CREATE INDEX "vehicles_vin_idx" ON "vehicles"("vin");

-- CreateIndex
CREATE INDEX "vehicles_engine_number_idx" ON "vehicles"("engine_number");

-- CreateIndex
CREATE INDEX "vehicles_category_id_idx" ON "vehicles"("category_id");

-- CreateIndex
CREATE INDEX "vehicles_current_owner_id_idx" ON "vehicles"("current_owner_id");

-- CreateIndex
CREATE INDEX "vehicles_office_id_idx" ON "vehicles"("office_id");

-- CreateIndex
CREATE INDEX "vehicles_record_status_idx" ON "vehicles"("record_status");

-- CreateIndex
CREATE INDEX "vehicles_created_at_idx" ON "vehicles"("created_at");

-- CreateIndex
CREATE INDEX "ownership_records_vehicle_id_start_date_idx" ON "ownership_records"("vehicle_id", "start_date");

-- CreateIndex
CREATE INDEX "ownership_records_owner_id_idx" ON "ownership_records"("owner_id");

-- CreateIndex
CREATE INDEX "registrations_vehicle_id_registered_at_idx" ON "registrations"("vehicle_id", "registered_at");

-- CreateIndex
CREATE INDEX "registrations_status_idx" ON "registrations"("status");

-- CreateIndex
CREATE INDEX "registrations_valid_until_idx" ON "registrations"("valid_until");

-- CreateIndex
CREATE INDEX "registrations_registered_at_idx" ON "registrations"("registered_at");

-- CreateIndex
CREATE INDEX "vehicle_photos_vehicle_id_idx" ON "vehicle_photos"("vehicle_id");

-- CreateIndex
CREATE INDEX "supporting_documents_vehicle_id_idx" ON "supporting_documents"("vehicle_id");

-- CreateIndex
CREATE INDEX "supporting_documents_owner_id_idx" ON "supporting_documents"("owner_id");

-- CreateIndex
CREATE INDEX "inspection_records_vehicle_id_inspected_at_idx" ON "inspection_records"("vehicle_id", "inspected_at");

-- CreateIndex
CREATE INDEX "tax_rules_tax_year_is_active_idx" ON "tax_rules"("tax_year", "is_active");

-- CreateIndex
CREATE INDEX "tax_rules_category_id_idx" ON "tax_rules"("category_id");

-- CreateIndex
CREATE INDEX "tax_assessments_vehicle_id_tax_year_idx" ON "tax_assessments"("vehicle_id", "tax_year");

-- CreateIndex
CREATE INDEX "tax_assessments_tax_year_idx" ON "tax_assessments"("tax_year");

-- CreateIndex
CREATE INDEX "tax_assessments_due_date_idx" ON "tax_assessments"("due_date");

-- CreateIndex
CREATE INDEX "tax_payments_vehicle_id_paid_at_idx" ON "tax_payments"("vehicle_id", "paid_at");

-- CreateIndex
CREATE INDEX "tax_payments_paid_at_idx" ON "tax_payments"("paid_at");

-- CreateIndex
CREATE INDEX "tax_payments_status_idx" ON "tax_payments"("status");

-- CreateIndex
CREATE INDEX "tax_payments_collected_by_idx" ON "tax_payments"("collected_by");

-- CreateIndex
CREATE INDEX "payment_allocations_assessment_id_idx" ON "payment_allocations"("assessment_id");

-- CreateIndex
CREATE INDEX "tax_receipts_issued_at_idx" ON "tax_receipts"("issued_at");

-- CreateIndex
CREATE INDEX "verification_events_officer_id_created_at_idx" ON "verification_events"("officer_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_events_vehicle_id_created_at_idx" ON "verification_events"("vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_events_plate_normalized_idx" ON "verification_events"("plate_normalized");

-- CreateIndex
CREATE INDEX "verification_events_created_at_idx" ON "verification_events"("created_at");

-- CreateIndex
CREATE INDEX "review_requests_status_created_at_idx" ON "review_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_requests_vehicle_id_idx" ON "review_requests"("vehicle_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "registration_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "registration_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_owner_id_fkey" FOREIGN KEY ("current_owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "registration_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "registration_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supporting_documents" ADD CONSTRAINT "supporting_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supporting_documents" ADD CONSTRAINT "supporting_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supporting_documents" ADD CONSTRAINT "supporting_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_records" ADD CONSTRAINT "inspection_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vehicle_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_assessments" ADD CONSTRAINT "tax_assessments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_assessments" ADD CONSTRAINT "tax_assessments_tax_rule_id_fkey" FOREIGN KEY ("tax_rule_id") REFERENCES "tax_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "registration_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "tax_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "tax_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_receipts" ADD CONSTRAINT "tax_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "tax_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
