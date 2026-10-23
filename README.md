# DDS Vehicle Registration, Verification & Tax Management System

Two independently deployable Next.js applications sharing one protected Supabase Postgres database:

| App | Users | Purpose |
|---|---|---|
| `apps/registration-portal` | Registration officers, supervisors, finance, auditors, admins | Vehicles, owners, registrations, documents, annual tax, reports |
| `apps/verification-portal` | Police / verification officers | Plate-number lookup with role-filtered results |

**Stack:** Next.js (App Router, TypeScript) · Supabase Postgres · Prisma 7 · Supabase Auth (identity only) · Vercel Private Blob · Zod · Tailwind / shadcn/ui · Vercel.

> ⚠️ **Tax rates are not built in.** Every rate, due date and partial-payment rule is configured by an authorized administrator. Rules start as `CONFIGURED`; only a rule with a cited legal reference and an approver can be marked `VERIFIED_OFFICIAL`. The seed's demo rule is labelled *“not an official rate”*.

---

## Build status

| Stage | Status |
|---|---|
| 1. Architecture, database schema, migrations, seed | ✅ Done |
| 2. Shared domain logic (plate normalization, tax status, verification statuses, RBAC matrix) | ✅ Done, unit-tested |
| 3. Authentication (Supabase) + server-side authorization | ⏳ Next |
| 4–7. Registration portal, CRUD, uploads, tax module | ⏳ |
| 8–9. Verification portal | ⏳ |
| 10–14. Reports, localization, animations, E2E tests, deployment | ⏳ |

---

## Repository layout

```
apps/
  registration-portal/     (stage 3+)
  verification-portal/     (stage 8+)
packages/
  database/    Prisma schema, SQL migrations, seed, Postgres client, DB-level tests
  auth/        Permission catalogue, role matrix, portal permission filter
  domain/      Exact money math, tax-status & verification-status rules
  validation/  Plate normalization + Zod schemas (error messages are i18n keys)
```

## Security model (summary)

- **Identity** — Supabase Auth (password, reset, MFA). Admin, supervisor, finance and auditor roles require MFA.
- **Authorization** — roles/permissions live in Postgres and are checked **on the server** for every action. A verification-portal deployment drops every non-`verify.*` permission, so even a super admin cannot reach registration data through it.
- **Database guarantees** (migration `…_integrity_rules`, tested against real Postgres):
  - one active vehicle per normalized plate and per VIN; one current owner per vehicle; one assessment per vehicle per year
  - payments, receipts, registrations, vehicles and ownership history cannot be deleted; payment amounts are immutable; reversals need a reason
  - allocations can never exceed the assessed amount
  - audit logs and verification events are append-only
  - optional `dds_verifier` DB role with read-mostly grants for the verification portal
- **Files** — Vercel *Private* Blob; only pathnames are stored; access via short-lived signed URLs.
- **Tax status** is always computed from posted payment allocations — never from the existence of a registration.

## Local development

Requirements: Node ≥ 20.19, pnpm 10.

```bash
pnpm install
cp .env.example packages/database/.env     # fill in Supabase values
pnpm db:generate
pnpm db:deploy                             # apply migrations
SEED_DEMO_DATA=true pnpm db:seed           # roles, offices, categories, demo vehicles
pnpm test                                  # unit + database tests (no external services needed)
pnpm typecheck
```

Link your first administrator: create the user in Supabase Auth, then

```bash
SEED_ADMIN_AUTH_ID=<supabase-user-uuid> SEED_ADMIN_EMAIL=you@example.com pnpm db:seed
```

## Database notes

- Money: `DECIMAL(14,2)`; application math uses integer cents (`@dds/domain`).
- Timestamps: `timestamptz`, stored in UTC, displayed in `OFFICE_TIMEZONE` (default `Africa/Addis_Ababa`).
- Receipt and verification numbers come from `number_sequences`, incremented inside the business transaction.
- Migrations: `20261023000000_init` (generated from `schema.prisma`, verified in CI by a schema-dump comparison), `20261023000100_integrity_rules` (constraints/triggers) and `20261023000200_access_roles_rls` (RLS on every table, Data API closed to `anon`/`authenticated`, per-portal DB roles).

### Backups

Supabase takes daily backups (Point-in-Time Recovery is a paid add-on). Before every production migration take a manual backup; for off-site copies run a scheduled `pg_dump --format=custom` to separate storage.

---

Deployment instructions for both Vercel projects will be completed with the portals (stages 3–9).
