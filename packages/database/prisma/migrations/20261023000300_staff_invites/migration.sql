-- Staff can be pre-registered by email before their first sign-in.
-- auth_user_id is linked on first successful Supabase login (matched by email).
ALTER TABLE "users" ALTER COLUMN "auth_user_id" DROP NOT NULL;
