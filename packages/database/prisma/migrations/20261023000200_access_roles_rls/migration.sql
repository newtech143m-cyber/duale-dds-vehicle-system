-- =====================================================================
-- Database access roles + Row Level Security.
--
-- Why: on Supabase the `public` schema is reachable through the Data API
-- with the publishable (anon) key. This system never uses the Data API, so:
--   1. RLS is enabled on every table,
--   2. anon / authenticated get no privileges and no policies,
--   3. each portal connects with its own least-privilege role:
--        dds_app       → registration portal (read/write, no hard deletes)
--        dds_verifier  → verification portal (read + log searches only)
--
-- Login users are created OUTSIDE migrations (passwords never in git):
--   CREATE ROLE dds_registration_login LOGIN PASSWORD '…' IN ROLE dds_app;
--   CREATE ROLE dds_verification_login LOGIN PASSWORD '…' IN ROLE dds_verifier;
-- Portable: also runs on plain Postgres (CI / PGlite) where anon etc. don't exist.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dds_app') THEN
    CREATE ROLE dds_app NOLOGIN;
  END IF;
END$$;

-- Registration portal role
GRANT USAGE ON SCHEMA public TO dds_app;
GRANT USAGE ON SCHEMA extensions TO dds_app, dds_verifier;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO dds_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dds_app;
-- The only tables where rows are legitimately removed:
GRANT DELETE ON "rate_limit_buckets", "role_permissions" TO dds_app;
-- Auditors / app may never rewrite history: no DELETE elsewhere, and the
-- triggers in 20261023000100 block UPDATE/DELETE on append-only tables.

ALTER ROLE dds_app SET search_path = public, extensions;
ALTER ROLE dds_verifier SET search_path = public, extensions;

-- Trigger functions: pin search_path (Supabase security advisor).
ALTER FUNCTION dds_block_mutation() SET search_path = public;
ALTER FUNCTION dds_payment_guard() SET search_path = public;
ALTER FUNCTION dds_receipt_guard() SET search_path = public;
ALTER FUNCTION dds_allocation_cap() SET search_path = public;

-- Enable RLS everywhere and allow ONLY the two application roles.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS dds_app_access ON public.%I', t.tablename);
    EXECUTE format('CREATE POLICY dds_app_access ON public.%I FOR ALL TO dds_app USING (true) WITH CHECK (true)', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS dds_verifier_access ON public.%I', t.tablename);
    -- Table GRANTs (20261023000100) decide what the verifier can actually do.
    EXECUTE format('CREATE POLICY dds_verifier_access ON public.%I FOR ALL TO dds_verifier USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;
END$$;

-- Close the Supabase Data API path completely.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END$$;
