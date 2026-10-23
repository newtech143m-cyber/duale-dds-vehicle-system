import "server-only";
import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import { ForbiddenError, type PermissionCode } from "@dds/auth";
import { UserError } from "./core";
import { getI18n } from "./i18n";
import { assertStaff, type Staff } from "./session";

export type ActionResult = { ok: boolean; message?: string; tone?: "ok" | "bad" | "warn" } | null;

const FALLBACK: Record<string, string> = {
  "validation.required": "Required field missing.",
  "validation.reasonTooShort": "Please give a reason (at least 10 characters).",
  "validation.fileType": "Unsupported file type. Use JPG, PNG, WEBP or PDF.",
  "validation.fileTooLarge": "File is too large.",
  "validation.fileRequired": "Choose a file.",
  "validation.archived": "This record is archived.",
  "validation.useTransfer": "Use 'Transfer ownership' to change the owner.",
  "validation.sameOwner": "The vehicle already belongs to this owner.",
  "validation.alreadyAssessed": "This vehicle is already assessed for that year.",
  "validation.duplicateReference": "This payment reference was already used.",
  "validation.duplicateEmail": "A staff member with this email already exists.",
  "validation.duplicateBusinessReg": "An active business owner with this registration number exists.",
  "validation.payment.EXCEEDS_BALANCE": "Amount is more than the outstanding balance.",
  "validation.payment.PARTIAL_NOT_ALLOWED": "Partial payments are not allowed by this rule. Enter the full balance.",
  "validation.payment.NOT_PAYABLE": "Nothing is payable on this assessment.",
  "validation.payment.NON_POSITIVE": "Enter an amount greater than zero.",
  "validation.noOffice": "Your account has no office assigned. Ask the administrator.",
  "validation.ownerHasVehicles": "This owner still has active vehicles.",
  "validation.alreadyReversed": "This payment was already reversed.",
  "validation.cannotEditSelf": "You cannot change your own account here.",
  "validation.roleRequired": "Select at least one valid role.",
  "validation.reasonRequired": "A reason is required for this search.",
  "validation.plate.EMPTY": "Enter a plate number.",
  "validation.plate.TOO_LONG": "Plate number is too long.",
  "validation.plate.INVALID_CHARACTERS": "Plate number contains characters that are not allowed.",
  "validation.money": "Enter an amount like 1500 or 1500.50.",
  "validation.email": "Enter a valid email.",
  "validation.phone": "Enter a valid phone number.",
  "validation.dateOrder": "End date must be after start date.",
  "validation.duplicate": "This record already exists.",
  "validation.tax.legalReferenceRequired": "A verified rule must cite the official regulation.",
  "validation.invalidAssessment": "Assessment does not match this vehicle.",
};

async function message(key: string) {
  const { t } = await getI18n();
  const translated = t(key);
  return translated === key ? (FALLBACK[key] ?? t("common.error")) : translated;
}

/**
 * Wrap a server action: authenticate + authorize on the server, run, and turn
 * known errors into a translated, user-safe message (no stack traces).
 */
export async function runAction(
  permission: PermissionCode,
  fn: (staff: Staff) => Promise<string | void>,
): Promise<ActionResult> {
  try {
    const staff = await assertStaff(permission);
    const okKey = await fn(staff);
    return { ok: true, message: await message(okKey ?? "common.saved") };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() propagate
    if (e instanceof ForbiddenError) return { ok: false, message: await message("common.forbidden") };
    if (e instanceof UserError) return { ok: false, message: await message(e.key) };
    if (e instanceof ZodError) {
      const first = e.issues[0];
      const field = first?.path.join(".");
      const msg = await message(first?.message ?? "validation.required");
      return { ok: false, message: field ? `${msg} (${field})` : msg };
    }
    console.error("[action]", e);
    return { ok: false, message: await message("common.error") };
  }
}

/** FormData → plain object; empty strings become undefined; checkboxes → boolean. */
export function formObject(data: FormData, booleans: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of data.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string") {
      if (v.trim() === "") continue;
      if (out[k] !== undefined) out[k] = ([] as unknown[]).concat(out[k], v);
      else out[k] = v;
    }
  }
  for (const b of booleans) out[b] = data.get(b) === "on" || data.get(b) === "true";
  return out;
}
