/**
 * Plate-number normalization for EXACT lookup.
 *
 * Only presentation differences are removed:
 *  - Unicode normalized to NFC (so Ethiopic characters compare reliably)
 *  - Latin letters upper-cased
 *  - all whitespace removed (spaces, tabs, non-breaking spaces)
 *  - dash look-alikes (– — ‐ − etc.) unified to "-"
 *
 * Meaningful characters (letters, digits, Ethiopic syllables, "-", ".")
 * are KEPT. "3-AA 12345" and "3-aa12345" match; "3AA12345" does NOT
 * match "3-AA12345" because the hyphen is part of the plate.
 */
const DASHES = /[‐‑‒–—―−﹘﹣－]/g;
const WHITESPACE = /[\s  -​  　﻿]+/g;
/** Latin letters, digits, Ethiopic block, hyphen, dot. */
const ALLOWED = /^[A-Z0-9ሀ-፿.\-]+$/u;

export const PLATE_MAX_LENGTH = 30;

export function normalizePlate(input: string): string {
  return input
    .normalize("NFC")
    .replace(DASHES, "-")
    .replace(WHITESPACE, "")
    .toUpperCase();
}

export type PlateCheck =
  | { ok: true; normalized: string }
  | { ok: false; error: "EMPTY" | "TOO_LONG" | "INVALID_CHARACTERS" };

export function checkPlate(input: string): PlateCheck {
  const normalized = normalizePlate(input ?? "");
  if (normalized.length === 0) return { ok: false, error: "EMPTY" };
  if (normalized.length > PLATE_MAX_LENGTH) return { ok: false, error: "TOO_LONG" };
  if (!ALLOWED.test(normalized)) return { ok: false, error: "INVALID_CHARACTERS" };
  return { ok: true, normalized };
}

/** VIN / chassis / engine numbers: upper-case, no whitespace. */
export function normalizeIdentifier(input: string): string {
  return input.normalize("NFC").replace(WHITESPACE, "").toUpperCase();
}

/** Owner name search key: NFC, lower-case, single spaces. */
export function normalizeName(input: string): string {
  return input.normalize("NFC").replace(WHITESPACE, " ").trim().toLowerCase();
}
