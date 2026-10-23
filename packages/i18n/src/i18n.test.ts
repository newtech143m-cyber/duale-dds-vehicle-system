import { describe, it, expect } from "vitest";
import { en, so, am, getMessages, translate } from "./index";

function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe("i18n", () => {
  it("Somali and Amharic cover every English key", () => {
    const base = keys(en).sort();
    expect(keys(so).sort()).toEqual(base);
    expect(keys(am).sort()).toEqual(base);
  });
  it("defaults to Somali and falls back to the key for unknown entries", () => {
    expect(translate(getMessages(undefined), "status.PAID")).toBe("La bixiyay");
    expect(translate(getMessages("en"), "validation.unknown")).toBe("validation.unknown");
  });
});
