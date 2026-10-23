import { describe, it, expect } from "vitest";
import { normalizePlate, checkPlate } from "./plate";
import { vehicleInputSchema, taxRuleInputSchema } from "./schemas";

describe("normalizePlate — exact lookup after normalization", () => {
  it("removes spacing and upper-cases letters", () => {
    expect(normalizePlate(" 3-aa  12345 ")).toBe("3-AA12345");
    expect(normalizePlate("3-AA 12345")).toBe(normalizePlate("3-aa12345"));
  });
  it("keeps meaningful characters (hyphen, dot, Ethiopic)", () => {
    expect(normalizePlate("3AA12345")).not.toBe(normalizePlate("3-AA12345"));
    expect(normalizePlate("ኢት 3 አ.አ 12345")).toBe("ኢት3አ.አ12345");
  });
  it("unifies dash look-alikes and non-breaking spaces", () => {
    expect(normalizePlate("3–AA 12345")).toBe("3-AA12345");
  });
  it("rejects empty, too long and invalid input", () => {
    expect(checkPlate("   ")).toEqual({ ok: false, error: "EMPTY" });
    expect(checkPlate("A".repeat(31))).toEqual({ ok: false, error: "TOO_LONG" });
    expect(checkPlate("3-AA'; DROP TABLE")).toEqual({ ok: false, error: "INVALID_CHARACTERS" });
    expect(checkPlate("3-AA 12345")).toEqual({ ok: true, normalized: "3-AA12345" });
  });
});

describe("schemas", () => {
  const base = {
    plateNumber: "3-AA 12345",
    categoryId: "6f1c4c6e-6a0b-4b7a-9d55-0a0c1d9b8e11",
    make: "Toyota",
    model: "Hilux",
    usage: "PRIVATE",
    currentOwnerId: "6f1c4c6e-6a0b-4b7a-9d55-0a0c1d9b8e12",
    officeId: "6f1c4c6e-6a0b-4b7a-9d55-0a0c1d9b8e13",
  };
  it("accepts a valid vehicle", () => {
    expect(vehicleInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a vehicle with an invalid plate", () => {
    expect(vehicleInputSchema.safeParse({ ...base, plateNumber: "<script>" }).success).toBe(false);
  });
  it("money must be a decimal string, not a float with 3 decimals", () => {
    const r = taxRuleInputSchema.safeParse({ name: "x", taxYear: 2026, amount: "10.555", dueDate: "2026-12-31" });
    expect(r.success).toBe(false);
  });
  it("VERIFIED_OFFICIAL rule requires a legal reference", () => {
    const r = taxRuleInputSchema.safeParse({
      name: "Private cars", taxYear: 2026, amount: "100.00", dueDate: "2026-12-31", source: "VERIFIED_OFFICIAL",
    });
    expect(r.success).toBe(false);
  });
});
