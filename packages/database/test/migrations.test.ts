/**
 * Applies every migration to a real (in-process) Postgres and checks that the
 * database itself enforces the rules — even if application code has a bug.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../prisma/migrations");
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let db: PGlite;

const insertVehicle = (n: number, plate: string, norm: string) => `
  INSERT INTO vehicles (id, plate_number, plate_normalized, category_id, make, model, usage, current_owner_id, office_id, updated_at)
  VALUES ('${id(n)}','${plate}','${norm}','${id(2)}','Toyota','Hilux','PRIVATE','${id(3)}','${id(1)}',now());`;

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  for (const m of fs.readdirSync(migrationsDir).filter((d) => /^\d+_/.test(d)).sort()) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, m, "migration.sql"), "utf8"));
  }
  await db.exec(`
    INSERT INTO registration_offices (id, code, name, region, updated_at) VALUES ('${id(1)}','JJG','Jigjiga','Somali',now());
    INSERT INTO vehicle_categories (id, code, name, updated_at) VALUES ('${id(2)}','CAR','Car',now());
    INSERT INTO owners (id, owner_type, full_legal_name, search_name, updated_at) VALUES ('${id(3)}','INDIVIDUAL','Ahmed Ali','ahmed ali',now());
    INSERT INTO users (id, auth_user_id, email, full_name, updated_at) VALUES ('${id(9)}','${id(99)}','o@x.et','Officer',now());
    ${insertVehicle(4, "3-AA 12345", "3-AA12345")}
    INSERT INTO tax_rules (id, name, tax_year, amount, due_date, updated_at) VALUES ('${id(10)}','Cars 2026 (configured)',2026,1500.00,'2026-06-30',now());
    INSERT INTO tax_assessments (id, vehicle_id, tax_year, tax_rule_id, amount_due, due_date, allow_partial, updated_at)
      VALUES ('${id(11)}','${id(4)}',2026,'${id(10)}',1500.00,'2026-06-30',false,now());
  `);
}, 60_000);

describe("vehicle identity", () => {
  it("rejects a duplicate active plate", async () => {
    await expect(db.exec(insertVehicle(5, "3-aa12345", "3-AA12345"))).rejects.toThrow(/vehicles_active_plate_uq/);
  });
  it("blocks hard deletes of vehicles", async () => {
    await expect(db.exec(`DELETE FROM vehicles WHERE id='${id(4)}'`)).rejects.toThrow(/not allowed/);
  });
  it("allows reusing a plate only after the old record is archived", async () => {
    await db.exec(insertVehicle(20, "9-BB 1", "9-BB1"));
    await db.exec(`UPDATE vehicles SET archived_at = now() WHERE id='${id(20)}'`);
    await expect(db.exec(insertVehicle(21, "9-BB 1", "9-BB1"))).resolves.toBeDefined();
  });
});

describe("owners & ownership", () => {
  it("business owners require name + registration number", async () => {
    await expect(
      db.exec(`INSERT INTO owners (id, owner_type, business_name, search_name, updated_at) VALUES ('${id(6)}','BUSINESS','Co','co',now())`),
    ).rejects.toThrow(/owners_type_fields_chk/);
  });
  it("only one current owner per vehicle", async () => {
    await db.exec(`INSERT INTO ownership_records (id, vehicle_id, owner_id, start_date) VALUES ('${id(7)}','${id(4)}','${id(3)}',now())`);
    await expect(
      db.exec(`INSERT INTO ownership_records (id, vehicle_id, owner_id, start_date) VALUES ('${id(8)}','${id(4)}','${id(3)}',now())`),
    ).rejects.toThrow(/ownership_records_one_current_uq/);
  });
});

describe("tax integrity", () => {
  it("a VERIFIED_OFFICIAL rule needs a legal reference and approver", async () => {
    await expect(
      db.exec(`INSERT INTO tax_rules (id, name, tax_year, amount, due_date, source, updated_at) VALUES ('${id(30)}','x',2026,100,'2026-06-30','VERIFIED_OFFICIAL',now())`),
    ).rejects.toThrow(/tax_rules_verified_reference_chk/);
  });
  it("one assessment per vehicle per year", async () => {
    await expect(
      db.exec(`INSERT INTO tax_assessments (id, vehicle_id, tax_year, tax_rule_id, amount_due, due_date, allow_partial, updated_at)
               VALUES ('${id(31)}','${id(4)}',2026,'${id(10)}',1500.00,'2026-06-30',false,now())`),
    ).rejects.toThrow(/tax_assessments_vehicle_year_uq/);
  });
  it("records a full payment, then blocks over-allocation", async () => {
    await db.exec(`
      INSERT INTO tax_payments (id, payment_reference, vehicle_id, office_id, amount, method, paid_at, collected_by)
        VALUES ('${id(12)}','PAY-1','${id(4)}','${id(1)}',1500.00,'CASH',now(),'${id(9)}');
      INSERT INTO payment_allocations (id, payment_id, assessment_id, amount) VALUES ('${id(13)}','${id(12)}','${id(11)}',1500.00);`);
    await db.exec(`INSERT INTO tax_payments (id, payment_reference, vehicle_id, office_id, amount, method, paid_at, collected_by)
                   VALUES ('${id(15)}','PAY-2','${id(4)}','${id(1)}',1.00,'CASH',now(),'${id(9)}')`);
    await expect(
      db.exec(`INSERT INTO payment_allocations (id, payment_id, assessment_id, amount) VALUES ('${id(16)}','${id(15)}','${id(11)}',1.00)`),
    ).rejects.toThrow(/exceeds assessment balance/);
  });
  it("payments are immutable and cannot be deleted", async () => {
    await expect(db.exec(`UPDATE tax_payments SET amount = 1 WHERE id='${id(12)}'`)).rejects.toThrow(/immutable/);
    await expect(db.exec(`DELETE FROM tax_payments WHERE id='${id(12)}'`)).rejects.toThrow(/not allowed/);
  });
  it("reversal requires a reason, then frees the balance", async () => {
    await expect(
      db.exec(`UPDATE tax_payments SET status='REVERSED', reversed_at=now(), reversed_by='${id(9)}' WHERE id='${id(12)}'`),
    ).rejects.toThrow(/tax_payments_reversal_chk/);
    await db.exec(`UPDATE tax_payments SET status='REVERSED', reversed_at=now(), reversed_by='${id(9)}', reversal_reason='Duplicate entry at counter 2' WHERE id='${id(12)}'`);
    await expect(
      db.exec(`INSERT INTO payment_allocations (id, payment_id, assessment_id, amount) VALUES ('${id(16)}','${id(15)}','${id(11)}',1.00)`),
    ).resolves.toBeDefined();
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    await db.exec(`INSERT INTO audit_logs (action, entity_type, entity_id, portal) VALUES ('vehicle.create','vehicle','x','REGISTRATION')`);
    await expect(db.exec(`UPDATE audit_logs SET action='x'`)).rejects.toThrow(/not allowed/);
    await expect(db.exec(`DELETE FROM audit_logs`)).rejects.toThrow(/not allowed/);
  });
});

describe("search", () => {
  it("fuzzy owner-name search finds near matches", async () => {
    const r = await db.query<{ full_legal_name: string }>(
      `SELECT full_legal_name FROM owners WHERE search_name OPERATOR(extensions.%) 'ahmad ali'`,
    );
    expect(r.rows.map((x) => x.full_legal_name)).toContain("Ahmed Ali");
  });
});

describe("access roles & row level security", () => {
  const asRole = async <T>(role: string, sql: string) => {
    await db.exec(`SET ROLE ${role}`);
    try {
      return await db.query<T>(sql);
    } finally {
      await db.exec(`RESET ROLE`);
    }
  };

  it("RLS is enabled on every table", async () => {
    const r = await db.query<{ tablename: string }>(
      `SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
    );
    expect(r.rows).toEqual([]);
  });

  it("a role without a policy (like Supabase anon) sees no rows even with SELECT", async () => {
    await db.exec(`CREATE ROLE test_anon NOLOGIN; GRANT USAGE ON SCHEMA public TO test_anon; GRANT SELECT ON owners TO test_anon;`);
    const r = await asRole<{ n: number }>("test_anon", `SELECT count(*)::int AS n FROM owners`);
    expect(r.rows[0]!.n).toBe(0);
  });

  it("dds_app can read and write but still cannot hard-delete financial rows", async () => {
    const r = await asRole<{ n: number }>("dds_app", `SELECT count(*)::int AS n FROM owners`);
    expect(r.rows[0]!.n).toBeGreaterThan(0);
    await expect(asRole("dds_app", `DELETE FROM tax_payments`)).rejects.toThrow(/permission denied|not allowed/);
  });

  it("dds_verifier can read and log searches but cannot edit records", async () => {
    await expect(asRole("dds_verifier", `SELECT count(*) FROM vehicles`)).resolves.toBeDefined();
    await expect(
      asRole("dds_verifier", `INSERT INTO verification_events (id, reference, officer_id, plate_query, plate_normalized, statuses)
                              VALUES ('${id(40)}','VER-T-1','${id(9)}','3-aa 12345','3-AA12345','{VERIFIED}')`),
    ).resolves.toBeDefined();
    await expect(asRole("dds_verifier", `UPDATE vehicles SET color='Red'`)).rejects.toThrow(/permission denied/);
    await expect(asRole("dds_verifier", `INSERT INTO tax_payments (id, payment_reference, vehicle_id, office_id, amount, method, paid_at, collected_by)
      VALUES ('${id(41)}','X','${id(4)}','${id(1)}',1,'CASH',now(),'${id(9)}')`)).rejects.toThrow(/permission denied/);
  });
});
