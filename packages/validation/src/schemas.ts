import { z } from "zod";
import { checkPlate, PLATE_MAX_LENGTH } from "./plate";

// Error messages are i18n KEYS, translated by the UI (en / so / am).

const optionalText = (max: number) =>
  z.string().trim().max(max, { error: "validation.tooLong" }).optional().or(z.literal("").transform(() => undefined));

/** Decimal money as a string with at most 2 decimals — never a JS float. */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, { error: "validation.money" });

export const plateSchema = z
  .string()
  .max(PLATE_MAX_LENGTH + 10, { error: "validation.plate.tooLong" })
  .superRefine((v, ctx) => {
    const r = checkPlate(v);
    if (!r.ok) ctx.addIssue({ code: "custom", message: `validation.plate.${r.error}` });
  });

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, { error: "validation.phone" });

const currentYear = new Date().getUTCFullYear();

export const vehicleInputSchema = z.object({
  plateNumber: plateSchema,
  previousPlate: optionalText(30),
  vin: optionalText(40),
  engineNumber: optionalText(40),
  categoryId: z.uuid({ error: "validation.required" }),
  make: z.string().trim().min(1, { error: "validation.required" }).max(80),
  model: z.string().trim().min(1, { error: "validation.required" }).max(80),
  manufactureYear: z.coerce.number().int().min(1900).max(currentYear + 1).optional(),
  color: optionalText(40),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "HYBRID", "LPG", "OTHER"]).optional(),
  transmission: z.enum(["MANUAL", "AUTOMATIC", "OTHER"]).optional(),
  usage: z.enum(["PRIVATE", "COMMERCIAL", "PUBLIC_TRANSPORT", "GOVERNMENT", "NGO", "DIPLOMATIC", "OTHER"]),
  passengerCapacity: z.coerce.number().int().min(0).max(500).optional(),
  loadCapacityKg: moneySchema.optional(),
  currentOwnerId: z.uuid({ error: "validation.required" }),
  officeId: z.uuid({ error: "validation.required" }),
});
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

const ownerBase = {
  phone: phoneSchema.optional(),
  email: z.email({ error: "validation.email" }).optional().or(z.literal("").transform(() => undefined)),
  address: optionalText(300),
  locality: optionalText(120),
  notes: optionalText(1000),
};

export const ownerInputSchema = z.discriminatedUnion("ownerType", [
  z.object({
    ownerType: z.literal("INDIVIDUAL"),
    fullLegalName: z.string().trim().min(2, { error: "validation.required" }).max(200),
    nationalIdRef: optionalText(50),
    ...ownerBase,
  }),
  z.object({
    ownerType: z.literal("BUSINESS"),
    businessName: z.string().trim().min(2, { error: "validation.required" }).max(200),
    businessRegNumber: z.string().trim().min(1, { error: "validation.required" }).max(60),
    authorizedRepName: z.string().trim().min(2, { error: "validation.required" }).max(200),
    authorizedRepPhone: phoneSchema.optional(),
    ...ownerBase,
  }),
]);
export type OwnerInput = z.infer<typeof ownerInputSchema>;

export const registrationInputSchema = z
  .object({
    vehicleId: z.uuid(),
    certificateNumber: z.string().trim().min(1, { error: "validation.required" }).max(50),
    officeId: z.uuid(),
    registeredAt: z.coerce.date(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date().optional(),
    notes: optionalText(1000),
  })
  .refine((r) => !r.validUntil || r.validUntil > r.validFrom, {
    path: ["validUntil"],
    error: "validation.dateOrder",
  });
export type RegistrationInput = z.infer<typeof registrationInputSchema>;

export const ownershipTransferSchema = z.object({
  vehicleId: z.uuid(),
  newOwnerId: z.uuid(),
  transferDate: z.coerce.date(),
  transferReason: z.string().trim().min(3, { error: "validation.required" }).max(300),
  transferRef: optionalText(80),
});

export const taxRuleInputSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    taxYear: z.coerce.number().int().min(2000).max(2100),
    categoryId: z.uuid().optional(),
    usage: z.enum(["PRIVATE", "COMMERCIAL", "PUBLIC_TRANSPORT", "GOVERNMENT", "NGO", "DIPLOMATIC", "OTHER"]).optional(),
    amount: moneySchema,
    dueDate: z.coerce.date(),
    allowPartial: z.boolean().default(false),
    source: z.enum(["CONFIGURED", "VERIFIED_OFFICIAL"]).default("CONFIGURED"),
    legalReference: optionalText(500),
    penaltyNote: optionalText(1000),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .refine((r) => r.source !== "VERIFIED_OFFICIAL" || (r.legalReference && r.legalReference.length >= 3), {
    path: ["legalReference"],
    error: "validation.tax.legalReferenceRequired",
  });

export const taxPaymentInputSchema = z.object({
  vehicleId: z.uuid(),
  assessmentId: z.uuid(),
  amount: moneySchema.refine((v) => Number(v) > 0, { error: "validation.money.positive" }),
  method: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"]),
  paymentReference: z.string().trim().min(3).max(80),
  externalRef: optionalText(120),
  paidAt: z.coerce.date(),
});
export type TaxPaymentInput = z.infer<typeof taxPaymentInputSchema>;

export const exemptionInputSchema = z.object({
  assessmentId: z.uuid(),
  reason: z.string().trim().min(10, { error: "validation.reasonTooShort" }).max(500),
  exemptionRef: optionalText(80),
});

export const reversalInputSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(10, { error: "validation.reasonTooShort" }).max(500),
});

export const verifySearchSchema = z.object({
  plate: plateSchema,
  reason: optionalText(300),
  location: optionalText(200),
});

export const reviewRequestSchema = z.object({
  plateQuery: z.string().trim().max(40).optional(),
  verificationRef: z.string().trim().max(40).optional(),
  description: z.string().trim().min(10, { error: "validation.reasonTooShort" }).max(2000),
});

/** Allowed upload types and sizes (also re-checked server-side by magic bytes). */
export const UPLOAD_LIMITS = {
  photo: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 },
  document: { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024 },
} as const;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(100).optional(),
});
