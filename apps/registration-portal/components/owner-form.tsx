"use client";

import { useState } from "react";
import type { Messages } from "@dds/i18n";
import { ButtonLink, Card, Field, Input, Textarea, cx } from "@dds/ui";
import { ActionForm, SubmitButton, type ActionResult } from "@dds/ui/client";

export interface OwnerDefaults {
  id?: string; ownerType?: "INDIVIDUAL" | "BUSINESS"; fullLegalName?: string | null; nationalIdRef?: string | null;
  businessName?: string | null; businessRegNumber?: string | null; authorizedRepName?: string | null; authorizedRepPhone?: string | null;
  phone?: string | null; email?: string | null; address?: string | null; locality?: string | null; notes?: string | null;
}

export function OwnerForm({ m, owner, action, next, canSeeNationalId }: {
  m: Messages; owner?: OwnerDefaults; next?: string; canSeeNationalId: boolean;
  action: (p: ActionResult, d: FormData) => Promise<ActionResult>;
}) {
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">(owner?.ownerType ?? "INDIVIDUAL");
  const o = owner ?? {};
  return (
    <ActionForm action={action}>
      {o.id && <input type="hidden" name="ownerId" value={o.id} />}
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="ownerType" value={type} />
      <div className="grid gap-6">
        <Card className="p-5">
          <div role="radiogroup" aria-label={m.owner.type} className="inline-flex rounded-lg bg-navy-50 p-1 mb-5">
            {(["INDIVIDUAL", "BUSINESS"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} disabled={!!o.id && o.ownerType !== t}
                onClick={() => setType(t)}
                className={cx("px-4 h-9 rounded-md text-sm font-medium transition", type === t ? "bg-white shadow-sm text-navy-900" : "text-muted hover:text-navy-800", "disabled:opacity-40")}>
                {t === "INDIVIDUAL" ? m.owner.individual : m.owner.business}
              </button>
            ))}
          </div>
          {type === "INDIVIDUAL" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={m.owner.fullName} required><Input name="fullLegalName" defaultValue={o.fullLegalName ?? ""} required minLength={2} maxLength={200} /></Field>
              {canSeeNationalId && <Field label={m.owner.nationalId}><Input name="nationalIdRef" defaultValue={o.nationalIdRef ?? ""} maxLength={50} /></Field>}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={m.owner.businessName} required><Input name="businessName" defaultValue={o.businessName ?? ""} required minLength={2} maxLength={200} /></Field>
              <Field label={m.owner.businessReg} required><Input name="businessRegNumber" defaultValue={o.businessRegNumber ?? ""} required maxLength={60} className="uppercase" /></Field>
              <Field label={m.owner.representative} required><Input name="authorizedRepName" defaultValue={o.authorizedRepName ?? ""} required minLength={2} maxLength={200} /></Field>
              <Field label={m.owner.representativePhone}><Input name="authorizedRepPhone" type="tel" defaultValue={o.authorizedRepPhone ?? ""} maxLength={20} /></Field>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={m.owner.phone}><Input name="phone" type="tel" defaultValue={o.phone ?? ""} maxLength={20} placeholder="+251 9…" /></Field>
            <Field label={m.owner.email}><Input name="email" type="email" defaultValue={o.email ?? ""} maxLength={254} /></Field>
            <Field label={m.owner.address}><Input name="address" defaultValue={o.address ?? ""} maxLength={300} /></Field>
            <Field label={m.owner.locality}><Input name="locality" defaultValue={o.locality ?? ""} maxLength={120} /></Field>
            <Field label={m.common.notes} className="sm:col-span-2"><Textarea name="notes" defaultValue={o.notes ?? ""} maxLength={1000} /></Field>
          </div>
        </Card>
        <div className="flex gap-3 justify-end">
          <ButtonLink variant="secondary" href={o.id ? `/owners/${o.id}` : "/owners"}>{m.common.cancel}</ButtonLink>
          <SubmitButton>{m.common.save}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
